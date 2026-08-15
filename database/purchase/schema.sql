-- ============================================================================
-- PURCHASE LIFECYCLE ENGINE — Nepal IRD Compliant
--   Module A: Purchase Entry
--   Module B: Payment Out  (Vendor Payment Voucher)
--   Module C: Purchase Return (Debit Note)
--
-- Legal framing (Nepal):
--   * VAT Act 2052  — flat 13% Input VAT on 'Taxable_13%' items, Credit/Debit
--     Note adjustments, Annex-6 Purchase Register for monthly VAT returns.
--   * Income Tax Act 2058 — Cash Discount Received income, withholding rules.
--   * IRD audit     — documents are immutable once finalized; numbering is
--     gap-free (non-skippable) per company + fiscal year; corrections are
--     reversal documents (Debit Notes), never edits/deletes.
--
-- Integrity is enforced at the DATABASE level:
--   1. Every journal must balance (debits == credits) — constraint trigger
--      re-checks the whole header after any line mutation.
--   2. Postings to the Sundry Creditors control account FAIL unless they carry
--      a valid `sub_ledger_id` referencing a specific `vendors` record.
--   3. Finalized purchase invoices / payment vouchers / debit notes cannot be
--      edited or deleted. The only mutation permitted is the payment engine's
--      status transition on `purchase_invoices` (see trigger GUC escape).
--   4. Every financial date is stored in BOTH English (DATE) and Nepali Miti
--      (BS, authoritative for IRD) on the same row.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. chart_of_accounts — ledger master (IRD classification)
-- ---------------------------------------------------------------------------
CREATE TABLE chart_of_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL,
    code            VARCHAR(16) NOT NULL,
    name            VARCHAR(120) NOT NULL,
    ledger_group    VARCHAR(32) NOT NULL CHECK (ledger_group IN (
                    'Sundry_Creditors',   -- CONTROL — requires vendor sub-ledger
                    'Purchase',           -- Direct Expense
                    'Duties_Taxes',       -- Input VAT, TDS (asset / liability)
                    'Cash_Bank',          -- Cash-in-Hand, Bank, Digital Wallet
                    'Indirect_Incomes',   -- Discount Received
                    'Sundry_Debtors',
                    'Stock',
                    'Sales',
                    'Indirect_Expenses',
                    'COGS')),
    account_type    VARCHAR(12) NOT NULL CHECK (account_type IN
                    ('asset','liability','equity','income','expense')),
    normal_balance  VARCHAR(6) NOT NULL DEFAULT 'debit' CHECK (normal_balance IN ('debit','credit')),
    is_control      BOOLEAN NOT NULL DEFAULT FALSE,   -- sub-ledger (vendor) required on posting lines
    is_vat_account  BOOLEAN NOT NULL DEFAULT FALSE,   -- feeds VAT return / PAN books
    is_costing      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);

-- Authoritative IRD chart (seeded per company by the controller):
-- 10100 Cash in Hand                 | asset   | Cash_Bank
-- 10200 Bank Account                 | asset   | Cash_Bank
-- 10210 Digital Wallet               | asset   | Cash_Bank
-- 20400 Sundry Creditors (CONTROL)   | liab    | Sundry_Creditors   (sub-ledger required)
-- 10501 Input VAT (Purchases)        | asset   | Duties_Taxes       (VAT)
-- 40200 Discount Received            | income  | Indirect_Incomes
-- 50200 Purchase — Taxable           | expense | Purchase
-- 50210 Purchase — Exempt            | expense | Purchase
-- 50290 Purchase Returns             | expense | Purchase

-- ---------------------------------------------------------------------------
-- 2. vendors — vendor master with IRD PAN and running outstanding
-- ---------------------------------------------------------------------------
CREATE TABLE vendors (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID NOT NULL,
    vendor_code                 VARCHAR(32) NOT NULL,
    legal_name                  VARCHAR(160) NOT NULL,
    registered_address          TEXT,
    pan_number                  VARCHAR(20) NOT NULL,      -- IRD 9-digit PAN / VAT
    phone                       VARCHAR(32),
    current_outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, vendor_code),
    UNIQUE (company_id, pan_number),
    CONSTRAINT vendors_pan_format CHECK (pan_number ~ '^[0-9]{9}$')
);
CREATE INDEX idx_vendors_company ON vendors (company_id, legal_name);

