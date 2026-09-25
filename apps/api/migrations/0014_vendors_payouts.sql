-- 0014_vendors_payouts.sql
-- Phase 6, Grow: the people a business hires for its events (florists, generator,
-- helpers, a second shooter) and what each event owes them. Paying a payout records an
-- expense on the event, so profit, reports and the CA's spreadsheets include it.

CREATE TABLE vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- What they do for us: "Florist", "Generator", "Second shooter"
  service       TEXT,
  phone         TEXT,
  upi_id        TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX vendors_workspace_idx ON vendors (workspace_id, name) WHERE deleted_at IS NULL;
CREATE TRIGGER vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  vendor_id     UUID NOT NULL REFERENCES vendors (id),
  event_id      UUID REFERENCES events (id),
  -- What it's for: "Mandap flowers", "Generator, 2 days"
  description   TEXT NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'paid')),
  paid_on       DATE,
  method        TEXT CHECK (method IS NULL OR method IN ('upi', 'cash', 'bank', 'cheque', 'card', 'other')),
  reference     TEXT,
  -- The expense recorded when it was paid
  expense_id    UUID REFERENCES expenses (id),
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CHECK ((status = 'paid') = (paid_on IS NOT NULL))
);
CREATE INDEX payouts_vendor_idx ON payouts (vendor_id) WHERE deleted_at IS NULL;
CREATE INDEX payouts_event_idx ON payouts (event_id) WHERE event_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX payouts_owed_idx ON payouts (workspace_id, due_date) WHERE deleted_at IS NULL AND status = 'owed';
CREATE TRIGGER payouts_updated_at BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
