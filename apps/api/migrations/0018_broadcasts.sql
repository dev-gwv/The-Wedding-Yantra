-- 0018_broadcasts.sql
-- Messages to many clients at once: festival wishes, anniversary wishes and offers. The
-- list of people is fixed when the message is made; each one is sent on WhatsApp from
-- the business's phone and ticked off here.

CREATE TABLE broadcasts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  audience      TEXT NOT NULL CHECK (audience IN ('past_clients', 'all_clients', 'lost_enquiries', 'anniversaries')),
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX broadcasts_workspace_idx ON broadcasts (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE TRIGGER broadcasts_updated_at BEFORE UPDATE ON broadcasts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE broadcast_recipients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id  UUID NOT NULL REFERENCES broadcasts (id) ON DELETE CASCADE,
  client_id     UUID REFERENCES clients (id),
  lead_id       UUID REFERENCES leads (id),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  position      INTEGER NOT NULL,
  sent_at       TIMESTAMPTZ,
  sent_by       UUID REFERENCES users (id),
  skipped_at    TIMESTAMPTZ,
  UNIQUE (broadcast_id, phone)
);
CREATE INDEX broadcast_recipients_idx ON broadcast_recipients (broadcast_id, position);

-- A client who asked not to get offers or wishes is left out of every list.
ALTER TABLE clients ADD COLUMN no_messages BOOLEAN NOT NULL DEFAULT false;