-- ---------------------------------------------------------------------------
-- 3. item_master — inventory item register (stock + tax category)
-- ---------------------------------------------------------------------------
CREATE TABLE item_master (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    item_code           VARCHAR(32) NOT NULL,
    item_name           VARCHAR(160) NOT NULL,
    uom                 VARCHAR(16) NOT NULL,
    tax_category        VARCHAR(16) NOT NULL DEFAULT 'Taxable_13%'
                        CHECK (tax_category IN ('Taxable_13%','Exempt')),
    current_stock_qty   NUMERIC(14,3) NOT NULL DEFAULT 0,
    default_unit_cost   NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, item_code)
);
CREATE INDEX idx_item_master_company ON item_master (company_id, item_name);

-- ---------------------------------------------------------------------------
-- 4. purchase_invoices + purchase_invoice_items
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL,
    invoice_number          VARCHAR(40) NOT NULL,           -- system gap-free number
    vendor_invoice_number   VARCHAR(60),                    -- vendor's own bill number
    vendor_id               UUID NOT NULL REFERENCES vendors(id),
    miti                    VARCHAR(20) NOT NULL,           -- Nepali BS date (authoritative)
    english_date            DATE NOT NULL,                  -- AD working date
    gross_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,   -- taxable + exempt, pre-VAT
    discount_received       NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    exempt_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_paid_13             NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_grand_total         NUMERIC(14,2) NOT NULL,
    amount_paid             NUMERIC(14,2) NOT NULL DEFAULT 0,
    status                  VARCHAR(10) NOT NULL DEFAULT 'Unpaid'
                            CHECK (status IN ('Unpaid','Partial','Paid')),
    remarks                 TEXT,
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, invoice_number),
    -- Net = gross − discount + VAT (13% flat on taxable portion)
    CONSTRAINT pur_net_check CHECK (
        net_grand_total = ROUND((gross_amount - discount_received + vat_paid_13)::numeric, 2)),
    CONSTRAINT pur_vat_check CHECK (vat_paid_13 >= 0)
);
CREATE INDEX idx_pur_invoices_vendor   ON purchase_invoices (company_id, vendor_id, english_date);
CREATE INDEX idx_pur_invoices_status   ON purchase_invoices (company_id, status);

CREATE TABLE purchase_invoice_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
    item_id             UUID NOT NULL REFERENCES item_master(id),
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_cost           NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    discount_received   NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,   -- (qty×cost) − discount, taxable portion
    exempt_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,   -- exempt portion
    vat_paid            NUMERIC(14,2) NOT NULL DEFAULT 0    -- 13% × taxable_amount
);
CREATE INDEX idx_pur_items_invoice ON purchase_invoice_items (purchase_invoice_id);

-- ---------------------------------------------------------------------------
-- 5. vendor_payment_vouchers + payment_allocations
-- ---------------------------------------------------------------------------
CREATE TABLE vendor_payment_vouchers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL,
    voucher_number          VARCHAR(40) NOT NULL,           -- gap-free (PMT-...)
    miti                    VARCHAR(20) NOT NULL,
    english_date            DATE NOT NULL,
    vendor_id               UUID NOT NULL REFERENCES vendors(id),
    payment_mode            VARCHAR(10) NOT NULL CHECK (payment_mode IN ('Cash','Bank','Digital')),
    paid_from_ledger_id     UUID NOT NULL REFERENCES chart_of_accounts(id),
    amount_paid             NUMERIC(14,2) NOT NULL CHECK (amount_paid > 0),
    cash_discount_received  NUMERIC(14,2) NOT NULL DEFAULT 0,
    cheque_reference        VARCHAR(40),
    narration               TEXT,
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, voucher_number)
);
CREATE INDEX idx_pay_vouchers_vendor ON vendor_payment_vouchers (company_id, vendor_id, english_date);

CREATE TABLE payment_allocations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_voucher_id  UUID NOT NULL REFERENCES vendor_payment_vouchers(id) ON DELETE RESTRICT,
    purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
    allocated_amount     NUMERIC(14,2) NOT NULL CHECK (allocated_amount > 0)
);
CREATE INDEX idx_pay_alloc_voucher ON payment_allocations (payment_voucher_id);
CREATE INDEX idx_pay_alloc_invoice ON payment_allocations (purchase_invoice_id);

