-- 0006_bills_and_payments.sql
-- Phase 3: GST bills (tax invoices) and the money received against them.
-- Every table carries workspace_id. Bills are never deleted, only cancelled.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS upi_id TEXT,
  ADD COLUMN IF NOT EXISTS bill_prefix TEXT NOT NULL DEFAULT 'INV',
  ADD COLUMN IF NOT EXISTS bill_terms TEXT;

-- HSN/SAC code for each service, printed on GST bills.
ALTER TABLE catalogue_items ADD COLUMN IF NOT EXISTS sac TEXT;

CREATE TABLE bills (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- Numbered per financial year, as GST rules require: INV/26-27/0001
  fy               TEXT NOT NULL,
  seq              INTEGER NOT NULL,
  number           TEXT NOT NULL,
  client_id        UUID REFERENCES clients (id),
  event_id         UUID REFERENCES events (id),
  quote_id         UUID REFERENCES quotes (id),
  status           TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  issue_date       DATE NOT NULL,
  due_date         DATE,
  bill_to_name     TEXT NOT NULL,
  bill_to_phone    TEXT,
  bill_to_address  TEXT,
  bill_to_gstin    TEXT,
  -- The business's GST number when the bill was made. NULL: no GST was charged.
  seller_gstin     TEXT,
  place_of_supply  TEXT,
  inter_state      BOOLEAN NOT NULL DEFAULT false,
  subtotal         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  taxable          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cgst             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sgst             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  igst             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  round_off        NUMERIC(6, 2) NOT NULL DEFAULT 0,
  total            NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes            TEXT,
  terms            TEXT,
  share_token      TEXT NOT NULL UNIQUE,
  cancelled_at     TIMESTAMPTZ,
  cancel_reason    TEXT,
  created_by       UUID REFERENCES users (id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, fy, seq),
  CHECK (client_id IS NOT NULL OR event_id IS NOT NULL)
);
CREATE INDEX bills_workspace_idx ON bills (workspace_id, issue_date DESC);
CREATE INDEX bills_event_idx ON bills (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX bills_client_idx ON bills (client_id) WHERE client_id IS NOT NULL;
CREATE TRIGGER bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lines keep every worked-out amount, so an old bill never changes.
CREATE TABLE bill_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  bill_id            UUID NOT NULL REFERENCES bills (id) ON DELETE CASCADE,
  catalogue_item_id  UUID REFERENCES catalogue_items (id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  sac                TEXT,
  unit               TEXT NOT NULL,
  quantity           NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  rate               NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  tax_rate           NUMERIC(5, 2) NOT NULL DEFAULT 0,
  amount             NUMERIC(12, 2) NOT NULL,
  discount           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  taxable            NUMERIC(12, 2) NOT NULL,
  cgst               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sgst               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  igst               NUMERIC(12, 2) NOT NULL DEFAULT 0,
  position           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX bill_items_bill_idx ON bill_items (bill_id, position);

-- Money received. Linked to a bill when there is one; an advance taken before the
-- bill is linked to the event and moves onto the bill when it is made.
CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  client_id     UUID REFERENCES clients (id),
  event_id      UUID REFERENCES events (id),
  bill_id       UUID REFERENCES bills (id),
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_on       DATE NOT NULL,
  method        TEXT NOT NULL CHECK (method IN ('upi', 'cash', 'bank', 'cheque', 'card', 'other')),
  reference     TEXT,
  note          TEXT,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (workspace_id, number),
  CHECK (client_id IS NOT NULL OR event_id IS NOT NULL OR bill_id IS NOT NULL)
);
CREATE INDEX payments_workspace_idx ON payments (workspace_id, paid_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX payments_bill_idx ON payments (bill_id) WHERE bill_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX payments_event_idx ON payments (event_id) WHERE event_id IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
