-- 0010_time_off.sql
-- Phase 4 part 3: days a team member is off, so nobody is booked on an event they can't work.

CREATE TABLE time_off (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CHECK (end_date >= start_date),
  CHECK (end_date - start_date <= 366)
);
CREATE INDEX time_off_workspace_idx ON time_off (workspace_id, end_date) WHERE deleted_at IS NULL;
CREATE INDEX time_off_user_idx ON time_off (workspace_id, user_id, end_date) WHERE deleted_at IS NULL;
