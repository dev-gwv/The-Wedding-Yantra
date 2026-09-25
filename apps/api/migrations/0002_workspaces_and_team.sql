-- 0002_workspaces_and_team.sql
-- Multi-business foundation: people, sign-in, businesses (workspaces), team and invitations.
-- Every business-owned table carries workspace_id; the API always filters by it.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- People. One row per phone number, shared across every business they belong to.
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  name        TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One-time sign-in codes. Only a hash of the code is stored.
CREATE TABLE otp_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  requested_ip TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_phone_created_idx ON otp_codes (phone, created_at DESC);

-- Signed-in devices. The token itself is never stored, only its SHA-256 hash.
CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Kinds of wedding business. Starter packs are data, so a new trade never needs code.
CREATE TABLE business_types (
  id            TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9_]+$'),
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  icon          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  starter_pack  JSONB NOT NULL DEFAULT '{}'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT true
);

-- A business using Wedding Yantra. Everything the business owns points here.
CREATE TABLE workspaces (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  business_type_id  TEXT NOT NULL REFERENCES business_types (id),
  city              TEXT NOT NULL,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  gstin             TEXT,
  settings          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by        UUID NOT NULL REFERENCES users (id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Who belongs to which business, and in what role.
CREATE TABLE memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff', 'freelancer', 'accountant')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX memberships_active_uniq ON memberships (workspace_id, user_id) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX memberships_one_owner ON memberships (workspace_id) WHERE role = 'owner' AND removed_at IS NULL;
CREATE INDEX memberships_user_idx ON memberships (user_id) WHERE removed_at IS NULL;
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Invitations to join a business, shared as a link (usually on WhatsApp).
CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('manager', 'staff', 'freelancer', 'accountant')),
  token_hash    TEXT NOT NULL UNIQUE,
  invited_by    UUID NOT NULL REFERENCES users (id),
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  accepted_by   UUID REFERENCES users (id),
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX invitations_workspace_idx ON invitations (workspace_id);
CREATE UNIQUE INDEX invitations_pending_uniq ON invitations (workspace_id, phone)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Who did what, when. The base of the accountability features.
CREATE TABLE activity_log (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  actor_user_id  UUID REFERENCES users (id),
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_workspace_idx ON activity_log (workspace_id, created_at DESC);
