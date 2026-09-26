-- 0023_payment_plans.sql
-- An invoice paid in parts: "30% to book, 40% a week before, 30% on the day".
-- Each part keeps its amount in rupees (and the percentage it was set as, if any);
-- the parts add up to the invoice total. Money received pays the parts in order.

CREATE TABLE bill_instalments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id      UUID NOT NULL REFERENCES bills (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  label        TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 60),
  percent      NUMERIC(6, 3) CHECK (percent IS NULL OR (percent > 0 AND percent <= 100)),
  amount       NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  due_date     DATE,
  UNIQUE (bill_id, position)
);
CREATE INDEX bill_instalments_due_idx ON bill_instalments (workspace_id, due_date);
