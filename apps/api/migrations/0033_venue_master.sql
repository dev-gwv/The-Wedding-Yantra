-- The venue master: where events happen. Type (the business's own list), address and Maps
-- link, the venue's contact, capacity, and its rules: music cut-off, outside caterers, load-in.

CREATE TABLE IF NOT EXISTS venues (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  venue_type        TEXT,
  address           TEXT,
  city              TEXT,
  maps_url          TEXT,
  contact_person    TEXT,
  phone             TEXT,
  capacity          INTEGER CHECK (capacity IS NULL OR capacity > 0),
  music_cutoff      TIME,
  outside_catering  BOOLEAN,
  load_in           TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES users (id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS venues_workspace_idx ON venues (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS venues_name_idx ON venues (workspace_id, lower(name)) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS venues_updated_at ON venues;
CREATE TRIGGER venues_updated_at BEFORE UPDATE ON venues FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Events find their venue by its name, so look those up quickly.
CREATE INDEX IF NOT EXISTS events_venue_name_idx ON events (workspace_id, lower(trim(venue))) WHERE venue IS NOT NULL;
CREATE INDEX IF NOT EXISTS event_functions_venue_name_idx ON event_functions (workspace_id, lower(trim(venue))) WHERE venue IS NOT NULL;

ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check
  CHECK (list IN ('payment_method', 'expense_category', 'task_tag', 'relation', 'vendor_category', 'designation', 'venue_type'));

-- The venue types every business starts with (skipping a name it already has).
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'venue_type', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES
   ('banquet', 'Banquet hall', 0), ('hotel', 'Hotel', 1), ('resort', 'Resort', 2), ('lawn', 'Lawn or garden', 3),
   ('farmhouse', 'Farmhouse', 4), ('palace', 'Palace or heritage', 5), ('community_hall', 'Community hall', 6),
   ('temple', 'Temple or gurudwara', 7), ('home', 'Home', 8), ('other', 'Other', 9)
 ) AS t (key, label, position)
ON CONFLICT DO NOTHING;
