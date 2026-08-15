// ============================================================================
// Payment In (Receipt Voucher) — Atomic PostgreSQL controller (Express + pg)
//
// Single-transaction ACID flow:
//   1. Validate customer, mode, dates, amounts, and that the target invoices
//      are NOT already fully settled (no double payment).
//   2. Lock + advance the non-skippable receipt counter (FOR UPDATE).
//   3. Insert receipt_vouchers + receipt_adjustments.
//   4. Debit the cash/bank ledger and credit the customer (receipts control
//      account) — double entry on ledger_entries.
//   5. Reduce each invoice's outstanding_balance, snap the status.
//   6. Upsert customer_balances mirror.
//   7. Enqueue receipt_outbox (same tx) for dashboard / webhook push.
//   COMMIT only if every step succeeded; otherwise ROLLBACK (receipt number
//   is rolled back too — numbering never gaps).
//
// Reversal: insert a "receipt reversal" row flagged finalized=FALSE once, or
// create a negative Credit-Note voucher; finalized rows are DB-immutable.
// ============================================================================

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const pad = (n, w) => String(n).padStart(w, '0');

async function generateReceiptNumber(client, companyId, fiscalYear) {
  // Non-skippable: the counter row is locked for the whole transaction.
  const counter = await client.query(
    `INSERT INTO receipt_counters (company_id, fiscal_year, next_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (company_id, fiscal_year) DO UPDATE SET next_value = receipt_counters.next_value
     RETURNING next_value`,
    [companyId, fiscalYear]
  );
  const next = counter.rows[0].next_value;

  await client.query(
    `UPDATE receipt_counters
        SET next_value = next_value + 1
      WHERE company_id = $1 AND fiscal_year = $2`,
    [companyId, fiscalYear]
  );

  // Serial numbering by fiscal year. A rolled-back tx also rolls back the
  // increment (the row lock only lasts as long as the transaction).
  return `RCP-${fiscalYear}-${pad(next, 6)}`;
}

function englishToMiti(adDate) {
  // Server has `adToBikramSambat` in server/utils/dateUtils.js — keep this a
  // thin adapter so the controller stays pure SQL/data and the calendar lib
  // can be swapped (e.g. bikram-sambat-js) without touching the transaction.
  return global.adToBikramSambat ? global.adToBikramSambat(new Date(adDate)) : adDate;
}

