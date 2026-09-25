-- 0008_tasks_and_team.sql
-- Phase 4: who works which event, the checklist for every event, and tasks for the team.
-- Every table carries workspace_id.

-- What gets done for every event. Starts from the trade's starter pack; the owner edits it.
--   before: due `days` before the first function
--   on_day: due on the first function
--   after:  due `days` after the last function
CREATE TABLE checklist_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  when_kind     TEXT NOT NULL CHECK (when_kind IN ('before', 'on_day', 'after')),
  days          INTEGER NOT NULL DEFAULT 0 CHECK (days BETWEEN 0 AND 365),
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checklist_templates_workspace_idx ON checklist_templates (workspace_id, position);
CREATE TRIGGER checklist_templates_updated_at BEFORE UPDATE ON checklist_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  notes         TEXT,
  event_id      UUID REFERENCES events (id),
  assignee_id   UUID REFERENCES users (id),
  due_date      DATE,
  due_time      TIME,
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  done_at       TIMESTAMPTZ,
  done_by       UUID REFERENCES users (id),
  -- Made from this checklist item; applying the checklist twice never duplicates it.
  template_id   UUID REFERENCES checklist_templates (id) ON DELETE SET NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX tasks_open_due_idx ON tasks (workspace_id, due_date) WHERE deleted_at IS NULL AND status = 'open';
CREATE INDEX tasks_assignee_idx ON tasks (workspace_id, assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX tasks_event_idx ON tasks (event_id) WHERE event_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX tasks_event_template_uniq ON tasks (event_id, template_id)
  WHERE deleted_at IS NULL AND event_id IS NOT NULL AND template_id IS NOT NULL;
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Who works an event, in what role, and when they must reach.
CREATE TABLE event_team (
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id),
  role_note     TEXT,
  call_time     TIME,
  added_by      UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_team_user_idx ON event_team (workspace_id, user_id);

-- Businesses that already exist get their trade's checklist. Same rule as checklistDays in
-- packages/core: steps before the event run in order from a week before to the day before,
-- steps after from the next day to a week after; a lone step is 3 days before or 2 after.
INSERT INTO checklist_templates (workspace_id, title, when_kind, days, position)
SELECT workspace_id, title, when_kind,
       CASE
         WHEN when_kind = 'on_day' THEN 0
         WHEN n = 1 THEN CASE when_kind WHEN 'before' THEN 3 ELSE 2 END
         WHEN when_kind = 'before' THEN round(7 - 6.0 * k / (n - 1))::int
         ELSE round(1 + 6.0 * k / (n - 1))::int
       END,
       ord - 1
  FROM (
    SELECT w.id AS workspace_id, c.item ->> 'title' AS title, c.item ->> 'when' AS when_kind, c.ord,
           row_number() OVER (PARTITION BY w.id, c.item ->> 'when' ORDER BY c.ord) - 1 AS k,
           count(*) OVER (PARTITION BY w.id, c.item ->> 'when') AS n
      FROM workspaces w
      JOIN business_types bt ON bt.id = w.business_type_id
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(bt.starter_pack -> 'checklist', '[]'::jsonb)) WITH ORDINALITY AS c(item, ord)
  ) steps;
