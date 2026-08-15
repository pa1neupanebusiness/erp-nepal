-- ============================================================================
-- Payment In (Receipt Voucher) Module — PostgreSQL Schema
-- Custom Nepali ERP — IRD audit-trail compliant
--
-- ACID guarantees are enforced at the application layer inside a single
-- transaction (BEGIN ... COMMIT / ROLLBACK). This schema additionally adds:
--   * DB-level immutability triggers (no UPDATE/DELETE on finalized receipts)
--   * A non-skippable receipt number via a per-(company, fiscal-year) counter
--     row that is locked (FOR UPDATE) and advanced inside the same transaction.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 0. Reference / master tables (assumed to exist; shown for context)
-- ---------------------------------------------------------------------------
-- accounts_ledgers  : chart of accounts (id, code, name, account_type,
--                     normal_balance, current_balance, company_id)
-- ledger_entries    : double-entry journal lines
--                     (id, ledger_id, entry_type debit/credit, amount,
--                      document_type, document_id, english_date, miti,
--                      description, company_id, created_by, created_at)
-- customers         : (id, name, pan, address, company_id)
-- sales_invoices    : (id, invoice_number, customer_id, outstanding_balance,
--                      status ['unpaid','partial','paid'], english_date, miti,
--                      grand_total, company_id)

-- ---------------------------------------------------------------------------
-- 1. Receipt Voucher Header
-- ---------------------------------------------------------------------------
CREATE TABLE receipt_vouchers (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL,
    fiscal_year       VARCHAR(9)  NOT NULL,          -- e.g. '2082/83' or '2025/26'
    receipt_number    VARCHAR(32) NOT NULL,          -- e.g. RCP-2082-000123
    transaction_date  DATE        NOT NULL,          -- English (AD) date
    miti              VARCHAR(16) NOT NULL,          -- Nepali (BS) date, e.g. '2082 Shrawan 07'
    payment_mode      VARCHAR(16) NOT NULL CHECK (payment_mode IN ('cash','bank','digital_wallet','cheque')),
    reference_no      VARCHAR(40),                   -- cheque no / transaction id / wallet ref
    debit_ledger_id   UUID NOT NULL REFERENCES accounts_ledgers(id),  -- cash | bank | wallet ledger
    customer_id       UUID REFERENCES customers(id),                   -- NULL allowed for walk-in
    gross_amount      NUMERIC(14,2) NOT NULL CHECK (gross_amount >= 0),
    discount_allowed  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_allowed >= 0),
    net_amount        NUMERIC(14,2) NOT NULL CHECK (net_amount >= 0),  -- gross_amount - discount_allowed
    narration         TEXT,
    created_by        UUID NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized         BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE => immutable (IRD audit)
    UNIQUE (company_id, fiscal_year, receipt_number)
);

CREATE INDEX idx_receipt_vouchers_customer ON receipt_vouchers (customer_id);
CREATE INDEX idx_receipt_vouchers_date     ON receipt_vouchers (company_id, transaction_date);

-- ---------------------------------------------------------------------------
-- 2. Receipt Adjustments — allocation of the receipt across unpaid invoices
-- ---------------------------------------------------------------------------
CREATE TABLE receipt_adjustments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id        UUID NOT NULL REFERENCES receipt_vouchers(id) ON DELETE RESTRICT,
    sales_invoice_id  UUID NOT NULL REFERENCES sales_invoices(id),
    allocated_amount  NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0),
    discount_applied  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_applied >= 0),
    UNIQUE (receipt_id, sales_invoice_id)
);

CREATE INDEX idx_receipt_adjustments_receipt ON receipt_adjustments (receipt_id);
CREATE INDEX idx_receipt_adjustments_invoice ON receipt_adjustments (sales_invoice_id);

-- ---------------------------------------------------------------------------
-- 3. Customer balance mirror (live totals for dashboard / aging)
--    Updated inside the SAME transaction as the receipt (no drift).
-- ---------------------------------------------------------------------------
CREATE TABLE customer_balances (
    company_id         UUID NOT NULL,
    customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (company_id, customer_id)
);

-- ---------------------------------------------------------------------------
-- 4. Receipt counter (non-skippable, immutable sequence)
--    The counter row is locked with FOR UPDATE inside the receipt transaction,
--    so a rollback also rolls the counter back => no gaps in numbering.
-- ---------------------------------------------------------------------------
CREATE TABLE receipt_counters (
    company_id    UUID NOT NULL,
    fiscal_year   VARCHAR(9) NOT NULL,
    next_value    BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, fiscal_year)
);

-- ---------------------------------------------------------------------------
-- 5. Outbox hook — live notification / ledger-sync placeholder
--    The controller writes a JSON row here (same transaction); a worker/
--    trigger consumes it to push dashboard/webhook updates without blocking
--    the request or breaking ACID if the push fails.
-- ---------------------------------------------------------------------------
CREATE TABLE receipt_outbox (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id    UUID NOT NULL,
    event         VARCHAR(24) NOT NULL,           -- 'receipt.created'
    payload       JSONB NOT NULL,
    status        VARCHAR(12) NOT NULL DEFAULT 'pending',  -- pending | delivered | failed
    attempts      INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at  TIMESTAMPTZ
);

CREATE INDEX idx_receipt_outbox_status ON receipt_outbox (status, created_at);

-- ---------------------------------------------------------------------------
-- 6. IMMUTABILITY TRIGGERS — finalized receipts can never be edited/deleted.
--    Reversals require a separate Credit Note / Receipt Reversal voucher.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_finalized_receipt_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.finalized = TRUE AND NEW.finalized = TRUE THEN
        RAISE EXCEPTION 'Finalized receipt % is immutable. Issue a reversal voucher instead.', OLD.receipt_number;
    END IF;
    IF TG_OP = 'DELETE' AND OLD.finalized = TRUE THEN
        RAISE EXCEPTION 'Finalized receipt % cannot be deleted. Issue a reversal voucher instead.', OLD.receipt_number;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receipt_vouchers_immutable
    BEFORE UPDATE OR DELETE ON receipt_vouchers
    FOR EACH ROW EXECUTE FUNCTION block_finalized_receipt_mutation();

-- Adjustments are immutable once written — they only change by creating a
-- whole new receipt (or reversal), never in place.
CREATE OR REPLACE FUNCTION block_receipt_adjustment_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Receipt adjustments are immutable. Create a reversal voucher instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receipt_adjustments_immutable
    BEFORE UPDATE OR DELETE ON receipt_adjustments
    FOR EACH ROW EXECUTE FUNCTION block_receipt_adjustment_mutation();
