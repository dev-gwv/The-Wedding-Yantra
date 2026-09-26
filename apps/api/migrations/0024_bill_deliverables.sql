-- 0024_bill_deliverables.sql
-- What the client gets for an invoice ("300 edited photos in 30 days", "a 40-page album",
-- "the teaser reel"), each with a date. On an event's invoice, a line can be tracked as one
-- of the event's deliverables; the invoice then shows whether it has been delivered.

CREATE TABLE bill_deliverables (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id        UUID NOT NULL REFERENCES bills (id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  position       INTEGER NOT NULL,
  title          TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  due_date       DATE,
  deliverable_id UUID REFERENCES deliverables (id) ON DELETE SET NULL,
  UNIQUE (bill_id, position)
);
CREATE INDEX bill_deliverables_deliverable_idx ON bill_deliverables (deliverable_id) WHERE deliverable_id IS NOT NULL;
