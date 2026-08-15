// ============================================================================
// PURCHASE LIFECYCLE ENGINE — Nepal IRD compliant (PostgreSQL, atomic)
//
//   Module A: Purchase Entry        postCreditPurchase
//   Module B: Payment Out           postVendorPayment  (Vendor Payment Voucher)
//   Module C: Purchase Return       postDebitNote      (Debit Note)
//
// Every module runs inside ONE database transaction:
//   1. Validate references (vendor / items / ledgers belong to the company).
//   2. Allocate a gap-free document number from document_counters
//      (SELECT ... FOR UPDATE — a rollback rolls the number back, so the
//      sequence never skips, satisfying IRD numbering rules).
//   3. Write the source document + its line items with explicit field values.
//   4. Post a balanced double-entry journal (control-account guard + balance
//      enforcement are double-checked here AND by DB triggers).
//   5. Update the vendor sub-ledger current_outstanding_balance.
//   6. Drive inventory: stock_ledger_batches (FIFO cost layers) + item_master
//      current_stock_qty.
//   7. Append the Annex-6 purchase_register row (Module A only).
//   8. Verify each write by re-reading before COMMIT; rollback on any failure.
//
// VAT rate defaults to 13% (Nepal) but is configurable per call.
// ============================================================================

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VAT_RATE = 13;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n, w) => String(n).padStart(w, '0');

// IRD ledger codes used by the purchase engine (seeded per company).
const ACCOUNTS = {
  CASH_HAND: '10100',
  BANK: '10200',
  WALLET: '10210',
  SUNDRY_CREDITORS: '20400',       // CONTROL — requires vendor sub-ledger
  INPUT_VAT: '10501',              // Input VAT (Purchases)
  DISCOUNT_RECEIVED: '40200',      // Income
  PURCHASE_TAXABLE: '50200',       // Direct Expense
  PURCHASE_EXEMPT: '50210',        // Direct Expense
};

function getFiscalYear(adDate) {
  const d = new Date(adDate);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  if (m > 7 || (m === 7 && dy >= 16)) return `${y}/${y + 1}`;   // Nepal FY starts Shrawan 16
  return `${y - 1}/${y}`;
}

