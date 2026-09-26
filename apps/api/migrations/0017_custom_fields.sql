-- 0017_custom_fields.sql
-- Each business's own details on enquiries, clients and events ("Skin type", "Power
-- needed"). Definitions live here; values sit on each row, keyed by field id, and are
-- checked by the API against the field's kind.

CREATE TABLE custom_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  entity        TEXT NOT NULL CHECK (entity IN ('lead', 'client', 'event')),
  label         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('text', 'number', 'date', 'choice', 'yes_no')),
  options       TEXT[] NOT NULL DEFAULT '{}',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX custom_fields_workspace_idx ON custom_fields (workspace_id, entity, position) WHERE deleted_at IS NULL;
CREATE TRIGGER custom_fields_updated_at BEFORE UPDATE ON custom_fields FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE leads ADD COLUMN custom JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN custom JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE events ADD COLUMN custom JSONB NOT NULL DEFAULT '{}'::jsonb;
