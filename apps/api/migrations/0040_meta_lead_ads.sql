-- Facebook and Instagram lead ads: a business connects its own Facebook Pages, and every
-- lead form filled on them arrives in Leads by itself, given to the salesperson with the
-- fewest open leads. Tokens are stored sealed (never in plain text).

-- One row per Facebook person who connected this business.
CREATE TABLE IF NOT EXISTS meta_connections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  fb_user_id              TEXT NOT NULL,
  fb_user_name            TEXT,
  -- Sealed long-lived user token; null once wiped.
  user_token_enc          TEXT,
  user_token_expires_at   TIMESTAMPTZ,
  -- After this Meta stops sharing data until someone logs in to Facebook again.
  data_access_expires_at  TIMESTAMPTZ,
  scopes                  TEXT[] NOT NULL DEFAULT '{}',
  status                  TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'reconnect_soon', 'needs_reconnect', 'revoked')),
  connected_by            UUID REFERENCES users (id) ON DELETE SET NULL,
  connected_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_at              TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, fb_user_id)
);
DROP TRIGGER IF EXISTS meta_connections_updated_at ON meta_connections;
CREATE TRIGGER meta_connections_updated_at BEFORE UPDATE ON meta_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The Facebook Pages a connection can see. Only a Page switched on keeps a (sealed) token.
CREATE TABLE IF NOT EXISTS meta_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  -- Null once the connection is removed; the Page row stays for its lead history.
  connection_id     UUID REFERENCES meta_connections (id) ON DELETE SET NULL,
  page_id           TEXT NOT NULL,
  name              TEXT NOT NULL DEFAULT '',
  -- What the person can do on the Page in Meta's words (ADVERTISE, MANAGE…)
  tasks             TEXT[] NOT NULL DEFAULT '{}',
  page_token_enc    TEXT,
  active            BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'off' CHECK (status IN ('ok', 'off', 'needs_reconnect', 'lead_access', 'not_subscribed', 'permission_missing')),
  -- Meta's own words for the last problem
  problem           TEXT,
  -- Rate limited by Meta: leave the Page alone until then.
  paused_until      TIMESTAMPTZ,
  -- Switched on at: nothing from before this is brought in.
  leads_since       TIMESTAMPTZ,
  next_poll_at      TIMESTAMPTZ,
  -- The last full sweep of every form (once a day)
  swept_at          TIMESTAMPTZ,
  last_webhook_at   TIMESTAMPTZ,
  last_lead_at      TIMESTAMPTZ,
  checked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, page_id)
);
-- One Page sends its leads to one business at a time.
CREATE UNIQUE INDEX IF NOT EXISTS meta_pages_active_uniq ON meta_pages (page_id) WHERE active;
CREATE INDEX IF NOT EXISTS meta_pages_connection_idx ON meta_pages (connection_id) WHERE connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meta_pages_poll_idx ON meta_pages (next_poll_at) WHERE active;
DROP TRIGGER IF EXISTS meta_pages_updated_at ON meta_pages;
CREATE TRIGGER meta_pages_updated_at BEFORE UPDATE ON meta_pages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The lead forms on a Page, with their questions and how far the catch-up has read.
CREATE TABLE IF NOT EXISTS meta_forms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  meta_page_id    UUID NOT NULL REFERENCES meta_pages (id) ON DELETE CASCADE,
  form_id         TEXT NOT NULL,
  name            TEXT NOT NULL DEFAULT '',
  -- Meta's status: ACTIVE, ARCHIVED…
  status          TEXT,
  -- [{key, label, type}]
  questions       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Question key -> lead field; empty until a mapping editor exists.
  mapping         JSONB NOT NULL DEFAULT '{}'::jsonb,
  leads_count     INTEGER NOT NULL DEFAULT 0,
  -- Leads created up to here have been read by the catch-up.
  polled_through  TIMESTAMPTZ,
  last_lead_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meta_page_id, form_id)
);
CREATE INDEX IF NOT EXISTS meta_forms_workspace_idx ON meta_forms (workspace_id);
DROP TRIGGER IF EXISTS meta_forms_updated_at ON meta_forms;
CREATE TRIGGER meta_forms_updated_at BEFORE UPDATE ON meta_forms FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every lead that arrives from outside: the work queue, the guard against bringing one in
-- twice, the raw answers, and the "recent" list on the settings screen.
CREATE TABLE IF NOT EXISTS incoming_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  channel          TEXT NOT NULL DEFAULT 'meta' CHECK (channel IN ('meta', 'inbox')),
  -- Meta's leadgen id
  external_id      TEXT NOT NULL,
  meta_page_id     UUID REFERENCES meta_pages (id) ON DELETE SET NULL,
  received_via     TEXT NOT NULL CHECK (received_via IN ('webhook', 'catch_up', 'test')),
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'added', 'merged', 'skipped', 'failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until     TIMESTAMPTZ,
  claim_token      UUID,
  -- token, permission, lead_access, rate_limit, transient, not_found…
  error_kind       TEXT,
  last_error       TEXT,
  -- fb / ig as Meta sends it
  platform         TEXT,
  is_test          BOOLEAN NOT NULL DEFAULT false,
  is_organic       BOOLEAN NOT NULL DEFAULT false,
  -- The person's name as read from the answers, for the recent list
  name             TEXT,
  form_id          TEXT,
  form_name        TEXT,
  campaign_id      TEXT,
  campaign_name    TEXT,
  adset_id         TEXT,
  adset_name       TEXT,
  ad_id            TEXT,
  ad_name          TEXT,
  -- Every question and answer exactly as Meta sent them
  answers          JSONB,
  submitted_at     TIMESTAMPTZ,
  lead_id          UUID REFERENCES leads (id) ON DELETE SET NULL,
  -- true: this row made the lead; false: it was added to an open one
  created_lead     BOOLEAN NOT NULL DEFAULT false,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, external_id)
);
CREATE INDEX IF NOT EXISTS incoming_leads_queue_idx ON incoming_leads (next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS incoming_leads_page_idx ON incoming_leads (meta_page_id, received_at DESC) WHERE meta_page_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS incoming_leads_lead_idx ON incoming_leads (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS incoming_leads_recent_idx ON incoming_leads (workspace_id, received_at DESC);
DROP TRIGGER IF EXISTS incoming_leads_updated_at ON incoming_leads;
CREATE TRIGGER incoming_leads_updated_at BEFORE UPDATE ON incoming_leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Who gets the leads that arrive by themselves. No row: everyone with Leads except the owner.
CREATE TABLE IF NOT EXISTS lead_routing (
  workspace_id         UUID PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  mode                 TEXT NOT NULL DEFAULT 'fewest_open' CHECK (mode IN ('fewest_open')),
  -- Used only when everyone_with_leads is off
  people               UUID[] NOT NULL DEFAULT '{}',
  everyone_with_leads  BOOLEAN NOT NULL DEFAULT true,
  include_owner        BOOLEAN NOT NULL DEFAULT false,
  skip_on_leave        BOOLEAN NOT NULL DEFAULT true,
  updated_by           UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS lead_routing_updated_at ON lead_routing;
CREATE TRIGGER lead_routing_updated_at BEFORE UPDATE ON lead_routing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- "Continue with Facebook": one row per attempt, single use, tied to the business and person.
CREATE TABLE IF NOT EXISTS meta_oauth_states (
  nonce         TEXT PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reconnect     BOOLEAN NOT NULL DEFAULT false,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  -- What completing returned, so a repeat by the same person gets the same answer
  result        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_oauth_states_expires_idx ON meta_oauth_states (expires_at);
DROP TRIGGER IF EXISTS meta_oauth_states_updated_at ON meta_oauth_states;
CREATE TRIGGER meta_oauth_states_updated_at BEFORE UPDATE ON meta_oauth_states FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Data deletion requests from Facebook. Only a hash of the person's Facebook id is kept.
CREATE TABLE IF NOT EXISTS meta_deletion_requests (
  code          TEXT PRIMARY KEY,
  fb_user_hash  TEXT NOT NULL,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS meta_deletion_requests_updated_at ON meta_deletion_requests;
CREATE TRIGGER meta_deletion_requests_updated_at BEFORE UPDATE ON meta_deletion_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Finds an open enquiry from the same phone (last 10 digits) quickly.
CREATE INDEX IF NOT EXISTS leads_phone_key_idx ON leads (workspace_id, right(regexp_replace(phone, '\D', '', 'g'), 10))
  WHERE deleted_at IS NULL AND phone IS NOT NULL;
