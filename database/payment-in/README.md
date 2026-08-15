# Payment In (Receipt Voucher) — PostgreSQL Module

Atomic money-in module for the Nepali ERP. A single receipt transaction writes
the voucher, invoice allocation, double-entry ledger lines, customer balance,
and outbox hook inside **one PostgreSQL transaction** — `COMMIT` or `ROLLBACK`
for the whole batch.

## Files
- `schema.sql` — tables + immutability triggers + non-skippable counter.
- `paymentIn.controller.js` — `Express` + `pg` handlers (create, list).

## ACID flow (all in one transaction)
1. Validate amounts + lock target invoices `FOR UPDATE` (no double payment).
2. Lock & advance `receipt_counters` → gap-free number `RCP-<FY>-NNNNNN`
   (a rollback also rolls the counter back).
3. Insert `receipt_vouchers` + `receipt_adjustments`.
4. Reduce each invoice's `outstanding_balance`, snapshot `status` (partial/paid).
5. Double entry on `ledger_entries`: DR Cash/Bank/Wallet, CR Customer account.
6. Upsert `customer_balances` mirror.
7. Insert `receipt_outbox` row for dashboard/webhook push.

## Immutability
`receipt_vouchers` with `finalized = TRUE` (always, at creation) cannot be
`UPDATE`d or `DELETE`d — enforced by DB trigger. `receipt_adjustments` are
immutable outright. Corrections require a **reversal voucher** (new negative
receipt or Credit Note), preserving the IRD audit trail.

## Wiring notes
- Requires tables: `accounts_ledgers`, `ledger_entries`, `customers`,
  `sales_invoices` (with `outstanding_balance`, `status`, `company_id`).
- Set `global.adToBikramSambat` (from `server/utils/dateUtils.js`) so the
  controller fills the Nepali `miti` from the AD date, or pass `receipt.miti`.
- Route example: `POST /api/companies/:companyId/receipts`,
  `GET  /api/companies/:companyId/receipts?fiscal_year=2082/83`.
- Body shape:
  ```json
  {
    "receipt": {
      "fiscal_year": "2082/83",
      "transaction_date": "2026-08-08",
      "payment_mode": "cash",
      "debit_ledger_id": "…",
      "customer_ledger_id": "…",
      "customer_id": "…",
      "gross_amount": 10000,
      "discount_allowed": 0,
      "reference_no": "CHEQ-0001",
      "narration": "On-account"
    },
    "items": [
      { "sales_invoice_id": "…", "allocated_amount": 6000, "discount_applied": 0 },
      { "sales_invoice_id": "…", "allocated_amount": 4000, "discount_applied": 0 }
    ]
  }
  ```
