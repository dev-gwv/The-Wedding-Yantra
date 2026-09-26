-- Alerts: an in-app notification centre, push to installed phones, per-person
-- preferences, and the scheduled round-ups (morning plan, overdue, evening team day).

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  -- A path in the web app, e.g. /app/tasks?open=<id>
  link         TEXT,
  entity_type  TEXT,
  entity_id    UUID,
  actor_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  -- Keeps scheduled alerts to one per thing (e.g. "due:<task>:<date> <time>")
  dedupe_key   TEXT,
  read_at      TIMESTAMPTZ,
  -- pending: to push; sent; none: no phone to push to; quiet: held back in quiet hours; off: push off
  push_state   TEXT NOT NULL DEFAULT 'pending' CHECK (push_state IN ('pending', 'sent', 'none', 'quiet', 'off', 'expired')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_inbox_idx ON notifications (user_id, workspace_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id, workspace_id) WHERE read_at IS NULL;
CREATE INDEX notifications_push_idx ON notifications (created_at) WHERE push_state = 'pending';
CREATE UNIQUE INDEX notifications_dedupe_uniq ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Browsers and installed apps that accept push, per person (across their businesses).
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at  TIMESTAMPTZ,
  failures    INT NOT NULL DEFAULT 0
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

-- What each person wants, per business. No row: everything on, quiet 10 pm to 7 am.
CREATE TABLE notification_prefs (
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- Group keys switched off (see core NOTIFICATION_GROUPS)
  off          TEXT[] NOT NULL DEFAULT '{}',
  push         BOOLEAN NOT NULL DEFAULT true,
  quiet_from   TIME DEFAULT '22:00',
  quiet_to     TIME DEFAULT '07:00',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

-- Each scheduled job runs once per business per local day.
CREATE TABLE job_runs (
  job          TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  run_date     DATE NOT NULL,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job, workspace_id, run_date)
);

-- Keys the server makes for itself once and keeps (the push signing keys).
CREATE TABLE app_keys (
  name       TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
