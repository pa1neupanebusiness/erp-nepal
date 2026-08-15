// ============================================================================
// GENERAL LEDGER CONTROLLER — Nepal IRD compliant double-entry routing
//
// Atomic transaction blocks (all run inside ONE Postgres transaction):
//
//   A. Credit Sales (B2B)      postCreditSale
//   B. Cash / POS Sales (B2C)  postCashSale
//   C. Credit Purchase (B2B)   postCreditPurchase
//   D. Import Purchase         postImportPurchase
//   E. Returns                 postSalesReturn (Credit Note)
//                              postPurchaseReturn (Debit Note)
//
// Every block:
//   1. Validates the raw invoice (grand-total cross-check).
//   2. Resolves ledger accounts by CODE from accounts_chart.
//   3. Posts a balanced journal header + lines (control-account guard,
//      balance enforcement is double-checked here AND by DB triggers).
//   4. Updates the Customer/Vendor sub-ledger outstanding.
//   5. Runs the inventory costing hook (Weighted-Average default / FIFO):
//      stock-in creates costing layers + running-avg; sales consume them
//      and post DR COGS / CR Stock-in-Hand; returns reverse.
//   6. Rolls back EVERYTHING if any step fails (gap-free voucher numbers
//      included — a rollback also rolls the counter back).
//
// VAT rate defaults to 13% (Nepal) but is configurable per call.
// ============================================================================

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VAT_RATE = 13;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function getFiscalYear(adDate) {
  const d = new Date(adDate);
  const m = d.getMonth() + 1, y = d.getFullYear(), dy = d.getDate();
  if (m > 7 || (m === 7 && dy >= 16)) return `${y}/${y + 1}`;   // Nepal FY starts Shrawan 16
  return `${y - 1}/${y}`;
}

function adToMiti(adDate) {
  // Adapter to the server's Nepali calendar helper (bikram-sambat-js).
  return global.adToBikramSambat ? global.adToBikramSambat(new Date(adDate)) : String(adDate);
}

// ---------------------------------------------------------------------------
// Transaction + infrastructure helpers
// ---------------------------------------------------------------------------

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

async function nextVoucherNo(client, companyId, fiscalYear, voucherType) {
  const counter = await client.query(
    `INSERT INTO voucher_counters (company_id, fiscal_year, voucher_type, next_value)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (company_id, fiscal_year, voucher_type)
     DO UPDATE SET next_value = voucher_counters.next_value
     RETURNING next_value`,
    [companyId, fiscalYear, voucherType]
  );
  const next = counter.rows[0].next_value;
  await client.query(
    `UPDATE voucher_counters SET next_value = next_value + 1
      WHERE company_id = $1 AND fiscal_year = $2 AND voucher_type = $3`,
    [companyId, fiscalYear, voucherType]
  );
  return `${voucherType}-${fiscalYear}-${String(next).padStart(6, '0')}`;
}