-- ---------------------------------------------------------------------------
-- 6. debit_notes + debit_note_items (Purchase Return / reversal documents)
-- ---------------------------------------------------------------------------
CREATE TABLE debit_notes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL,
    debit_note_number       VARCHAR(40) NOT NULL,           -- gap-free (DN-...)
    original_purchase_id    UUID NOT NULL REFERENCES purchase_invoices(id),
    vendor_id               UUID NOT NULL REFERENCES vendors(id),
    miti                    VARCHAR(20) NOT NULL,
    english_date            DATE NOT NULL,
    net_returned_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,   -- taxable + exempt returned
    vat_returned_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,   -- 13% × taxable returned
    total_debit_amount      NUMERIC(14,2) NOT NULL,             -- net_returned + vat_returned
    reason                  TEXT,
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, debit_note_number),
    CONSTRAINT dn_total_check CHECK (
        total_debit_amount = ROUND((net_returned_amount + vat_returned_amount)::numeric, 2))
);
CREATE INDEX idx_dn_vendor ON debit_notes (company_id, vendor_id, english_date);
CREATE INDEX idx_dn_original ON debit_notes (company_id, original_purchase_id);

CREATE TABLE debit_note_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debit_note_id       UUID NOT NULL REFERENCES debit_notes(id) ON DELETE RESTRICT,
    item_id             UUID NOT NULL REFERENCES item_master(id),
    quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
    unit_cost           NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
    taxable_returned    NUMERIC(14,2) NOT NULL DEFAULT 0,
    exempt_returned     NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_returned        NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_dn_items_note ON debit_note_items (debit_note_id);

-- ---------------------------------------------------------------------------
-- 7. journal_headers + journal_lines — financial double-entry
-- ---------------------------------------------------------------------------
CREATE TABLE journal_headers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL,
    voucher_no              VARCHAR(40) NOT NULL,           -- gap-free (PUR-... / PMT-... / DN-...)
    voucher_type            VARCHAR(20) NOT NULL CHECK (voucher_type IN
                            ('PURCHASE','PAYMENT','DEBIT_NOTE')),
    fiscal_year             VARCHAR(12) NOT NULL,           -- e.g. '2082/83'
    miti                    VARCHAR(20) NOT NULL,           -- Nepali BS date (authoritative)
    english_date            DATE NOT NULL,                  -- AD working date
    narration               TEXT,
    source_document_type    VARCHAR(20),                    -- purchase_invoice | vendor_payment | debit_note
    source_document_no      VARCHAR(40),
    source_document_id      UUID,
    status                  VARCHAR(10) NOT NULL DEFAULT 'posted'
                            CHECK (status IN ('posted','reversed')),
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, voucher_no)
);
CREATE INDEX idx_jh_doc  ON journal_headers (company_id, source_document_id);
CREATE INDEX idx_jh_date ON journal_headers (company_id, english_date);

CREATE TABLE journal_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_header_id   UUID NOT NULL REFERENCES journal_headers(id) ON DELETE RESTRICT,
    account_id          UUID NOT NULL REFERENCES chart_of_accounts(id),
    sub_ledger_id       UUID REFERENCES vendors(id),        -- REQUIRED for Sundry Creditors
    debit_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    CONSTRAINT jl_single_side CHECK (NOT (debit_amount > 0 AND credit_amount > 0)),
    CONSTRAINT jl_positive     CHECK (debit_amount >= 0 AND credit_amount >= 0)
);
CREATE INDEX idx_jl_header   ON journal_lines (journal_header_id);
CREATE INDEX idx_jl_account  ON journal_lines (account_id);
CREATE INDEX idx_jl_subledger ON journal_lines (sub_ledger_id);

-- ---------------------------------------------------------------------------
-- 8. stock_ledger_batches — FIFO cost layers (landed cost, dual-dated)
-- ---------------------------------------------------------------------------
CREATE TABLE stock_ledger_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    item_id             UUID NOT NULL REFERENCES item_master(id),
    source_transaction_id UUID NOT NULL,                    -- purchase_invoice.id
    source_module       VARCHAR(16) NOT NULL CHECK (source_module IN
                        ('PURCHASE','PAYMENT','DEBIT_NOTE')),
    layer_miti          VARCHAR(20) NOT NULL,               -- Nepali BS date
    layer_date          DATE NOT NULL,                      -- AD date
    original_qty        NUMERIC(14,3) NOT NULL CHECK (original_qty > 0),
    remaining_qty       NUMERIC(14,3) NOT NULL DEFAULT 0,
    unit_cost_price     NUMERIC(14,2) NOT NULL,             -- landed unit cost
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_slb_item ON stock_ledger_batches (company_id, item_id, layer_date);

