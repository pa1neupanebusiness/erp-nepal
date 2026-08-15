-- ============================================================================
-- GENERAL LEDGER ENGINE — Nepal IRD Compliant Double-Entry Routing System
--
-- Scope: automated double-entry routing for Sales (B2B/B2C), Purchases
-- (credit + import), and Returns (Credit Note / Debit Note), with an
-- inventory costing ledger (FIFO / Weighted Average) and COGS automation.
--
-- Legal framing (Nepal):
--   * VAT Act 2052  — Output VAT 13% (Sales), Input VAT (Purchases),
--     Import VAT collected at the border, Credit/Debit Note adjustments.
--   * Income Tax Act 2058 — TDS and classified income/expense routing.
--   * IRD audit — vouchers are immutable once posted; numbering is
--     gap-free (non-skippable) per company + fiscal year.
--
-- Integrity is enforced at the DATABASE level:
--   1. Every journal header must balance (debits == credits) — enforced by
--      a constraint trigger that re-checks the whole header after any
--      line mutation.
--   2. Control accounts (Sundry Debtors / Sundry Creditors) reject any line
--      that has no Sub-Ledger (Customer / Vendor) reference.
--   3. Posted vouchers cannot be edited or deleted (reversal-only).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. accounts_chart — ledger with IRD classification groups
-- ---------------------------------------------------------------------------
CREATE TABLE accounts_chart (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL,
    code            VARCHAR(16) NOT NULL,
    name            VARCHAR(120) NOT NULL,
    account_type    VARCHAR(12) NOT NULL CHECK (account_type IN
                    ('asset','liability','equity','income','expense')),
    group_name      VARCHAR(32) NOT NULL CHECK (group_name IN (
                    'Cash_Bank',          -- Cash-in-Hand, Bank, Digital Wallet
                    'Sundry_Debtors',     -- Current Asset (control)
                    'Stock',              -- Stock-in-Hand (inventory)
                    'Duties_Taxes',       -- Output/Input VAT, TDS, Customs (asset|liability)
                    'Sundry_Creditors',   -- Current Liability (control)
                    'Sales',              -- Direct Income
                    'Indirect_Incomes',   -- e.g. Discount Received
                    'Purchase',           -- Direct Expense
                    'Indirect_Expenses',  -- e.g. Discount Allowed, Freight
                    'COGS')),             -- Cost of Goods Sold
    normal_balance  VARCHAR(6) NOT NULL DEFAULT 'debit' CHECK (normal_balance IN ('debit','credit')),
    is_control      BOOLEAN NOT NULL DEFAULT FALSE,   -- requires Sub-Ledger on every posting line
    is_vat_account  BOOLEAN NOT NULL DEFAULT FALSE,   -- feeds the VAT return / PAN books
    is_costing      BOOLEAN NOT NULL DEFAULT FALSE,   -- Stock / COGS touched by the costing engine
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, code)
);

-- Standard IRD chart of accounts (seeded per company by the controller;
-- listed here as the authoritative reference). VAT accounts are flagged so
-- the VAT / PAN books can be generated mechanically from journal_lines.
-- 10100 Cash in Hand                      | asset | Cash_Bank
-- 10200 Bank Account                      | asset | Cash_Bank
-- 10210 Digital Wallet                    | asset | Cash_Bank
-- 10300 Sundry Debtors (CONTROL)          | asset | Sundry_Debtors   (sub-ledger required)
-- 10400 Stock in Hand                     | asset | Stock            (costing)
-- 10501 Input VAT (Purchase VAT)          | asset | Duties_Taxes     (VAT)
-- 10502 Import Input VAT                  | asset | Duties_Taxes     (VAT)
-- 20100 Output VAT (Sales VAT)            | liab  | Duties_Taxes     (VAT)
-- 20200 TDS Payable                       | liab  | Duties_Taxes
-- 20300 Customs Duty & Clearing Payable   | liab  | Duties_Taxes
-- 20400 Sundry Creditors (CONTROL)        | liab  | Sundry_Creditors(sub-ledger required)
-- 20500 L/C Bank Payable (Imports)        | liab  | Sundry_Creditors
-- 30100 Owner's Capital / Equity          | equity|
-- 40100 Sales Revenue — Taxable           | income| Sales
-- 40110 Sales Revenue — Non-Taxable/Exempt| income| Sales
-- 40200 Discount Received                 | income| Indirect_Incomes
-- 50100 Cost of Goods Sold (COGS)         | exp   | COGS            (costing)
-- 50200 Purchase — Taxable                | exp   | Purchase
-- 50210 Purchase — Non-Taxable            | exp   | Purchase
-- 50300 Purchase — Import (Base Value)    | exp   | Purchase
-- 50400 Customs Duty & Clearing Charges   | exp   | Purchase (capitalized into landing cost)
-- 50500 Freight & Insurance Inward        | exp   | Indirect_Expenses
-- 50600 Discount Allowed                  | exp   | Indirect_Expenses
-- 50700 Indirect Expenses (Misc)          | exp   | Indirect_Expenses

