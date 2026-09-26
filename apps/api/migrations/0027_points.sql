-- Points: earned by finishing work well, paid once per thing, ranked monthly.

-- The owner's changes to the point rules (see core POINT_RULE_INFO for defaults),
-- whether penalties count, and the bands' thresholds. Empty: the defaults.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS point_rules JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS penalties_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS score_bands JSONB;

CREATE TABLE points_ledger (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  rule_key     TEXT NOT NULL,
  points       INT NOT NULL,
  -- What earned it: a task, a hand-in sent back, a moved date, a streak, a recognition
  source_kind  TEXT NOT NULL CHECK (source_kind IN ('task', 'submission', 'move', 'streak', 'recognition')),
  source_id    UUID NOT NULL,
  task_id      UUID REFERENCES tasks (id) ON DELETE SET NULL,
  note         TEXT,
  awarded_by   UUID REFERENCES users (id) ON DELETE SET NULL,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Paid once: finishing a task again after reopening it earns nothing more.
  UNIQUE (workspace_id, source_kind, source_id, rule_key, user_id)
);
CREATE INDEX points_ledger_month_idx ON points_ledger (workspace_id, at);
CREATE INDEX points_ledger_user_idx ON points_ledger (workspace_id, user_id, at DESC);
