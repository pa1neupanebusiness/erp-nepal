# Purchase Lifecycle — PostgreSQL Module (Nepal IRD)

Atomic money-out module for the Nepali ERP. Three modules — **Purchase Entry**,
**Payment Out (Vendor Payment Voucher)**, **Purchase Return (Debit Note)** —
each run inside **one PostgreSQL transaction**. `COMMIT` applies the whole batch
(header, lines, journal, vendor outstanding, inventory, register) or `ROLLBACK`
applies none.

## Files
- `schema.sql` — tables + integrity triggers + non-skippable counters.
- `purchase.controller.js` — `Express` + `pg` handlers (create + list).

## ACID flow (each module, one transaction)
1. Validate vendor / items / ledger references belong to the company.
2. Lock & advance `document_counters` → gap-free numbers:
   `PUR-<FY>-NNNNNN`, `PMT-<FY>-NNNNNN`, `DN-<FY>-NNNNNN`
   (a rollback also rolls the counter back — numbering never gaps).
3. Write the source document + line items with explicit field assignments.
4. Post a balanced double-entry journal on `journal_headers` / `journal_lines`
   (Sundry Creditors postings require the vendor `sub_ledger_id` — enforced by
   DB trigger AND pre-validated here).
5. Update `vendors.current_outstanding_balance`.
6. Drive inventory: FIFO `stock_ledger_batches` + `item_master.current_stock_qty`.
7. Module A also appends the Annex-6 `purchase_register` row.
8. Re-read each write before `COMMIT` (write-verify).

## Postings
| Module | Debit | Credit |
|---|---|---|
| Purchase Entry | 50200 Taxable, 50210 Exempt, 10501 Input VAT (13%), 40200 Discount Received | 20400 Sundry Creditors |
| Payment Out | 20400 Sundry Creditors | Cash/Bank/Wallet (amount paid), 40200 Discount Received (settlement discount) |
| Purchase Return | 20400 Sundry Creditors | 50200, 50210, 10501 Input VAT (13%) |

## Immutability
Finalized `purchase_invoices`, `vendor_payment_vouchers`, and `debit_notes`
cannot be `UPDATE`d or `DELETE`d — enforced by DB triggers. The only mutation
permitted is the payment engine's `amount_paid` / `status` transition on
`purchase_invoices`, which the controller enables via the transaction-local GUC
`SET LOCAL purchase.allow_invoice_mutation = 'payment'` (auto-cleared on
`COMMIT`/`ROLLBACK`). Corrections are **reversal documents** (Debit Notes).

## Wiring notes
- Requires tables: `chart_of_accounts`, `vendors`, `item_master`,
  `purchase_invoices`, `vendor_payment_vouchers`, `debit_notes`,
  `journal_headers`/`journal_lines`, `stock_ledger_batches`,
  `purchase_register`, `document_counters` — all in `schema.sql`.
- Set `global.adToBikramSambat` (from `server/utils/dateUtils.js`) so the
  controller fills the Nepali `miti` from the AD date, or pass `miti` explicitly.
- Routes (example): `POST /api/companies/:companyId/purchases`,
  `POST /api/companies/:companyId/payments`, `POST /api/companies/:companyId/debit-notes`,
  plus `GET` list handlers for each.

## Request shapes
```json
// POST purchases
{
  "purchase": {
    "fiscal_year": "2082/83", "english_date": "2026-08-08",
    "vendor_id": "…", "vendor_invoice_number": "VND-881",
    "remarks": "Monthly stock refill"
  },
  "items": [
    { "item_id": "…", "quantity": 10, "unit_cost": 500, "discount_received": 0 }
  ]
}

// POST payments — allocations are the FULL settlement (cash + discount)
{
  "payment": {
    "fiscal_year": "2082/83", "english_date": "2026-08-10",
    "vendor_id": "…", "payment_mode": "Bank", "paid_from_ledger_code": "10200",
    "amount_paid": 9500, "cash_discount_received": 500
  },
  "allocations": [
    { "purchase_invoice_id": "…", "allocated_amount": 10000 }
  ]
}

// POST debit-notes
{
  "debitNote": {
    "fiscal_year": "2082/83", "english_date": "2026-08-12",
    "original_purchase_id": "…", "reason": "Damaged goods returned"
  },
  "items": [
    { "item_id": "…", "quantity": 2, "unit_cost": 500 }
  ]
}
```