-- ---------------------------------------------------------------------------
-- 2. sub_ledgers — unified Customer / Vendor register
-- ---------------------------------------------------------------------------
CREATE TABLE sub_ledgers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    sub_type            VARCHAR(10) NOT NULL CHECK (sub_type IN ('customer','vendor')),
    name                VARCHAR(160) NOT NULL,
    code                VARCHAR(32) NOT NULL,
    pan                 VARCHAR(20),                      -- IRD PAN (required for B2B)
    control_account_id  UUID NOT NULL REFERENCES accounts_chart(id),
    outstanding_balance NUMERIC(14,2) NOT NULL DEFAULT 0, -- debtors: +on sale/-on pay; creditors: reverse
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, sub_type, code)
);
CREATE INDEX idx_sub_ledgers_control ON sub_ledgers (control_account_id);

-- ---------------------------------------------------------------------------
-- 3. journal_headers — voucher master
-- ---------------------------------------------------------------------------
CREATE TABLE journal_headers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL,
    voucher_no              VARCHAR(40) NOT NULL,          -- gap-free, e.g. SALE-2082/83-000123
    voucher_type            VARCHAR(20) NOT NULL CHECK (voucher_type IN
                            ('SALE','PURCHASE','IMPORT','SALES_RETURN','PURCHASE_RETURN',
                             'RECEIPT','PAYMENT','JOURNAL')),
    fiscal_year             VARCHAR(12) NOT NULL,          -- e.g. '2082/83' or '82/83'
    miti                    VARCHAR(20) NOT NULL,          -- Nepali BS date (authoritative for IRD)
    english_date            DATE NOT NULL,                 -- AD working date
    narration               TEXT,
    source_document_type    VARCHAR(20),                   -- sales_invoice | purchase_bill | import_entry | credit_note | debit_note
    source_document_no      VARCHAR(40),
    source_document_id      UUID,
    status                  VARCHAR(10) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','reversed')),
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, voucher_no)
);
CREATE INDEX idx_journal_headers_doc ON journal_headers (company_id, source_document_id);
CREATE INDEX idx_journal_headers_date ON journal_headers (company_id, english_date);

-- ---------------------------------------------------------------------------
-- 4. journal_lines — double-entry lines (DB-enforced balance + control guard)
-- ---------------------------------------------------------------------------
CREATE TABLE journal_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_header_id   UUID NOT NULL REFERENCES journal_headers(id) ON DELETE RESTRICT,
    account_id          UUID NOT NULL REFERENCES accounts_chart(id),
    sub_ledger_id       UUID REFERENCES sub_ledgers(id),   -- mandatory for control accounts
    debit_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    credit_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    -- a line is a debit OR a credit, never both; amounts can never go negative.
    CONSTRAINT jl_single_side CHECK (NOT (debit_amount > 0 AND credit_amount > 0)),
    CONSTRAINT jl_positive CHECK (debit_amount >= 0 AND credit_amount >= 0)
);
CREATE INDEX idx_journal_lines_header ON journal_lines (journal_header_id);
CREATE INDEX idx_journal_lines_account ON journal_lines (account_id);
CREATE INDEX idx_journal_lines_subledger ON journal_lines (sub_ledger_id);

