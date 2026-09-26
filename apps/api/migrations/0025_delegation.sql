-- 0025_delegation.sql
-- Tasks grow into delegation: where each one stands (to do, doing, stuck, waiting for a
-- check, done, cancelled), four levels of priority, the business's own tags, a check by
-- whoever gave it (submit, then approve or send back), steps, comments, attachments and a
-- history of every change.

-- Where a task stands. 'open' stays the "to do" value so existing rows and links keep working.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open', 'doing', 'waiting', 'review', 'done', 'cancelled'));

-- Four levels. What used to be 'high' was shown as Urgent, so it becomes 'urgent'.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
UPDATE tasks SET priority = 'urgent' WHERE priority = 'high';
ALTER TABLE tasks ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE task_repeats DROP CONSTRAINT IF EXISTS task_repeats_priority_check;
UPDATE task_repeats SET priority = 'urgent' WHERE priority = 'high';
ALTER TABLE task_repeats ADD CONSTRAINT task_repeats_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

ALTER TABLE tasks
  ADD COLUMN tag TEXT,
  ADD COLUMN client_id UUID REFERENCES clients (id),
  ADD COLUMN start_date DATE,
  ADD COLUMN estimate_hours NUMERIC(5, 2) CHECK (estimate_hours IS NULL OR (estimate_hours > 0 AND estimate_hours <= 999)),
  -- Whoever gave it checks the work before it counts as done.
  ADD COLUMN needs_check BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN waiting_reason TEXT,
  -- When the work was finished (ticked, or first handed in for a check), kept apart from
  -- later edits so an edit never makes a finished task late.
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN accepted_at TIMESTAMPTZ,
  ADD COLUMN accepted_by UUID REFERENCES users (id),
  -- Times it was sent back to be redone
  ADD COLUMN revisions INTEGER NOT NULL DEFAULT 0,
  -- Times its date was pushed later
  ADD COLUMN moved_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN custom JSONB NOT NULL DEFAULT '{}';

UPDATE tasks SET completed_at = done_at, accepted_at = done_at, accepted_by = done_by WHERE status = 'done';

CREATE INDEX tasks_active_idx ON tasks (workspace_id, status, due_date)
  WHERE deleted_at IS NULL AND status NOT IN ('done', 'cancelled');
CREATE INDEX tasks_review_idx ON tasks (workspace_id, created_by) WHERE deleted_at IS NULL AND status = 'review';
CREATE INDEX tasks_client_idx ON tasks (client_id) WHERE client_id IS NOT NULL AND deleted_at IS NULL;

-- Small steps inside a task: "3 of 5".
CREATE TABLE task_steps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  position   INTEGER NOT NULL DEFAULT 0,
  done_at    TIMESTAMPTZ,
  done_by    UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_steps_task_idx ON task_steps (task_id, position);

-- The conversation on a task. A comment can carry a photo or PDF.
CREATE TABLE task_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES users (id),
  body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  mentions   UUID[] NOT NULL DEFAULT '{}',
  file_id    UUID REFERENCES files (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX task_comments_task_idx ON task_comments (task_id, created_at);

-- Photos and PDFs on a task (the brief, a reference, the finished work).
CREATE TABLE task_files (
  task_id    UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  file_id    UUID NOT NULL REFERENCES files (id),
  added_by   UUID REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, file_id)
);

-- Work handed in for a check, and what the checker decided.
CREATE TABLE task_submissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users (id),
  note         TEXT,
  link         TEXT,
  file_id      UUID REFERENCES files (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision     TEXT CHECK (decision IN ('approved', 'sent_back')),
  decided_by   UUID REFERENCES users (id),
  decided_at   TIMESTAMPTZ,
  reason       TEXT
);
CREATE INDEX task_submissions_task_idx ON task_submissions (task_id, created_at DESC);

-- Everything that happened to a task, as it happened.
CREATE TABLE task_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id    UUID NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES users (id),
  action     TEXT NOT NULL,
  meta       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_events_task_idx ON task_events (task_id, created_at DESC);

-- The business's own task tags, and custom fields on tasks.
ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check CHECK (list IN ('payment_method', 'expense_category', 'task_tag'));
ALTER TABLE custom_fields DROP CONSTRAINT IF EXISTS custom_fields_entity_check;
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_entity_check CHECK (entity IN ('lead', 'client', 'event', 'task'));

INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'task_tag', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES ('client', 'Client', 0), ('event', 'Event prep', 1), ('delivery', 'Delivery', 2),
                    ('vendors', 'Vendors', 3), ('marketing', 'Marketing', 4), ('admin', 'Admin', 5)) AS t (key, label, position)
ON CONFLICT DO NOTHING;
