-- 0015_inventory.sql
-- Phase 6, Grow: stock for decorators, sound and light, bars and caterers. What the
-- business owns, what each event needs on which days, and what's out right now. The
-- same item on two overlapping events warns when there isn't enough.

CREATE TABLE inventory_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- A group to find it by: "Lights", "Furniture", "Glassware"
  category      TEXT,
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  notes         TEXT,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX inventory_items_workspace_idx ON inventory_items (workspace_id, category, name) WHERE deleted_at IS NULL;
CREATE TRIGGER inventory_items_updated_at BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Items set aside for an event, on its days. "out" once loaded, "returned" when back.
CREATE TABLE inventory_bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES inventory_items (id),
  event_id      UUID NOT NULL REFERENCES events (id),
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  from_date     DATE NOT NULL,
  to_date       DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'out', 'returned')),
  -- How many didn't come back; taken off the item's stock
  missing       INTEGER NOT NULL DEFAULT 0 CHECK (missing >= 0),
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CHECK (to_date >= from_date),
  CHECK (missing <= quantity)
);
CREATE INDEX inventory_bookings_item_idx ON inventory_bookings (item_id, from_date, to_date) WHERE deleted_at IS NULL;
CREATE INDEX inventory_bookings_event_idx ON inventory_bookings (event_id) WHERE deleted_at IS NULL;
CREATE TRIGGER inventory_bookings_updated_at BEFORE UPDATE ON inventory_bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