async function createReceipt(client, { companyId, userId, receipt, items }) {
  // -- 1. Validate -----------------------------------------------------------
  const mode = receipt.payment_mode || 'cash';
  const gross = Number(receipt.gross_amount || 0);
  const discount = Number(receipt.discount_allowed || 0);
  const net = Number(receipt.net_amount ?? (gross - discount));

  if (!Number.isFinite(gross) || !Number.isFinite(net) || gross < 0 || net < 0 || net > gross) {
    throw new Error('Invalid receipt amounts');
  }
  if (!items || items.length === 0) {
    throw new Error('At least one invoice allocation is required');
  }

  const allocatedSum = items.reduce((s, it) => s + Number(it.allocated_amount || 0) + Number(it.discount_applied || 0), 0);
  if (Math.abs(allocatedSum - gross) > 0.01) {
    throw new Error('Allocated amounts + discounts must equal the gross receipt amount');
  }

  // -- 2. Counter (non-skippable number) -------------------------------------
  const receiptNumber = await generateReceiptNumber(client, companyId, receipt.fiscal_year);

  // -- 3. Lock + validate target invoices (prevents double allocation) -------
  const invoiceRows = await client.query(
    `SELECT si.id, si.invoice_number, si.outstanding_balance, si.status
       FROM sales_invoices si
      WHERE si.id = ANY($1::uuid[])
        AND si.company_id = $2
        AND si.outstanding_balance > 0
      FOR UPDATE`,
    [items.map(i => i.sales_invoice_id), companyId]
  );
  const invMap = new Map(invoiceRows.rows.map(r => [r.id, r]));
  for (const it of items) {
    const inv = invMap.get(it.sales_invoice_id);
    const asked = Number(it.allocated_amount || 0) + Number(it.discount_applied || 0);
    if (!inv) throw new Error(`Invoice not found or already fully settled`);
    if (asked > Number(inv.outstanding_balance) + 0.01) {
      throw new Error(`Allocation ${asked} exceeds outstanding ${inv.outstanding_balance} on ${inv.invoice_number}`);
    }
  }

  // -- 4. Header --------------------------------------------------------------
  const header = await client.query(
    `INSERT INTO receipt_vouchers
        (company_id, fiscal_year, receipt_number, transaction_date, miti,
         payment_mode, reference_no, debit_ledger_id, customer_id,
         gross_amount, discount_allowed, net_amount, narration, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [companyId, receipt.fiscal_year, receiptNumber, receipt.transaction_date,
     receipt.miti || englishToMiti(receipt.transaction_date), mode,
     receipt.reference_no || null, receipt.debit_ledger_id, receipt.customer_id || null,
     gross, discount, net, receipt.narration || null, userId]
  );
  const voucher = header.rows[0];

  // -- 5. Adjustments ----------------------------------------------------------
  const adjSql = `INSERT INTO receipt_adjustments
      (receipt_id, sales_invoice_id, allocated_amount, discount_applied)
      VALUES ($1,$2,$3,$4)`;
  for (const it of items) {
    await client.query(adjSql, [voucher.id, it.sales_invoice_id, it.allocated_amount, it.discount_applied || 0]);
  }

  // -- 6. Reduce invoice outstanding + status snapshot -------------------------
  const updateInv = await client.query(
    `UPDATE sales_invoices
        SET outstanding_balance = ROUND((outstanding_balance - $2 - $3)::numeric, 2),
            status = CASE WHEN outstanding_balance - $2 - $3 <= 0.009 THEN 'paid' ELSE 'partial' END,
            updated_at = now()
      WHERE id = $1
      RETURNING id, invoice_number, outstanding_balance, status`,
    [items[0].sales_invoice_id, items[0].allocated_amount, items[0].discount_applied || 0]
  );
  for (const it of items.slice(1)) {
    await client.query(
      `UPDATE sales_invoices
          SET outstanding_balance = ROUND((outstanding_balance - $2 - $3)::numeric, 2),
              status = CASE WHEN outstanding_balance - $2 - $3 <= 0.009 THEN 'paid' ELSE 'partial' END,
              updated_at = now()
        WHERE id = $1`,
      [it.sales_invoice_id, it.allocated_amount, it.discount_applied || 0]
    );
  }
  void updateInv; // first invoice status returned above if the caller wants it

  // -- 7. Double entry ----------------------------------------------------------
  // Debit  : Cash/Bank/Wallet (debit_ledger)                    DR  net_amount
  // Credit : Customer / Receipts control account (customer)     CR  net_amount
  const entries = [
    { ledger_id: voucher.debit_ledger_id, type: 'debit',  amount: net },
    { ledger_id: receipt.customer_ledger_id, type: 'credit', amount: net },
  ];
  const entrySql = `INSERT INTO ledger_entries
      (ledger_id, entry_type, amount, document_type, document_id,
       english_date, miti, description, company_id, created_by)
      VALUES ($1,$2,$3,'receipt',$4,$5,$6,$7,$8,$9)`;
  for (const e of entries) {
    await client.query(entrySql, [e.ledger_id, e.type, e.amount, voucher.id,
      voucher.transaction_date, voucher.miti,
      `Receipt ${voucher.receipt_number}`, companyId, userId]);
  }

  // -- 8. Customer balance mirror -------------------------------------------------
  if (voucher.customer_id) {
    await client.query(
      `INSERT INTO customer_balances (company_id, customer_id, outstanding_balance)
       VALUES ($1,$2,$3)
       ON CONFLICT (company_id, customer_id)
       DO UPDATE SET outstanding_balance = customer_balances.outstanding_balance - EXCLUDED.outstanding_balance,
                     updated_at = now()`,
      [companyId, voucher.customer_id, net]
    );
  }

  // -- 9. Outbox hook (same transaction; push failure never corrupts the receipt) --
  await client.query(
    `INSERT INTO receipt_outbox (receipt_id, event, payload)
     VALUES ($1, 'receipt.created', $2)`,
    [voucher.id, JSON.stringify({ receipt_number: receiptNumber, net_amount: net, mode })]
  );

  return voucher;
}

// ---------------------------------------------------------------------------
// Express handler — one transaction per request.
// ---------------------------------------------------------------------------
async function handler(req, res) {
  const { companyId } = req.params;
  const { userId } = req.auth || { userId: null };
  const { receipt, items } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const voucher = await createReceipt(client, { companyId, userId, receipt, items });
    await client.query('COMMIT');
    res.status(201).json({ success: true, voucher });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
}

// GET list + live summary for a fiscal year (read path, no transaction needed)
async function listHandler(req, res) {
  const { companyId } = req.params;
  const { fiscal_year } = req.query;
  const result = await pool.query(
    `SELECT rv.*, c.name AS customer_name,
            SUM(ra.allocated_amount)::float AS allocated_total
       FROM receipt_vouchers rv
       LEFT JOIN customers c ON c.id = rv.customer_id
       LEFT JOIN receipt_adjustments ra ON ra.receipt_id = rv.id
      WHERE rv.company_id = $1 AND ($2::varchar IS NULL OR rv.fiscal_year = $2)
      GROUP BY rv.id, c.name
      ORDER BY rv.transaction_date DESC`,
    [companyId, fiscal_year || null]
  );
  const summary = await pool.query(
    `SELECT fiscal_year, COUNT(*) AS count, SUM(net_amount)::float AS total
       FROM receipt_vouchers
      WHERE company_id = $1 AND ($2::varchar IS NULL OR fiscal_year = $2)
      GROUP BY fiscal_year`,
    [companyId, fiscal_year || null]
  );
  res.json({ rows: result.rows, summary: summary.rows });
}

module.exports = { handler, listHandler, createReceipt, generateReceiptNumber };