// Seed the standard IRD chart of accounts for a company (idempotent).
const STANDARD_CHART = [
  ['10100', 'Cash in Hand',                 'asset',   'Cash_Bank',         'debit',  false, false, false],
  ['10200', 'Bank Account',                 'asset',   'Cash_Bank',         'debit',  false, false, false],
  ['10210', 'Digital Wallet',               'asset',   'Cash_Bank',         'debit',  false, false, false],
  ['10300', 'Sundry Debtors',               'asset',   'Sundry_Debtors',    'debit',  true,  false, false],
  ['10400', 'Stock in Hand',                'asset',   'Stock',             'debit',  false, false, true],
  ['10501', 'Input VAT (Purchases)',        'asset',   'Duties_Taxes',      'debit',  false, true,  false],
  ['10502', 'Import Input VAT',             'asset',   'Duties_Taxes',      'debit',  false, true,  false],
  ['20100', 'Output VAT (Sales)',           'liability','Duties_Taxes',     'credit', false, true,  false],
  ['20200', 'TDS Payable',                  'liability','Duties_Taxes',     'credit', false, false, false],
  ['20300', 'Customs Duty & Clearing Pay.','liability','Duties_Taxes',     'credit', false, false, false],
  ['20400', 'Sundry Creditors',             'liability','Sundry_Creditors', 'credit', true,  false, false],
  ['20500', 'L/C Bank Payable (Imports)',   'liability','Sundry_Creditors', 'credit', false, false, false],
  ['30100', "Owner's Capital / Equity",     'equity',  'Sales',             'credit', false, false, false],
  ['40100', 'Sales Revenue - Taxable',      'income',  'Sales',             'credit', false, false, false],
  ['40110', 'Sales Revenue - Non-Taxable',  'income',  'Sales',             'credit', false, false, false],
  ['40200', 'Discount Received',            'income',  'Indirect_Incomes',  'credit', false, false, false],
  ['50100', 'Cost of Goods Sold (COGS)',    'expense', 'COGS',              'debit',  false, false, true],
  ['50200', 'Purchase - Taxable',           'expense', 'Purchase',          'debit',  false, false, false],
  ['50210', 'Purchase - Non-Taxable',       'expense', 'Purchase',          'debit',  false, false, false],
  ['50300', 'Purchase - Import (Base)',     'expense', 'Purchase',          'debit',  false, false, false],
  ['50400', 'Customs Duty & Clearing Chg.', 'expense', 'Purchase',          'debit',  false, false, false],
  ['50500', 'Freight & Insurance Inward',   'expense', 'Indirect_Expenses', 'debit',  false, false, false],
  ['50600', 'Discount Allowed',             'expense', 'Indirect_Expenses', 'debit',  false, false, false],
  ['50700', 'Indirect Expenses (Misc)',     'expense', 'Indirect_Expenses', 'debit',  false, false, false],
];

async function ensureChartOfAccounts(client, companyId) {
  const sql = `INSERT INTO accounts_chart
      (company_id, code, name, account_type, group_name, normal_balance, is_control, is_vat_account, is_costing)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (company_id, code) DO NOTHING`;
  for (const a of STANDARD_CHART) {
    await client.query(sql, [companyId, ...a]);
  }
}

async function resolveAccount(client, companyId, code) {
  const r = await client.query(
    'SELECT * FROM accounts_chart WHERE company_id = $1 AND code = $2 AND is_active',
    [companyId, code]
  );
  if (!r.rows[0]) throw new Error(`Ledger account ${code} not found for company`);
  return r.rows[0];
}

async function touchOutstanding(client, subLedgerId, delta) {
  if (!subLedgerId) return;
  await client.query(
    `UPDATE sub_ledgers SET outstanding_balance = ROUND((outstanding_balance + $2)::numeric, 2)
      WHERE id = $1`,
    [subLedgerId, delta]
  );
}