-- ---------------------------------------------------------------------------
-- 9. purchase_register — Annex-6 legal register (append-only, Module A)
-- ---------------------------------------------------------------------------
CREATE TABLE purchase_register (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    register_row_no     BIGINT NOT NULL,                    -- per fiscal year
    fiscal_year         VARCHAR(12) NOT NULL,
    purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
    miti                VARCHAR(20) NOT NULL,
    english_date        DATE NOT NULL,
    invoice_number      VARCHAR(40) NOT NULL,
    vendor_invoice_no   VARCHAR(60),
    vendor_pan          VARCHAR(20) NOT NULL,
    vendor_name         VARCHAR(160) NOT NULL,
    gross_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_received   NUMERIC(14,2) NOT NULL DEFAULT 0,
    taxable_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    exempt_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    vat_paid_13         NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_grand_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, fiscal_year, register_row_no),
    UNIQUE (company_id, purchase_invoice_id)
);
CREATE INDEX idx_pur_register_date ON purchase_register (company_id, english_date);

-- ---------------------------------------------------------------------------
-- 10. document_counters — non-skippable, gap-free numbering
--     (allocated via SELECT ... FOR UPDATE inside the SAME transaction as the
--      document insert — a rollback rolls the counter back, so no gaps.)
-- ---------------------------------------------------------------------------
CREATE TABLE document_counters (
    company_id      UUID NOT NULL,
    fiscal_year     VARCHAR(12) NOT NULL,
    doc_type        VARCHAR(12) NOT NULL CHECK (doc_type IN
                    ('PURCHASE','PAYMENT','DEBIT_NOTE')),
    next_value      BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, fiscal_year, doc_type)
);

-- ============================================================================
-- INTEGRITY TRIGGERS
-- ============================================================================

-- (1) Balanced journals ------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_balanced_journal()
RETURNS TRIGGER AS $$
DECLARE
    header_id UUID;
    dr NUMERIC(14,2);
    cr NUMERIC(14,2);
BEGIN
    IF TG_OP = 'DELETE' THEN header_id := OLD.journal_header_id;
    ELSE header_id := NEW.journal_header_id;
    END IF;

    SELECT COALESCE(SUM(debit_amount),0), COALESCE(SUM(credit_amount),0)
      INTO dr, cr
      FROM journal_lines
     WHERE journal_header_id = header_id;

    IF dr = 0 AND cr = 0 THEN
        RAISE EXCEPTION 'Empty journal header % cannot be posted', header_id;
    END IF;
    IF ROUND(dr,2) <> ROUND(cr,2) THEN
        RAISE EXCEPTION 'Unbalanced journal header % — debits % vs credits %', header_id, dr, cr;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_journal_balanced
    AFTER INSERT OR UPDATE OR DELETE ON journal_lines
    DEFERRABLE INITIALLY IMMEDIATE
    FOR EACH ROW EXECUTE FUNCTION enforce_balanced_journal();

-- (2) Sundry Creditors control-account guard --------------------------------
-- Any posting to a Sundry_Creditors ledger account must carry a vendor
-- sub_ledger_id or the transaction is rejected at the database level.
CREATE OR REPLACE FUNCTION guard_control_account()
RETURNS TRIGGER AS $$
DECLARE
    ctl BOOLEAN;
BEGIN
    SELECT is_control INTO ctl FROM chart_of_accounts WHERE id = NEW.account_id;
    IF ctl AND NEW.sub_ledger_id IS NULL THEN
        RAISE EXCEPTION 'Sundry Creditors posting (account %) requires a valid vendor sub_ledger_id',
            NEW.account_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_lines_control
    BEFORE INSERT OR UPDATE ON journal_lines
    FOR EACH ROW EXECUTE FUNCTION guard_control_account();

-- (3) Immutability of finalized documents ------------------------------------
-- Purchase invoices may only be mutated by the payment engine (which sets the
-- GUC 'purchase.allow_invoice_mutation' = 'payment' inside its transaction).
CREATE OR REPLACE FUNCTION block_finalized_purchase_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('purchase.allow_invoice_mutation', true) = 'payment' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Purchase invoice % is finalized and immutable. Post a Debit Note for corrections.',
        OLD.invoice_number;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_purchase_invoices_immutable
    BEFORE UPDATE OR DELETE ON purchase_invoices
    FOR EACH ROW EXECUTE FUNCTION block_finalized_purchase_mutation();

CREATE OR REPLACE FUNCTION block_finalized_payment_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Vendor payment voucher % is finalized and immutable. Reverse via a matching voucher.',
        OLD.voucher_number;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_vouchers_immutable
    BEFORE UPDATE OR DELETE ON vendor_payment_vouchers
    FOR EACH ROW EXECUTE FUNCTION block_finalized_payment_mutation();

CREATE OR REPLACE FUNCTION block_finalized_debitnote_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Debit note % is finalized and immutable.', OLD.debit_note_number;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_debit_notes_immutable
    BEFORE UPDATE OR DELETE ON debit_notes
    FOR EACH ROW EXECUTE FUNCTION block_finalized_debitnote_mutation();
