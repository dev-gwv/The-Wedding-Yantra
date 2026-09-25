-- 0001_create_bookings.sql
-- Baseline schema. Uses IF NOT EXISTS because production created this table
-- before migrations existed; on that database this file is a no-op.

CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name   TEXT NOT NULL,
  event_date    DATE NOT NULL,
  venue         TEXT NOT NULL,
  guest_count   INTEGER NOT NULL CHECK (guest_count >= 0),
  status        TEXT NOT NULL DEFAULT 'inquiry'
                CHECK (status IN ('inquiry', 'confirmed', 'completed', 'cancelled')),
  total_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_event_date_idx ON bookings (event_date);
