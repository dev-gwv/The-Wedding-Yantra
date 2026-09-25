-- 0005_catalogue_quotes_events.sql
-- Phase 2: the price list, quotes clients can accept online, and events with their
-- functions (haldi, mehendi, wedding...). Every table carries workspace_id.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS quote_terms TEXT;

-- Running numbers per business (quotes now, invoices later). Updated atomically.
CREATE TABLE workspace_counters (
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  value         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, kind)
);

-- What a business sells, with its usual price.
CREATE TABLE catalogue_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  unit          TEXT NOT NULL CHECK (unit IN ('event', 'day', 'hour', 'plate', 'piece', 'set', 'person')),
  price         NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  tax_rate      NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate IN (0, 5, 12, 18, 28)),
  active        BOOLEAN NOT NULL DEFAULT true,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX catalogue_items_workspace_idx ON catalogue_items (workspace_id, position);
CREATE TRIGGER catalogue_items_updated_at BEFORE UPDATE ON catalogue_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Events: a booking on one or more dates.
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  client_id     UUID REFERENCES clients (id),
  lead_id       UUID REFERENCES leads (id),
  title         TEXT NOT NULL,
  event_type    TEXT,
  status        TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
  value         NUMERIC(12, 2) CHECK (value IS NULL OR value >= 0),
  city          TEXT,
  venue         TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX events_workspace_idx ON events (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX events_client_idx ON events (client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX events_one_per_lead ON events (lead_id) WHERE lead_id IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The functions of an event, each on its own date.
CREATE TABLE event_functions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  date          DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  venue         TEXT,
  notes         TEXT,
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX event_functions_date_idx ON event_functions (workspace_id, date);
CREATE INDEX event_functions_event_idx ON event_functions (event_id, position);

-- Quotes and their lines. Totals are worked out by the API from the lines.
CREATE TABLE quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  number          INTEGER NOT NULL,
  lead_id         UUID REFERENCES leads (id),
  client_id       UUID REFERENCES clients (id),
  event_id        UUID REFERENCES events (id),
  title           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  issue_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until     DATE,
  subtotal        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax             NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes           TEXT,
  terms           TEXT,
  share_token     TEXT NOT NULL UNIQUE,
  sent_at         TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  accepted_by     TEXT,
  declined_at     TIMESTAMPTZ,
  decline_reason  TEXT,
  created_by      UUID REFERENCES users (id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (workspace_id, number),
  CHECK (lead_id IS NOT NULL OR client_id IS NOT NULL)
);
CREATE INDEX quotes_workspace_idx ON quotes (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX quotes_lead_idx ON quotes (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX quotes_client_idx ON quotes (client_id) WHERE client_id IS NOT NULL;
CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE quote_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  quote_id           UUID NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  catalogue_item_id  UUID REFERENCES catalogue_items (id) ON DELETE SET NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  unit               TEXT NOT NULL,
  quantity           NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  rate               NUMERIC(12, 2) NOT NULL CHECK (rate >= 0),
  tax_rate           NUMERIC(5, 2) NOT NULL DEFAULT 0,
  amount             NUMERIC(12, 2) NOT NULL,
  position           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX quote_items_quote_idx ON quote_items (quote_id, position);

-- Businesses that already exist get their trade's price list and default terms.
INSERT INTO catalogue_items (workspace_id, name, unit, price, position)
SELECT w.id, s.item ->> 'name', s.item ->> 'unit', (s.item ->> 'price')::numeric, s.ord - 1
  FROM workspaces w
  JOIN business_types bt ON bt.id = w.business_type_id
  CROSS JOIN LATERAL jsonb_array_elements(bt.starter_pack -> 'services') WITH ORDINALITY AS s(item, ord);

UPDATE workspaces SET quote_terms =
  E'50% advance to confirm the booking. Balance before the event.\nPrices are valid until the date on this quote.\nTravel and stay outside the city are charged separately.'
 WHERE quote_terms IS NULL;