// ---------------------------------------------------------------------------
// CORE JOURNAL POSTER — used by every block
// ---------------------------------------------------------------------------
// lines: [{ accountCode, subLedgerId?, debit?, credit? }]
async function postJournal(client, ctx, { voucherType, sourceDocumentType, sourceDocumentNo, sourceDocumentId, narration, englishDate, lines }) {
  const dr = round2(lines.reduce((s, l) => s + (l.debit || 0), 0));
  const cr = round2(lines.reduce((s, l) => s + (l.credit || 0), 0));
  if (Math.abs(dr - cr) > 0.01) throw new Error(`Journal not balanced: debits ${dr} vs credits ${cr}`);
  if (dr === 0) throw new Error('Empty journal entry is not allowed');

  // Resolve accounts + control-account guard (pre-DB validation for clean errors)
  const codes = [...new Set(lines.map(l => l.accountCode))];
  const accRes = await client.query(
    'SELECT id, code, is_control FROM accounts_chart WHERE company_id = $1 AND code = ANY($2::text[])',
    [ctx.companyId, codes]
  );
  const accMap = {};
  accRes.rows.forEach(a => { accMap[a.code] = a; });
  for (const l of lines) {
    const a = accMap[l.accountCode];
    if (!a) throw new Error(`Unknown ledger account ${l.accountCode}`);
    if (a.is_control && !l.subLedgerId) {
      throw new Error(`Control account ${l.accountCode} requires a Customer/Vendor Sub-Ledger reference`);
    }
  }

  const fiscalYear = ctx.fiscalYear || getFiscalYear(englishDate);
  const miti = ctx.miti || adToMiti(englishDate);
  const voucherNo = await nextVoucherNo(client, ctx.companyId, fiscalYear, voucherType);

  const header = await client.query(
    `INSERT INTO journal_headers
       (company_id, voucher_no, voucher_type, fiscal_year, miti, english_date,
        narration, source_document_type, source_document_no, source_document_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, voucher_no`,
    [ctx.companyId, voucherNo, voucherType, fiscalYear, miti, englishDate,
     narration || null, sourceDocumentType || null, sourceDocumentNo || null,
     sourceDocumentId || null, ctx.userId || null]
  );
  const headerId = header.rows[0].id;

  // Insert ALL lines in one statement — the balanced-journal constraint
  // trigger validates the complete header immediately after.
  const vals = lines.map((l, i) => {
    const p = i * 5 + 1;
    return `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4})`;
  }).join(',');
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

// ---------------------------------------------------------------------------
// INVENTORY COSTING ENGINE (Weighted-Average default, FIFO optional)
// ---------------------------------------------------------------------------

async function getStockState(client, companyId, productId) {
  const r = await client.query(
    `SELECT running_balance_qty, running_avg_cost FROM inventory_ledger
      WHERE company_id = $1 AND product_id = $2
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [companyId, productId]
  );
  return r.rows[0] ? { qty: r.rows[0].running_balance_qty, avg: r.rows[0].running_avg_cost } : { qty: 0, avg: 0 };
}

// Purchase / import / sales-return stock-in: creates a FIFO layer and updates
// the weighted-average running cost. Returns the new running average.
async function postStockIn(client, ctx, { productId, qty, unitCost, sourceType, sourceDocumentNo, englishDate }) {
  const layer = await client.query(
    `INSERT INTO costing_layers (company_id, product_id, source_document_no, quantity_remaining, unit_cost, received_on)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [ctx.companyId, productId, sourceDocumentNo, qty, round2(unitCost), englishDate]
  );
  const st = await getStockState(client, ctx.companyId, productId);
  const newQty = round2(st.qty + qty);
  const newAvg = (st.qty * st.avg + qty * round2(unitCost)) / (newQty || 1);
  await client.query(
    `INSERT INTO inventory_ledger
       (company_id, product_id, source_type, source_document_no, movement_type, quantity,
        unit_cost, layer_id, running_balance_qty, running_avg_cost, english_date, miti, created_by)
     VALUES ($1,$2,$3,$4,'in',$5,$6,$7,$8,$9,$10,$11,$12)`,
    [ctx.companyId, productId, sourceType, sourceDocumentNo, qty, round2(unitCost), layer.rows[0].id,
     newQty, round2(newAvg), englishDate, ctx.miti || adToMiti(englishDate), ctx.userId || null]
  );
  return round2(newAvg);
}

// Consume stock on sale (COGS) or purchase-return.
//   mode 'avg'   -> cost at the weighted-average running cost (Nepal common practice)
//   mode 'layers'-> consume FIFO layers oldest-first at their own unit cost
async function postStockOut(client, ctx, { productId, qty, mode = 'avg', unitCost = 0, sourceType, sourceDocumentNo, englishDate }) {
  const st = await getStockState(client, ctx.companyId, productId);
  if (st.qty + 0.001 < qty) throw new Error(`Insufficient stock for product ${productId}: have ${st.qty}, need ${qty}`);

  let consumed = 0;
  let cost = 0;
  let layers = [];

  if (mode === 'layers') {
    const lr = await client.query(
      `SELECT id, quantity_remaining, unit_cost FROM costing_layers
        WHERE company_id = $1 AND product_id = $2 AND quantity_remaining > 0
        ORDER BY received_on, created_at FOR UPDATE`,
      [ctx.companyId, productId]
    );
    layers = lr.rows;
    let remaining = qty;
    for (const lay of layers) {
      if (remaining <= 0) break;
      const take = Math.min(lay.quantity_remaining, remaining);
      cost += take * lay.unit_cost;
      remaining -= take;
    }
    if (remaining > 0.001) throw new Error('Insufficient costing layers (FIFO) for stock-out');
    cost = round2(cost);
    consumed = qty;
  } else {
    const avg = st.avg || unitCost;
    cost = round2(qty * avg);
    consumed = qty;
  }

  const newQty = round2(st.qty - consumed);
  const newAvg = mode === 'layers' && layers.length
    ? round2(cost / qty)                       // FIFO blended cost marker
    : st.avg;

  await client.query(
    `INSERT INTO inventory_ledger
       (company_id, product_id, source_type, source_document_no, movement_type, quantity,
        unit_cost, running_balance_qty, running_avg_cost, english_date, miti, created_by)
     VALUES ($1,$2,$3,$4,'out',$5,$6,NULL,$7,$8,$9,$10,$11)`,
    [ctx.companyId, productId, sourceType, sourceDocumentNo, -consumed, round2(cost / (consumed || 1)),
     newQty, newAvg, englishDate, ctx.miti || adToMiti(englishDate), ctx.userId || null]
  );
  if (mode === 'layers') {
    let remaining = qty;
    for (const lay of layers) {
      if (remaining <= 0) break;
      const take = Math.min(lay.quantity_remaining, remaining);
      await client.query(
        `UPDATE costing_layers SET quantity_remaining = quantity_remaining - $2 WHERE id = $1`,
        [lay.id, take]
      );
      remaining -= take;
    }
  }
  return cost;
}

// ============================================================================
// A. CREDIT SALE (B2B) — build customer receivable, sales + VAT, discount,
//    and immediately cost the goods out of inventory (DR COGS / CR Stock).
// ============================================================================
async function postCreditSale(client, ctx, sale) {
  const vatRate = ctx.vatRate || VAT_RATE;
  let taxableBase = 0, nonTaxable = 0;
  for (const it of sale.items) {
    const amt = round2((it.unitPrice || 0) * it.quantity);
    if (Number(it.taxRate || 0) > 0) taxableBase = round2(taxableBase + amt);
    else nonTaxable = round2(nonTaxable + amt);
  }
  const vat = round2(taxableBase * vatRate / 100);
  const discount = round2(sale.discount || 0);
  const expected = round2(taxableBase + nonTaxable + vat - discount);
  if (Math.abs(expected - (sale.grandTotal || 0)) > 0.01) {
    throw new Error(`Credit sale ${sale.invoiceNo} total mismatch: lines=${expected}, invoice=${sale.grandTotal}`);
  }

  const lines = [
    { accountCode: '10300', subLedgerId: sale.customerSubLedgerId, debit: sale.grandTotal },
    { accountCode: '40100', credit: taxableBase },
    { accountCode: '40110', credit: nonTaxable },
    { accountCode: '20100', credit: vat },
  ];
  if (discount > 0) lines.push({ accountCode: '50600', debit: discount });

  const header = await postJournal(client, ctx, {
    voucherType: 'SALE',
    sourceDocumentType: 'sales_invoice', sourceDocumentNo: sale.invoiceNo, sourceDocumentId: sale.invoiceId,
    narration: `Credit sale ${sale.invoiceNo} to ${sale.customerName || ''}`,
    englishDate: sale.date, lines,
  });
  await touchOutstanding(client, sale.customerSubLedgerId, sale.grandTotal);

  // SYSTEM HOOK: COGS + stock-out at cost, per sold line.
  let totalCost = 0;
  for (const it of sale.items) {
    totalCost += await postStockOut(client, ctx, {
      productId: it.productId, qty: it.quantity, mode: ctx.costingMethod === 'fifo' ? 'layers' : 'avg',
      sourceType: 'SALES', sourceDocumentNo: sale.invoiceNo, englishDate: sale.date,
    });
  }
  totalCost = round2(totalCost);
  if (totalCost > 0) {
    await postJournal(client, ctx, {
      voucherType: 'SALE', sourceDocumentNo: sale.invoiceNo,
      narration: `COGS for ${sale.invoiceNo}`,
      englishDate: sale.date,
      lines: [{ accountCode: '50100', debit: totalCost }, { accountCode: '10400', credit: totalCost }],
    });
  }
  return { header, vat, taxableBase, nonTaxable, cogs: totalCost };
}

// ============================================================================
// B. CASH / POS RETAIL SALE (B2C) — cash/bank/wallet in, sales + VAT out.
// ============================================================================
async function postCashSale(client, ctx, sale) {
  const vatRate = ctx.vatRate || VAT_RATE;
  let taxableBase = 0, nonTaxable = 0;
  for (const it of sale.items) {
    const amt = round2((it.unitPrice || 0) * it.quantity);
    if (Number(it.taxRate || 0) > 0) taxableBase = round2(taxableBase + amt);
    else nonTaxable = round2(nonTaxable + amt);
  }
  const vat = round2(taxableBase * vatRate / 100);
  const discount = round2(sale.discount || 0);
  const expected = round2(taxableBase + nonTaxable + vat - discount);
  if (Math.abs(expected - (sale.grandTotal || 0)) > 0.01) {
    throw new Error(`Cash sale ${sale.invoiceNo} total mismatch: lines=${expected}, invoice=${sale.grandTotal}`);
  }

  const cashAccount = { cash: '10100', bank: '10200', wallet: '10210' }[sale.paymentMethod] || '10100';
  const lines = [
    { accountCode: cashAccount, debit: sale.grandTotal },
    { accountCode: '40100', credit: taxableBase },
    { accountCode: '40110', credit: nonTaxable },
    { accountCode: '20100', credit: vat },
  ];
  if (discount > 0) lines.push({ accountCode: '50600', debit: discount });

  const header = await postJournal(client, ctx, {
    voucherType: 'SALE', sourceDocumentType: 'sales_invoice',
    sourceDocumentNo: sale.invoiceNo, sourceDocumentId: sale.invoiceId,
    narration: `Cash sale ${sale.invoiceNo}`,
    englishDate: sale.date, lines,
  });

  let totalCost = 0;
  for (const it of sale.items) {
    totalCost += await postStockOut(client, ctx, {
      productId: it.productId, qty: it.quantity, mode: ctx.costingMethod === 'fifo' ? 'layers' : 'avg',
      sourceType: 'SALES', sourceDocumentNo: sale.invoiceNo, englishDate: sale.date,
    });
  }
  totalCost = round2(totalCost);
  if (totalCost > 0) {
    await postJournal(client, ctx, {
      voucherType: 'SALE', sourceDocumentNo: sale.invoiceNo,
      narration: `COGS for ${sale.invoiceNo}`,
      englishDate: sale.date,
      lines: [{ accountCode: '50100', debit: totalCost }, { accountCode: '10400', credit: totalCost }],
    });
  }
  return { header, vat, taxableBase, nonTaxable, cogs: totalCost };
}

// ============================================================================
// C. CREDIT PURCHASE (B2B vendor) — vendor payable, input VAT, discount
//    received, and stock-in capitalized to Stock-in-Hand (expense reclass).
// ============================================================================
async function postCreditPurchase(client, ctx, purchase) {
  const vatRate = ctx.vatRate || VAT_RATE;
  let taxableBase = 0, nonTaxable = 0, landedTaxable = 0, landedNonTaxable = 0;
  for (const it of purchase.items) {
    const amt = round2((it.unitCost || 0) * it.quantity);
    if (Number(it.taxRate || 0) > 0) { taxableBase = round2(taxableBase + amt); landedTaxable = round2(landedTaxable + amt); }
    else { nonTaxable = round2(nonTaxable + amt); landedNonTaxable = round2(landedNonTaxable + amt); }
  }
  const vat = round2(taxableBase * vatRate / 100);
  const discountReceived = round2(purchase.discountReceived || 0);
  const payable = round2(taxableBase + nonTaxable + vat - discountReceived);
  if (Math.abs(payable - (purchase.grandTotal || 0)) > 0.01) {
    throw new Error(`Credit purchase ${purchase.billNo} total mismatch: payable=${payable}, invoice=${purchase.grandTotal}`);
  }

  const lines = [
    { accountCode: '50200', debit: taxableBase },
    { accountCode: '50210', debit: nonTaxable },
    { accountCode: '10501', debit: vat },
    { accountCode: '20400', subLedgerId: purchase.vendorSubLedgerId, credit: payable },
  ];
  if (discountReceived > 0) lines.push({ accountCode: '40200', credit: discountReceived });

  const header = await postJournal(client, ctx, {
    voucherType: 'PURCHASE', sourceDocumentType: 'purchase_bill',
    sourceDocumentNo: purchase.billNo, sourceDocumentId: purchase.purchaseId,
    narration: `Credit purchase ${purchase.billNo} from ${purchase.vendorName || ''}`,
    englishDate: purchase.date, lines,
  });
  await touchOutstanding(client, purchase.vendorSubLedgerId, payable);

  // SYSTEM HOOK: stock-in layers + capitalize inventory
  for (const it of purchase.items) {
    await postStockIn(client, ctx, {
      productId: it.productId, qty: it.quantity, unitCost: it.unitCost,
      sourceType: 'PURCHASE', sourceDocumentNo: purchase.billNo, englishDate: purchase.date,
    });
  }
  const landedTotal = round2(landedTaxable + landedNonTaxable);
  if (landedTotal > 0) {
    const cap = [{ accountCode: '10400', debit: landedTotal }];
    if (landedTaxable > 0) cap.push({ accountCode: '50200', credit: landedTaxable });
    if (landedNonTaxable > 0) cap.push({ accountCode: '50210', credit: landedNonTaxable });
    await postJournal(client, ctx, {
      voucherType: 'PURCHASE', sourceDocumentNo: purchase.billNo,
      narration: `Capitalize inventory for ${purchase.billNo}`, englishDate: purchase.date, lines: cap,
    });
  }
  return { header, vat, taxableBase, nonTaxable, landedTotal };
}

// ============================================================================
// D. IMPORT PURCHASE (customs entry) — base value, duty+clearing capitalized,
//    import VAT, supplier/L-C payable + cash out for duties & taxes.
// ============================================================================
async function postImportPurchase(client, ctx, imp) {
  const base = round2(imp.baseForeignAmount || 0);
  const clearing = round2((imp.customsDuty || 0) + (imp.freightInsurance || 0));
  const importVat = round2(imp.importVat || 0);
  const totalInvoiceValue = round2((imp.totalInvoiceValue || 0) || (base + (imp.freightInsurance || 0) + (imp.insurance || 0)));
  const dutiesPaid = round2(clearing + importVat);
  if (Math.abs(round2(base + clearing + importVat) - round2(totalInvoiceValue + dutiesPaid)) > 0.01) {
    throw new Error(`Import entry ${imp.entryNo} not balanced: DR ${base + clearing + importVat} vs CR ${totalInvoiceValue + dutiesPaid}`);
  }

  const lines = [
    { accountCode: '50300', debit: base },
    { accountCode: '50400', debit: clearing },
    { accountCode: '10502', debit: importVat },
    { accountCode: '20500', subLedgerId: imp.vendorSubLedgerId || null, credit: totalInvoiceValue },
    { accountCode: '10100', credit: dutiesPaid },
  ];
  const header = await postJournal(client, ctx, {
    voucherType: 'IMPORT', sourceDocumentType: 'import_entry',
    sourceDocumentNo: imp.entryNo, sourceDocumentId: imp.entryId,
    narration: `Import purchase ${imp.entryNo} (L/C + customs paid)`,
    englishDate: imp.date, lines,
  });
  if (imp.vendorSubLedgerId) await touchOutstanding(client, imp.vendorSubLedgerId, totalInvoiceValue);

  // SYSTEM HOOK: capitalize at LANDED cost (base + duty + freight, VAT excluded
  // as it is recoverable) and distribute across item quantities.
  const landed = round2(base + clearing);
  const totalQty = imp.items.reduce((s, it) => s + (it.quantity || 0), 0);
  const landedUnit = totalQty > 0 ? round2(landed / totalQty) : 0;
  for (const it of imp.items) {
    await postStockIn(client, ctx, {
      productId: it.productId, qty: it.quantity, unitCost: landedUnit,
      sourceType: 'IMPORT', sourceDocumentNo: imp.entryNo, englishDate: imp.date,
    });
  }
  if (landed > 0) {
    await postJournal(client, ctx, {
      voucherType: 'IMPORT', sourceDocumentNo: imp.entryNo,
      narration: `Capitalize landed inventory for ${imp.entryNo}`, englishDate: imp.date,
      lines: [
        { accountCode: '10400', debit: landed },
        { accountCode: '50300', credit: base },
        { accountCode: '50400', credit: clearing },
      ],
    });
  }
  return { header, landed, importVat };
}

// ============================================================================
// E1. SALES RETURN (Credit Note) — reverse the receivable, reverse output VAT,
//     reverse discount, and return goods to inventory (reverse COGS).
// ============================================================================
async function postSalesReturn(client, ctx, creditNote) {
  const vatRate = ctx.vatRate || VAT_RATE;
  let taxableBase = 0, nonTaxable = 0, returnCost = 0;
  for (const it of creditNote.items) {
    const amt = round2((it.unitPrice || 0) * it.quantity);
    if (Number(it.taxRate || 0) > 0) taxableBase = round2(taxableBase + amt);
    else nonTaxable = round2(nonTaxable + amt);
    returnCost += await postStockIn(client, ctx, {           // goods come BACK to stock
      productId: it.productId, qty: it.quantity, unitCost: it.unitCost || (await getStockState(client, ctx.companyId, it.productId)).avg,
      sourceType: 'SALES_RETURN', sourceDocumentNo: creditNote.noteNo, englishDate: creditNote.date,
    }) * it.quantity;
  }
  const vat = round2(taxableBase * vatRate / 100);
  const discount = round2(creditNote.discount || 0);
  const grandTotal = round2(taxableBase + nonTaxable + vat - discount);
  if (Math.abs(grandTotal - (creditNote.grandTotal || 0)) > 0.01) {
    throw new Error(`Credit note ${creditNote.noteNo} total mismatch`);
  }
  returnCost = round2(returnCost);

  const lines = [
    { accountCode: '40100', debit: taxableBase },
    { accountCode: '40110', debit: nonTaxable },
    { accountCode: '20100', debit: vat },
    { accountCode: '10300', subLedgerId: creditNote.customerSubLedgerId, credit: grandTotal },
  ];
  if (discount > 0) lines.push({ accountCode: '50600', credit: discount });

  const header = await postJournal(client, ctx, {
    voucherType: 'SALES_RETURN', sourceDocumentType: 'credit_note',
    sourceDocumentNo: creditNote.noteNo, sourceDocumentId: creditNote.noteId,
    narration: `Credit note ${creditNote.noteNo} against ${creditNote.originalDocNo || ''}`,
    englishDate: creditNote.date, lines,
  });
  await touchOutstanding(client, creditNote.customerSubLedgerId, -grandTotal);

  if (returnCost > 0) {                                    // reverse COGS: DR Stock, CR COGS
    await postJournal(client, ctx, {
      voucherType: 'SALES_RETURN', sourceDocumentNo: creditNote.noteNo,
      narration: `Reverse COGS for ${creditNote.noteNo}`, englishDate: creditNote.date,
      lines: [{ accountCode: '10400', debit: returnCost }, { accountCode: '50100', credit: returnCost }],
    });
  }
  return { header, vat, taxableBase, nonTaxable, returnCost };
}

// ============================================================================
// E2. PURCHASE RETURN (Debit Note) — reduce vendor payable, reverse input VAT,
//     reverse discount received, and send goods out of stock (reverse the
//     purchase capitalization).
// ============================================================================
async function postPurchaseReturn(client, ctx, debitNote) {
  const vatRate = ctx.vatRate || VAT_RATE;
  let taxableBase = 0, nonTaxable = 0, landedReturn = 0;
  for (const it of debitNote.items) {
    const amt = round2((it.unitCost || 0) * it.quantity);
    if (Number(it.taxRate || 0) > 0) { taxableBase = round2(taxableBase + amt); landedReturn = round2(landedReturn + amt); }
    else { nonTaxable = round2(nonTaxable + amt); landedReturn = round2(landedReturn + amt); }
    await postStockOut(client, ctx, {
      productId: it.productId, qty: it.quantity, mode: 'layers', unitCost: it.unitCost,
      sourceType: 'PURCHASE_RETURN', sourceDocumentNo: debitNote.noteNo, englishDate: debitNote.date,
    });
  }
  const vat = round2(taxableBase * vatRate / 100);
  const discountReceived = round2(debitNote.discountReceived || 0);
  const grandTotal = round2(taxableBase + nonTaxable + vat - discountReceived);
  if (Math.abs(grandTotal - (debitNote.grandTotal || 0)) > 0.01) {
    throw new Error(`Debit note ${debitNote.noteNo} total mismatch`);
  }

  const lines = [
    { accountCode: '20400', subLedgerId: debitNote.vendorSubLedgerId, debit: grandTotal },
    { accountCode: '50200', credit: taxableBase },
    { accountCode: '50210', credit: nonTaxable },
    { accountCode: '10501', credit: vat },
  ];
  if (discountReceived > 0) lines.push({ accountCode: '40200', debit: discountReceived });

  const header = await postJournal(client, ctx, {
    voucherType: 'PURCHASE_RETURN', sourceDocumentType: 'debit_note',
    sourceDocumentNo: debitNote.noteNo, sourceDocumentId: debitNote.noteId,
    narration: `Debit note ${debitNote.noteNo} against ${debitNote.originalDocNo || ''}`,
    englishDate: debitNote.date, lines,
  });
  await touchOutstanding(client, debitNote.vendorSubLedgerId, -grandTotal);

  if (landedReturn > 0) {                                  // reverse capitalization: DR Purchase, CR Stock
    const rev = [{ accountCode: '10400', credit: landedReturn }];
    if (taxableBase > 0) rev.push({ accountCode: '50200', debit: taxableBase });
    if (nonTaxable > 0) rev.push({ accountCode: '50210', debit: nonTaxable });
    await postJournal(client, ctx, {
      voucherType: 'PURCHASE_RETURN', sourceDocumentNo: debitNote.noteNo,
      narration: `Reverse capitalization for ${debitNote.noteNo}`, englishDate: debitNote.date, lines: rev,
    });
  }
  return { header, vat, taxableBase, nonTaxable, landedReturn };
}

// ============================================================================
// Express reference handlers (wrap blocks in a single transaction)
// ============================================================================
function handlerFor(fn) {
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

module.exports = {
  withTx,
  pool,
  round2,
  getFiscalYear,
  ensureChartOfAccounts,
  postJournal,
  postStockIn,
  postStockOut,
  postCreditSale: handlerFor(postCreditSale),
  postCashSale: handlerFor(postCashSale),
  postCreditPurchase: handlerFor(postCreditPurchase),
  postImportPurchase: handlerFor(postImportPurchase),
  postSalesReturn: handlerFor(postSalesReturn),
  postPurchaseReturn: handlerFor(postPurchaseReturn),
  // Transaction-aware primitives for embedding inside existing routes:
  _postCreditSale: postCreditSale,
  _postCashSale: postCashSale,
  _postCreditPurchase: postCreditPurchase,
  _postImportPurchase: postImportPurchase,
  _postSalesReturn: postSalesReturn,
  _postPurchaseReturn: postPurchaseReturn,
};
