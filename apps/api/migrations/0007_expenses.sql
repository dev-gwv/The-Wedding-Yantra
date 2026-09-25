-- 0007_expenses.sql
-- Phase 3: expenses with bill photos, for profit on every event.
-- Every table carries workspace_id.

-- Uploaded files (bill photos). The bytes live in the file store, not in the database.
CREATE TABLE files (
  id             UUID PRIMARY KEY,
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  storage_key    TEXT NOT NULL UNIQUE,
  content_type   TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  original_name  TEXT,
  created_by     UUID REFERENCES users (id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX files_workspace_idx ON files (workspace_id, created_at DESC);

-- Money spent: for an event (materials, helpers, travel) or the business (rent, ads).
-- Staff submit, the owner or a manager approves. Only approved money counts in profit.
CREATE TABLE expenses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  event_id         UUID REFERENCES events (id),
  category         TEXT NOT NULL CHECK (category IN
                     ('materials', 'vendor', 'staff', 'travel', 'food', 'equipment', 'rent', 'marketing', 'other')),
  amount           NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  spent_on         DATE NOT NULL,
  paid_to          TEXT,
  method           TEXT CHECK (method IS NULL OR method IN ('upi', 'cash', 'bank', 'cheque', 'card', 'other')),
  note             TEXT,
  receipt_file_id  UUID REFERENCES files (id),
  status           TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'rejected')),
  reject_reason    TEXT,
  submitted_by     UUID REFERENCES users (id),
  reviewed_by      UUID REFERENCES users (id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX expenses_workspace_idx ON expenses (workspace_id, spent_on DESC) WHERE deleted_at IS NULL;
CREATE INDEX expenses_event_idx ON expenses (event_id) WHERE event_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX expenses_pending_idx ON expenses (workspace_id) WHERE status = 'pending' AND deleted_at IS NULL;
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