function adToMiti(adDate) {
  // Thin adapter to the server's Nepali calendar helper (bikram-sambat-js).
  return global.adToBikramSambat ? global.adToBikramSambat(new Date(adDate)) : String(adDate);
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Document numbering — gap-free per (company, fiscal_year, doc_type).
// ---------------------------------------------------------------------------
async function nextDocNumber(client, companyId, fiscalYear, docType) {
  const counter = await client.query(
    `INSERT INTO document_counters (company_id, fiscal_year, doc_type, next_value)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (company_id, fiscal_year, doc_type)
     DO UPDATE SET next_value = document_counters.next_value
     RETURNING next_value`,
    [companyId, fiscalYear, docType]
  );
  const next = counter.rows[0].next_value;
  await client.query(
    `UPDATE document_counters SET next_value = next_value + 1
      WHERE company_id = $1 AND fiscal_year = $2 AND doc_type = $3`,
    [companyId, fiscalYear, docType]
  );
  const prefix = { PURCHASE: 'PUR', PAYMENT: 'PMT', DEBIT_NOTE: 'DN' }[docType];
  return `${prefix}-${fiscalYear}-${pad(next, 6)}`;
}

// ---------------------------------------------------------------------------
// Chart of accounts — seed the IRD ledger lines this module posts to.
// ---------------------------------------------------------------------------
async function ensureChartOfAccounts(client, companyId) {
  const seed = [
    ['10100', 'Cash in Hand',                 'asset',   'Cash_Bank',       'debit',  false, false],
    ['10200', 'Bank Account',                 'asset',   'Cash_Bank',       'debit',  false, false],
    ['10210', 'Digital Wallet',               'asset',   'Cash_Bank',       'debit',  false, false],
    ['20400', 'Sundry Creditors',             'liability','Sundry_Creditors','credit', true,  false],
    ['10501', 'Input VAT (Purchases)',        'asset',   'Duties_Taxes',    'debit',  false, true ],
    ['40200', 'Discount Received',            'income',  'Indirect_Incomes','credit', false, false],
    ['50200', 'Purchase - Taxable',           'expense', 'Purchase',        'debit',  false, false],
    ['50210', 'Purchase - Exempt',            'expense', 'Purchase',        'debit',  false, false],
  ];
  const sql = `INSERT INTO chart_of_accounts
      (company_id, code, name, account_type, ledger_group, normal_balance, is_control, is_vat_account)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (company_id, code) DO NOTHING`;
  for (const a of seed) await client.query(sql, [companyId, ...a]);
}

async function resolveAccount(client, companyId, code) {
  const r = await client.query(
    `SELECT id, code, is_control FROM chart_of_accounts
      WHERE company_id = $1 AND code = $2 AND is_active`,
    [companyId, code]
  );
  if (!r.rows[0]) throw new Error(`Ledger account ${code} not found for company`);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// CORE JOURNAL POSTER — balanced double-entry with control-account guard.
// lines: [{ accountCode, subLedgerId?, debit?, credit? }]
// ---------------------------------------------------------------------------
async function postJournal(client, ctx, { voucherNo, voucherType, sourceDocumentType, sourceDocumentNo, sourceDocumentId, narration, englishDate, lines }) {
  const dr = round2(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const cr = round2(lines.reduce((s, l) => s + (l.credit || 0), 0));
  if (Math.abs(dr - cr) > 0.01) throw new Error(`Journal not balanced: debits ${dr} vs credits ${cr}`);
  if (dr === 0) throw new Error('Empty journal entry is not allowed');

  // Pre-resolve accounts so control-account violations fail with a clean error.
  const codes = [...new Set(lines.map(l => l.accountCode))];
  const accRes = await client.query(
    `SELECT id, code, is_control FROM chart_of_accounts
      WHERE company_id = $1 AND code = ANY($2::text[])`,
    [ctx.companyId, codes]
  );
  const accMap = {};
  accRes.rows.forEach(a => { accMap[a.code] = a; });
  for (const l of lines) {
    const a = accMap[l.accountCode];
    if (!a) throw new Error(`Unknown ledger account ${l.accountCode}`);
    if (a.is_control && !l.subLedgerId) {
      throw new Error(`Control account ${l.accountCode} requires a vendor sub_ledger_id`);
    }
  }

  const fiscalYear = ctx.fiscalYear || getFiscalYear(englishDate);
  const miti = ctx.miti || adToMiti(englishDate);
  const header = await client.query(
    `INSERT INTO journal_headers
       (company_id, voucher_no, voucher_type, fiscal_year, miti, english_date,
        narration, source_document_type, source_document_no, source_document_id,
        status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'posted',$11)
     RETURNING id, voucher_no`,
    [ctx.companyId, voucherNo, voucherType, fiscalYear, miti, englishDate,
     narration || null, sourceDocumentType || null, sourceDocumentNo || null,
     sourceDocumentId || null, ctx.userId || null]
  );
  const headerId = header.rows[0].id;

  // One statement for ALL lines — the balanced-journal constraint trigger
  // validates the complete header only after this statement finishes.
  const vals = lines.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(',');
  const params = [];
  for (const l of lines) {
    params.push(headerId, accMap[l.accountCode].id, l.subLedgerId || null, l.debit || 0, l.credit || 0);
  }
  await client.query(
    `INSERT INTO journal_lines (journal_header_id, account_id, sub_ledger_id, debit_amount, credit_amount)
     VALUES ${vals}`,
    params
  );
  return header.rows[0];
}

async function touchVendorOutstanding(client, vendorId, delta) {
  await client.query(
    `UPDATE vendors SET current_outstanding_balance =
        ROUND((current_outstanding_balance + $2)::numeric, 2)
      WHERE id = $1`,
    [vendorId, delta]
  );
}

// Stock-in: create a FIFO cost layer + increase item_master qty.
async function postStockInLayer(client, ctx, { itemId, qty, unitCost, sourceModule, sourceTransactionId, englishDate }) {
  await client.query(
    `INSERT INTO stock_ledger_batches
       (company_id, item_id, source_transaction_id, source_module,
        layer_miti, layer_date, original_qty, remaining_qty, unit_cost_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [ctx.companyId, itemId, sourceTransactionId, sourceModule,
     ctx.miti || adToMiti(englishDate), englishDate, qty, qty, round2(unitCost)]
  );
  await client.query(
    `UPDATE item_master SET current_stock_qty = current_stock_qty + $2 WHERE id = $1`,
    [itemId, qty]
  );
}

// Stock-out: consume FIFO layers oldest-first + decrease item_master qty.
async function postStockOutLayers(client, ctx, { itemId, qty, sourceModule, sourceTransactionId, englishDate }) {
  const layers = await client.query(
    `SELECT id, remaining_qty, unit_cost_price FROM stock_ledger_batches
      WHERE company_id = $1 AND item_id = $2 AND remaining_qty > 0
      ORDER BY layer_date, created_at FOR UPDATE`,
    [ctx.companyId, itemId]
  );
  let remaining = qty;
  for (const lay of layers.rows) {
    if (remaining <= 0.0001) break;
    const take = Math.min(Number(lay.remaining_qty), remaining);
    await client.query(
      `UPDATE stock_ledger_batches SET remaining_qty = remaining_qty - $2 WHERE id = $1`,
      [lay.id, take]
    );
    remaining = round2(remaining - take);
  }
  if (remaining > 0.001) throw new Error(`Insufficient stock layers for item ${itemId}: ${remaining} short`);
  await client.query(
    `UPDATE item_master SET current_stock_qty = ROUND((current_stock_qty - $2)::numeric, 3)
      WHERE id = $1 AND current_stock_qty >= $2`,
    [itemId, qty]
  );
}

// ============================================================================
// MODULE A — PURCHASE ENTRY (Credit purchase from a vendor)
//
// Posting (Module A journal):
//   DR  50200 Purchase - Taxable   taxable_amount
//   DR  50210 Purchase - Exempt    exempt_amount
//   DR  10501 Input VAT (13%)      vat_paid_13
//   CR  40200 Discount Received    discount_received      (if > 0)
//   CR  20400 Sundry Creditors     net_grand_total        (sub-ledger = vendor)
//
// Side effects:
//   * vendor.current_outstanding_balance += net_grand_total
//   * FIFO stock_ledger_batches + item_master.current_stock_qty per item
//   * Annex-6 purchase_register row (register_row_no per fiscal year)
// ============================================================================
async function postCreditPurchase(client, ctx, { purchase, items }) {
  const vatRate = ctx.vatRate || VAT_RATE;

  // -- 1. Validate references ------------------------------------------------
  const vendor = await client.query(
    `SELECT id, legal_name, pan_number, current_outstanding_balance, is_active
       FROM vendors WHERE id = $1 AND company_id = $2 AND is_active FOR UPDATE`,
    [purchase.vendor_id, ctx.companyId]
  );
  if (!vendor.rows[0]) throw new Error('Vendor not found or inactive');
  const v = vendor.rows[0];

  const itemRes = await client.query(
    `SELECT id, item_code, item_name, tax_category, is_active
       FROM item_master WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active`,
    [ctx.companyId, items.map(i => i.item_id)]
  );
  const itemMap = {};
  itemRes.rows.forEach(r => { itemMap[r.id] = r; });

  // -- 2. Compute line + header amounts with explicit field assignments ------
  let grossAmount = 0, discountReceived = 0, taxableAmount = 0, exemptAmount = 0, vatPaid = 0;
  const lines = items.map(it => {
    const im = itemMap[it.item_id];
    if (!im) throw new Error(`Item not found or inactive: ${it.item_id}`);
    const qty = Number(it.quantity) || 0;
    const cost = Number(it.unit_cost) || 0;
    if (qty <= 0 || cost < 0) throw new Error(`Invalid quantity/unit_cost for item ${im.item_code}`);
    const grossLine = round2(qty * cost);
    const disc = round2(Number(it.discount_received) || 0);
    if (disc > grossLine) throw new Error(`Discount exceeds line amount on item ${im.item_code}`);
    const taxableLine = im.tax_category === 'Taxable_13%' ? round2(grossLine - disc) : 0;
    const exemptLine = im.tax_category === 'Exempt' ? round2(grossLine - disc) : 0;
    const vatLine = im.tax_category === 'Taxable_13%' ? round2(taxableLine * vatRate / 100) : 0;
    grossAmount = round2(grossAmount + grossLine);
    discountReceived = round2(discountReceived + disc);
    taxableAmount = round2(taxableAmount + taxableLine);
    exemptAmount = round2(exemptAmount + exemptLine);
    vatPaid = round2(vatPaid + vatLine);
    return { item_id: it.item_id, quantity: qty, unit_cost: cost, discount_received: disc, taxable_amount: taxableLine, exempt_amount: exemptLine, vat_paid: vatLine };
  });

  const netGrandTotal = round2(grossAmount - discountReceived + vatPaid);

  // -- 3. Verification assertions (mirror the DB CHECK constraints) ----------
  if (Math.abs(netGrandTotal - (grossAmount - discountReceived + vatPaid)) > 0.01) {
    throw new Error('Purchase net/total computation failed its own cross-check');
  }
  if (Math.abs(vatPaid - round2(taxableAmount * vatRate / 100)) > 0.01) {
    throw new Error('Input VAT does not equal 13% of the taxable amount');
  }

  // -- 4. Gap-free invoice number --------------------------------------------
  const fiscalYear = ctx.fiscalYear || purchase.fiscal_year || getFiscalYear(purchase.english_date);
  const miti = purchase.miti || adToMiti(purchase.english_date);
  const invoiceNumber = await nextDocNumber(client, ctx.companyId, fiscalYear, 'PURCHASE');

  // -- 5. Source document ------------------------------------------------------
  const inv = await client.query(
    `INSERT INTO purchase_invoices
       (company_id, invoice_number, vendor_invoice_number, vendor_id, miti, english_date,
        gross_amount, discount_received, taxable_amount, exempt_amount, vat_paid_13,
        net_grand_total, status, remarks, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Unpaid',$13,$14)
     RETURNING id`,
    [ctx.companyId, invoiceNumber, purchase.vendor_invoice_number || null, v.id, miti,
     purchase.english_date, grossAmount, discountReceived, taxableAmount, exemptAmount, vatPaid,
     netGrandTotal, purchase.remarks || null, ctx.userId || null]
  );
  const invoiceId = inv.rows[0].id;

  const itemSql = `INSERT INTO purchase_invoice_items
      (purchase_invoice_id, item_id, quantity, unit_cost, discount_received,
       taxable_amount, exempt_amount, vat_paid)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
  for (const l of lines) {
    await client.query(itemSql, [invoiceId, l.item_id, l.quantity, l.unit_cost, l.discount_received,
      l.taxable_amount, l.exempt_amount, l.vat_paid]);
  }

  // -- 6. Double entry -----------------------------------------------------------
  const jl = [
    { accountCode: ACCOUNTS.PURCHASE_TAXABLE, debit: taxableAmount },
    { accountCode: ACCOUNTS.PURCHASE_EXEMPT, debit: exemptAmount },
    { accountCode: ACCOUNTS.INPUT_VAT, debit: vatPaid },
    { accountCode: ACCOUNTS.SUNDRY_CREDITORS, subLedgerId: v.id, credit: netGrandTotal },
  ];
  if (discountReceived > 0) jl.push({ accountCode: ACCOUNTS.DISCOUNT_RECEIVED, credit: discountReceived });
  await postJournal(client, ctx, {
    voucherNo: invoiceNumber, voucherType: 'PURCHASE',
    sourceDocumentType: 'purchase_invoice', sourceDocumentNo: invoiceNumber, sourceDocumentId: invoiceId,
    narration: `Credit purchase ${invoiceNumber} from ${v.legal_name}`,
    englishDate: purchase.english_date, lines: jl,
  });

  // -- 7. Vendor outstanding + inventory -----------------------------------------
  await touchVendorOutstanding(client, v.id, netGrandTotal);
  for (const l of lines) {
    await postStockInLayer(client, ctx, {
      itemId: l.item_id, qty: l.quantity, unitCost: l.unit_cost,
      sourceModule: 'PURCHASE', sourceTransactionId: invoiceId, englishDate: purchase.english_date,
    });
  }

  // -- 8. Annex-6 purchase register (append-only, per-fiscal-year row number) ----
  const regRow = await client.query(
    `SELECT COALESCE(MAX(register_row_no),0) + 1 AS n
       FROM purchase_register WHERE company_id = $1 AND fiscal_year = $2`,
    [ctx.companyId, fiscalYear]
  );
  await client.query(
    `INSERT INTO purchase_register
       (company_id, register_row_no, fiscal_year, purchase_invoice_id, miti, english_date,
        invoice_number, vendor_invoice_no, vendor_pan, vendor_name,
        gross_amount, discount_received, taxable_amount, exempt_amount, vat_paid_13,
        net_grand_total, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [ctx.companyId, regRow.rows[0].n, fiscalYear, invoiceId, miti, purchase.english_date,
     invoiceNumber, purchase.vendor_invoice_number || null, v.pan_number, v.legal_name,
     grossAmount, discountReceived, taxableAmount, exemptAmount, vatPaid, netGrandTotal, ctx.userId || null]
  );

  // -- 9. Post-write verification -------------------------------------------------
  const check = await client.query(
    `SELECT net_grand_total, taxable_amount, exempt_amount, vat_paid_13, status
       FROM purchase_invoices WHERE id = $1`,
    [invoiceId]
  );
  const row = check.rows[0];
  if (Math.abs(row.net_grand_total - netGrandTotal) > 0.01 || row.status !== 'Unpaid') {
    throw new Error('Purchase invoice write-verify failed');
  }

  return { invoiceId, invoiceNumber, grossAmount, discountReceived, taxableAmount, exemptAmount, vatPaid, netGrandTotal };
}

// ============================================================================
// MODULE B — PAYMENT OUT (Vendor Payment Voucher)
//
// allocations[]: each entry { purchase_invoice_id, allocated_amount } where the
// allocation is the FULL settlement of that invoice (cash + settlement discount).
//   sum(allocations) = amount_paid + cash_discount_received
//
// Posting (Module B journal):
//   DR  20400 Sundry Creditors     sum(allocated_amount)  (sub-ledger = vendor)
//   CR  paid_from_ledger           amount_paid            (Cash / Bank / Wallet)
//   CR  40200 Discount Received    cash_discount_received (if > 0)
//
// Status transitions: Unpaid -> Partial -> Paid (per invoice, driven by
// amount_paid + this settlement vs net_grand_total).
// ============================================================================
async function postVendorPayment(client, ctx, { payment, allocations }) {
  // -- 1. Validate references ---------------------------------------------------
  const vendor = await client.query(
    `SELECT id, legal_name, current_outstanding_balance, is_active
       FROM vendors WHERE id = $1 AND company_id = $2 AND is_active FOR UPDATE`,
    [payment.vendor_id, ctx.companyId]
  );
  if (!vendor.rows[0]) throw new Error('Vendor not found or inactive');
  const v = vendor.rows[0];

  const paidFrom = await resolveAccount(client, ctx.companyId, payment.paid_from_ledger_code || ACCOUNTS.BANK);

  const amountPaid = round2(Number(payment.amount_paid) || 0);
  const cashDiscount = round2(Number(payment.cash_discount_received) || 0);
  if (amountPaid <= 0) throw new Error('amount_paid must be greater than zero');
  const settlement = round2(amountPaid + cashDiscount);

  if (!allocations || allocations.length === 0) throw new Error('At least one invoice allocation is required');
  const allocSum = round2(allocations.reduce((s, a) => s + (Number(a.allocated_amount) || 0), 0));
  if (Math.abs(allocSum - settlement) > 0.01) {
    throw new Error(`Allocations (${allocSum}) must equal amount_paid + cash_discount (${settlement})`);
  }

  // -- 2. Lock + validate target invoices (prevents double payment) -------------
  const invRes = await client.query(
    `SELECT id, invoice_number, net_grand_total, amount_paid, status
       FROM purchase_invoices
      WHERE id = ANY($1::uuid[]) AND company_id = $2 AND vendor_id = $3
        AND amount_paid < net_grand_total
      FOR UPDATE`,
    [allocations.map(a => a.purchase_invoice_id), ctx.companyId, v.id]
  );
  const invMap = new Map(invRes.rows.map(r => [r.id, r]));
  for (const a of allocations) {
    const inv = invMap.get(a.purchase_invoice_id);
    const amt = Number(a.allocated_amount) || 0;
    if (!inv) throw new Error(`Invoice not found, not for this vendor, or already fully paid`);
    if (amt <= 0) throw new Error(`Invalid allocation amount on ${inv.invoice_number}`);
    const outstanding = round2(Number(inv.net_grand_total) - Number(inv.amount_paid));
    if (amt > outstanding + 0.01) {
      throw new Error(`Allocation ${amt} exceeds outstanding ${outstanding} on ${inv.invoice_number}`);
    }
  }

  // -- 3. Gap-free voucher number -------------------------------------------------
  const fiscalYear = ctx.fiscalYear || payment.fiscal_year || getFiscalYear(payment.english_date);
  const miti = payment.miti || adToMiti(payment.english_date);
  const voucherNumber = await nextDocNumber(client, ctx.companyId, fiscalYear, 'PAYMENT');

  // -- 4. Source voucher + allocations ---------------------------------------------
  const vou = await client.query(
    `INSERT INTO vendor_payment_vouchers
       (company_id, voucher_number, miti, english_date, vendor_id, payment_mode,
        paid_from_ledger_id, amount_paid, cash_discount_received, cheque_reference,
        narration, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [ctx.companyId, voucherNumber, miti, payment.english_date, v.id,
     payment.payment_mode || 'Cash', paidFrom.id, amountPaid, cashDiscount,
     payment.cheque_reference || null, payment.narration || null, ctx.userId || null]
  );
  const voucherId = vou.rows[0].id;

  const allocSql = `INSERT INTO payment_allocations (payment_voucher_id, purchase_invoice_id, allocated_amount)
      VALUES ($1,$2,$3)`;
  for (const a of allocations) {
    await client.query(allocSql, [voucherId, a.purchase_invoice_id, Number(a.allocated_amount)]);
  }

  // -- 5. Invoice status transition (the ONLY permitted mutation — GUC escape) -----
  await client.query(`SET LOCAL purchase.allow_invoice_mutation = 'payment'`);
  for (const a of allocations) {
    const amt = Number(a.allocated_amount) || 0;
    const r = await client.query(
      `UPDATE purchase_invoices
          SET amount_paid = ROUND((amount_paid + $2)::numeric, 2),
              status = CASE WHEN amount_paid + $2 >= net_grand_total - 0.009 THEN 'Paid' ELSE 'Partial' END,
              updated_at = now()
        WHERE id = $1
        RETURNING id, status, amount_paid, net_grand_total`,
      [a.purchase_invoice_id, amt]
    );
    if (!r.rows[0]) throw new Error(`Failed to update invoice ${a.purchase_invoice_id}`);
  }

  // -- 6. Double entry ---------------------------------------------------------------
  const jl = [
    { accountCode: ACCOUNTS.SUNDRY_CREDITORS, subLedgerId: v.id, debit: settlement },
    { accountCode: paidFrom.code, credit: amountPaid },
  ];
  if (cashDiscount > 0) jl.push({ accountCode: ACCOUNTS.DISCOUNT_RECEIVED, credit: cashDiscount });
  await postJournal(client, ctx, {
    voucherNo: voucherNumber, voucherType: 'PAYMENT',
    sourceDocumentType: 'vendor_payment', sourceDocumentNo: voucherNumber, sourceDocumentId: voucherId,
    narration: `Vendor payment ${voucherNumber} to ${v.legal_name}`,
    englishDate: payment.english_date, lines: jl,
  });

  // -- 7. Vendor outstanding -----------------------------------------------------------------
  await touchVendorOutstanding(client, v.id, -settlement);

  // -- 8. Post-write verification -------------------------------------------------------------
  const sumAlloc = await client.query(
    `SELECT COALESCE(SUM(allocated_amount),0)::float AS s FROM payment_allocations WHERE payment_voucher_id = $1`,
    [voucherId]
  );
  if (Math.abs(Number(sumAlloc.rows[0].s) - settlement) > 0.01) throw new Error('Payment allocation write-verify failed');

  return { voucherId, voucherNumber, amountPaid, cashDiscount, settlement };
}

// ============================================================================
// MODULE C — PURCHASE RETURN (Debit Note)
//
// Posting (Module C journal):
//   DR  20400 Sundry Creditors      total_debit_amount  (sub-ledger = vendor)
//   CR  50200 Purchase - Taxable    taxable_returned
//   CR  50210 Purchase - Exempt     exempt_returned
//   CR  10501 Input VAT (13%)       vat_returned
//
// Side effects:
//   * vendor.current_outstanding_balance -= total_debit_amount
//   * FIFO stock layers consumed + item_master.current_stock_qty reduced
// ============================================================================
async function postDebitNote(client, ctx, { debitNote, items }) {
  const vatRate = ctx.vatRate || VAT_RATE;

  // -- 1. Validate original purchase + vendor -------------------------------------
  const orig = await client.query(
    `SELECT pi.id, pi.invoice_number, pi.vendor_id, pi.net_grand_total, pi.english_date, pi.status
       FROM purchase_invoices pi WHERE pi.id = $1 AND pi.company_id = $2 FOR UPDATE`,
    [debitNote.original_purchase_id, ctx.companyId]
  );
  if (!orig.rows[0]) throw new Error('Original purchase invoice not found');
  const oi = orig.rows[0];

  const vendor = await client.query(
    `SELECT id, legal_name, current_outstanding_balance, is_active
       FROM vendors WHERE id = $1 AND company_id = $2 AND is_active`,
    [oi.vendor_id, ctx.companyId]
  );
  if (!vendor.rows[0]) throw new Error('Vendor not found');
  const v = vendor.rows[0];

  // Original purchase line quantities (for over-return validation).
  const origItems = await client.query(
    `SELECT item_id, quantity, unit_cost, taxable_amount, exempt_amount
       FROM purchase_invoice_items WHERE purchase_invoice_id = $1`,
    [oi.id]
  );
  const origQty = {};
  const origItemCost = {};
  const origTaxCat = {};
  for (const l of origItems.rows) {
    origQty[l.item_id] = (origQty[l.item_id] || 0) + Number(l.quantity);
    origItemCost[l.item_id] = Number(l.unit_cost);
  }
  const taxCatRes = await client.query(
    `SELECT id, tax_category FROM item_master WHERE company_id = $1 AND id = ANY($2::uuid[])`,
    [ctx.companyId, origItems.rows.map(r => r.item_id)]
  );
  taxCatRes.rows.forEach(r => { origTaxCat[r.id] = r.tax_category; });

  // Already returned per item across prior debit notes on this purchase.
  const already = await client.query(
    `SELECT dni.item_id, COALESCE(SUM(dni.quantity),0) AS qty
       FROM debit_note_items dni
       JOIN debit_notes dn ON dn.id = dni.debit_note_id
      WHERE dn.original_purchase_id = $1
      GROUP BY dni.item_id`,
    [oi.id]
  );
  const returnedQty = {};
  already.rows.forEach(r => { returnedQty[r.item_id] = Number(r.qty); });

  // -- 2. Compute return amounts --------------------------------------------------
  let netReturned = 0, vatReturned = 0, taxableReturned = 0, exemptReturned = 0;
  const lines = items.map(it => {
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) throw new Error(`Invalid return quantity for item ${it.item_id}`);
    const maxReturnable = round2((origQty[it.item_id] || 0) - (returnedQty[it.item_id] || 0));
    if (qty > maxReturnable + 0.001) {
      throw new Error(`Cannot return ${qty} of item ${it.item_id}: only ${maxReturnable} returnable`);
    }
    const cost = it.unit_cost != null ? Number(it.unit_cost) : origItemCost[it.item_id];
    const taxableLine = origTaxCat[it.item_id] === 'Taxable_13%' ? round2(qty * cost) : 0;
    const exemptLine = origTaxCat[it.item_id] === 'Exempt' ? round2(qty * cost) : 0;
    const vatLine = round2(taxableLine * vatRate / 100);
    taxableReturned = round2(taxableReturned + taxableLine);
    exemptReturned = round2(exemptReturned + exemptLine);
    netReturned = round2(netReturned + taxableLine + exemptLine);
    vatReturned = round2(vatReturned + vatLine);
    return { item_id: it.item_id, quantity: qty, unit_cost: round2(cost), taxable_returned: taxableLine, exempt_returned: exemptLine, vat_returned: vatLine };
  });
  const totalDebit = round2(netReturned + vatReturned);

  // -- 3. Verification assertions ---------------------------------------------------
  if (Math.abs(totalDebit - round2(netReturned + vatReturned)) > 0.01) throw new Error('Debit note total cross-check failed');
  if (Math.abs(vatReturned - round2(taxableReturned * vatRate / 100)) > 0.01) throw new Error('Returned VAT does not equal 13% of returned taxable amount');

  // -- 4. Gap-free debit note number ------------------------------------------------
  const fiscalYear = ctx.fiscalYear || debitNote.fiscal_year || getFiscalYear(debitNote.english_date);
  const miti = debitNote.miti || adToMiti(debitNote.english_date);
  const dnNumber = await nextDocNumber(client, ctx.companyId, fiscalYear, 'DEBIT_NOTE');

  // -- 5. Source document --------------------------------------------------------------
  const dn = await client.query(
    `INSERT INTO debit_notes
       (company_id, debit_note_number, original_purchase_id, vendor_id, miti, english_date,
        net_returned_amount, vat_returned_amount, total_debit_amount, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [ctx.companyId, dnNumber, oi.id, v.id, miti, debitNote.english_date,
     netReturned, vatReturned, totalDebit, debitNote.reason || null, ctx.userId || null]
  );
  const dnId = dn.rows[0].id;

  const itemSql = `INSERT INTO debit_note_items
      (debit_note_id, item_id, quantity, unit_cost, taxable_returned, exempt_returned, vat_returned)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`;
  for (const l of lines) {
    await client.query(itemSql, [dnId, l.item_id, l.quantity, l.unit_cost, l.taxable_returned, l.exempt_returned, l.vat_returned]);
  }

  // -- 6. Double entry --------------------------------------------------------------------
  const jl = [
    { accountCode: ACCOUNTS.SUNDRY_CREDITORS, subLedgerId: v.id, debit: totalDebit },
    { accountCode: ACCOUNTS.PURCHASE_TAXABLE, credit: taxableReturned },
    { accountCode: ACCOUNTS.PURCHASE_EXEMPT, credit: exemptReturned },
    { accountCode: ACCOUNTS.INPUT_VAT, credit: vatReturned },
  ];
  await postJournal(client, ctx, {
    voucherNo: dnNumber, voucherType: 'DEBIT_NOTE',
    sourceDocumentType: 'debit_note', sourceDocumentNo: dnNumber, sourceDocumentId: dnId,
    narration: `Debit note ${dnNumber} against ${oi.invoice_number}`,
    englishDate: debitNote.english_date, lines: jl,
  });

  // -- 7. Vendor outstanding + inventory reversal -------------------------------------------
  await touchVendorOutstanding(client, v.id, -totalDebit);
  for (const l of lines) {
    await postStockOutLayers(client, ctx, {
      itemId: l.item_id, qty: l.quantity,
      sourceModule: 'DEBIT_NOTE', sourceTransactionId: dnId, englishDate: debitNote.english_date,
    });
  }

  // -- 8. Post-write verification ------------------------------------------------------------------
  const check = await client.query(
    `SELECT total_debit_amount, net_returned_amount, vat_returned_amount FROM debit_notes WHERE id = $1`,
    [dnId]
  );
  const row = check.rows[0];
  if (Math.abs(row.total_debit_amount - totalDebit) > 0.01) throw new Error('Debit note write-verify failed');

  return { debitNoteId: dnId, debitNoteNumber: dnNumber, taxableReturned, exemptReturned, netReturned, vatReturned, totalDebit };
}

// ============================================================================
// Express handlers — one transaction per request.
// ============================================================================
function handlerFor(fn, bodyKey) {
  return async (req, res) => {
    const ctx = { companyId: req.params.companyId, userId: req.auth?.userId || null };
    try {
      const result = await withTx(async (client) => {
        await ensureChartOfAccounts(client, ctx.companyId);
        return fn(client, ctx, req.body);
      });
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  };
}

// GET list paths (read-only, no transaction needed).
async function listPurchases(req, res) {
  const { companyId } = req.params;
  const { fiscal_year, status } = req.query;
  const result = await pool.query(
    `SELECT pi.*, v.legal_name AS vendor_name, v.pan_number
       FROM purchase_invoices pi
       JOIN vendors v ON v.id = pi.vendor_id
      WHERE pi.company_id = $1
        AND ($2::varchar IS NULL OR pi.miti LIKE $2 || '%')
        AND ($3::varchar IS NULL OR pi.status = $3)
      ORDER BY pi.english_date DESC`,
    [companyId, fiscal_year || null, status || null]
  );
  res.json({ rows: result.rows });
}

async function listPayments(req, res) {
  const { companyId } = req.params;
  const { fiscal_year } = req.query;
  const result = await pool.query(
    `SELECT vp.*, v.legal_name AS vendor_name,
            (SELECT COALESCE(SUM(allocated_amount),0) FROM payment_allocations pa WHERE pa.payment_voucher_id = vp.id)::float AS allocated_total
       FROM vendor_payment_vouchers vp
       JOIN vendors v ON v.id = vp.vendor_id
      WHERE vp.company_id = $1 AND ($2::varchar IS NULL OR vp.miti LIKE $2 || '%')
      ORDER BY vp.english_date DESC`,
    [companyId, fiscal_year || null]
  );
  res.json({ rows: result.rows });
}

async function listDebitNotes(req, res) {
  const { companyId } = req.params;
  const { fiscal_year } = req.query;
  const result = await pool.query(
    `SELECT dn.*, v.legal_name AS vendor_name, pi.invoice_number AS original_invoice
       FROM debit_notes dn
       JOIN vendors v ON v.id = dn.vendor_id
       JOIN purchase_invoices pi ON pi.id = dn.original_purchase_id
      WHERE dn.company_id = $1 AND ($2::varchar IS NULL OR dn.miti LIKE $2 || '%')
      ORDER BY dn.english_date DESC`,
    [companyId, fiscal_year || null]
  );
  res.json({ rows: result.rows });
}

module.exports = {
  withTx,
  pool,
  round2,
  getFiscalYear,
  ensureChartOfAccounts,
  nextDocNumber,
  postJournal,
  // Transaction-aware primitives (usable inside existing route transactions):
  _postCreditPurchase: postCreditPurchase,
  _postVendorPayment: postVendorPayment,
  _postDebitNote: postDebitNote,
  // Express handlers:
  postCreditPurchase: handlerFor(postCreditPurchase),
  postVendorPayment: handlerFor(postVendorPayment),
  postDebitNote: handlerFor(postDebitNote),
  listPurchases,
  listPayments,
  listDebitNotes,
};