-- ---------------------------------------------------------------------------
-- 5. inventory_ledger + costing_layers — stock & COGS engine
-- ---------------------------------------------------------------------------
CREATE TABLE costing_layers (                              -- FIFO layers
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    product_id          UUID NOT NULL,
    source_document_no  VARCHAR(40) NOT NULL,
    quantity_remaining  NUMERIC(14,3) NOT NULL,
    unit_cost           NUMERIC(14,2) NOT NULL,            -- landed cost incl. duty/freight for imports
    received_on         DATE NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_layers_product ON costing_layers (company_id, product_id, received_on);

CREATE TABLE inventory_ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL,
    product_id          UUID NOT NULL,
    source_type         VARCHAR(20) NOT NULL CHECK (source_type IN
                        ('PURCHASE','IMPORT','SALES','PURCHASE_RETURN','SALES_RETURN','ADJUSTMENT')),
    source_document_no  VARCHAR(40) NOT NULL,
    movement_type       VARCHAR(12) NOT NULL CHECK (movement_type IN
                        ('in','out','in_return','out_return')),
    quantity            NUMERIC(14,3) NOT NULL,            -- signed: 'in'=+ , 'out'=-
    unit_cost           NUMERIC(14,2) NOT NULL DEFAULT 0,
    layer_id            UUID REFERENCES costing_layers(id),
    running_balance_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
    running_avg_cost    NUMERIC(14,2) NOT NULL DEFAULT 0,  -- Weighted-Average marker
    english_date        DATE NOT NULL,
    miti                VARCHAR(20) NOT NULL,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_ledger_product ON inventory_ledger (company_id, product_id, english_date);

-- ---------------------------------------------------------------------------
-- 6. voucher_counters — non-skippable, gap-free numbering (locked per tx)
-- ---------------------------------------------------------------------------
CREATE TABLE voucher_counters (
    company_id      UUID NOT NULL,
    fiscal_year     VARCHAR(12) NOT NULL,
    voucher_type    VARCHAR(20) NOT NULL,
    next_value      BIGINT NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, fiscal_year, voucher_type)
);

-- ============================================================================
-- INTEGRITY TRIGGERS
-- ============================================================================

-- (1) Balanced journals -----------------------------------------------------
-- Constraint trigger: after ANY line change, the whole header must balance.
-- Controller inserts all lines in one statement; DEFERRABLE is provided so a
-- post-batch validation (SET CONSTRAINTS ALL DEFERRED) is also possible.
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

-- (2) Control-account guard -------------------------------------------------
-- Blocks manual postings to Sundry Debtors / Sundry Creditors unless a
-- Customer / Vendor sub-ledger is supplied on the line.
CREATE OR REPLACE FUNCTION guard_control_account()
RETURNS TRIGGER AS $$
DECLARE
    ctl BOOLEAN;
BEGIN
    SELECT is_control INTO ctl FROM accounts_chart WHERE id = NEW.account_id;
    IF ctl AND NEW.sub_ledger_id IS NULL THEN
        RAISE EXCEPTION 'Control account % requires a Sub-Ledger (Customer/Vendor) reference',
            NEW.account_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_lines_control
    BEFORE INSERT OR UPDATE ON journal_lines
    FOR EACH ROW EXECUTE FUNCTION guard_control_account();

-- (3) Voucher immutability --------------------------------------------------
-- Posted vouchers may not be edited or deleted. Corrections are reversals
-- (new voucher) — this is what IRD audit expects.
CREATE OR REPLACE FUNCTION block_posted_voucher_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted voucher % is immutable. Post a reversal instead.', OLD.voucher_no;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Voucher % cannot be deleted. Post a reversal instead.', OLD.voucher_no;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_journal_headers_immutable
    BEFORE UPDATE OR DELETE ON journal_headers
    FOR EACH ROW EXECUTE FUNCTION block_posted_voucher_mutation();
