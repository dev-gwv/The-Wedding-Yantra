-- 0022_invoice_settings.sql
-- How invoices look and what they carry, set once and reused:
-- - Saved notes and terms: pick one on an invoice in a tap; one of each kind is the default.
-- - Bank accounts: printed on invoices so clients know where to pay. Each invoice keeps a
--   copy of the account as it was, so editing an account never changes an invoice already sent.
-- - A design and an accent colour for the invoice page.

CREATE TABLE saved_texts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('note', 'terms')),
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX saved_texts_workspace_idx ON saved_texts (workspace_id, kind, position);
CREATE UNIQUE INDEX saved_texts_one_default ON saved_texts (workspace_id, kind) WHERE is_default;
CREATE TRIGGER saved_texts_updated_at BEFORE UPDATE ON saved_texts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bank_accounts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  label          TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  account_name   TEXT,
  account_number TEXT,
  ifsc           TEXT,
  bank_name      TEXT,
  branch         TEXT,
  upi_id         TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  archived_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An account is either bank details or a UPI ID, or both.
  CHECK (account_number IS NOT NULL OR upi_id IS NOT NULL)
);
CREATE INDEX bank_accounts_workspace_idx ON bank_accounts (workspace_id);
CREATE UNIQUE INDEX bank_accounts_one_default ON bank_accounts (workspace_id) WHERE is_default AND archived_at IS NULL;
CREATE TRIGGER bank_accounts_updated_at BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The account printed on the invoice, as it was when the invoice was saved.
ALTER TABLE bills ADD COLUMN bank_account_id UUID REFERENCES bank_accounts (id);
ALTER TABLE bills ADD COLUMN bank_details JSONB;

ALTER TABLE workspaces ADD COLUMN invoice_design TEXT NOT NULL DEFAULT 'classic'
  CHECK (invoice_design IN ('classic', 'modern', 'minimal', 'bold'));
ALTER TABLE workspaces ADD COLUMN invoice_accent TEXT NOT NULL DEFAULT '#E85C00'
  CHECK (invoice_accent ~ '^#[0-9A-F]{6}$');

-- Terms a business already wrote become its default saved terms.
INSERT INTO saved_texts (workspace_id, kind, title, body, is_default)
SELECT id, 'terms', 'Usual terms', left(bill_terms, 4000), true
  FROM workspaces
 WHERE bill_terms IS NOT NULL AND btrim(bill_terms) <> '';
-- They live there now; the old field is only a fallback for a business with no saved terms.
UPDATE workspaces SET bill_terms = NULL WHERE bill_terms IS NOT NULL;

-- A UPI ID already on the business profile becomes its first account, so new invoices show it.
INSERT INTO bank_accounts (workspace_id, label, upi_id, is_default)
SELECT id, 'UPI', upi_id, true
  FROM workspaces
 WHERE upi_id IS NOT NULL AND btrim(upi_id) <> '';
