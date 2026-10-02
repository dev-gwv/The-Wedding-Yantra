-- How many weddings a business can take on one day (a photographer with three teams, a
-- caterer with two kitchens). Booking more than this on a day is a clash; up to it is fine.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS events_per_day INTEGER NOT NULL DEFAULT 1 CHECK (events_per_day BETWEEN 1 AND 50);
