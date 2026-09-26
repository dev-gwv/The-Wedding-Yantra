-- 0016_task_repeats.sql
-- Repeating tasks: "post 3 reels every week", "follow up all leads daily". A rule makes one
-- ordinary task for its latest day when someone next opens the app; older missed days
-- aren't piled up.

CREATE TABLE task_repeats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  notes         TEXT,
  assignee_id   UUID NOT NULL REFERENCES users (id),
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  due_time      TIME,
  frequency     TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  -- Weekly: 1 = Monday … 7 = Sunday
  weekdays      SMALLINT[] NOT NULL DEFAULT '{}',
  -- Monthly: 1–31, short months use their last day
  month_day     SMALLINT CHECK (month_day BETWEEN 1 AND 31),
  start_date    DATE NOT NULL,
  -- The last business day it was checked, so each day is looked at once
  checked_on    DATE,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at    TIMESTAMPTZ,
  CHECK (frequency <> 'weekly' OR cardinality(weekdays) > 0),
  CHECK (frequency <> 'monthly' OR month_day IS NOT NULL)
);
CREATE INDEX task_repeats_active_idx ON task_repeats (workspace_id) WHERE stopped_at IS NULL;
CREATE TRIGGER task_repeats_updated_at BEFORE UPDATE ON task_repeats FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE tasks ADD COLUMN repeat_id UUID REFERENCES task_repeats (id);
-- One task per rule per day, even if it was deleted: deleting today's copy doesn't bring it back.
CREATE UNIQUE INDEX tasks_repeat_day_uniq ON tasks (repeat_id, due_date) WHERE repeat_id IS NOT NULL;
