-- Partner QR codes: each partner a business collaborates with (a boutique, jeweller, venue,
-- influencer) gets their own code on the enquiry form. Enquiries through it are credited to
-- them, and a private link lets the partner see those enquiries for themselves.

CREATE TABLE IF NOT EXISTS partners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- What they are: boutique, jeweller, venue, influencer…
  label         TEXT,
  vendor_id     UUID REFERENCES vendors (id),
  phone         TEXT,
  notes         TEXT,
  -- In the QR link (?p=code); short so the QR stays simple to scan.
  code          TEXT NOT NULL CHECK (code ~ '^[a-z0-9]{6,12}$'),
  -- The partner's own page (/p/token); null while sharing is stopped.
  view_token    TEXT UNIQUE,
  show_phone    BOOLEAN NOT NULL DEFAULT false,
  -- Times the enquiry form was opened through this code.
  scans         INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ,
  UNIQUE (workspace_id, code)
);
CREATE INDEX IF NOT EXISTS partners_workspace_idx ON partners (workspace_id);
DROP TRIGGER IF EXISTS partners_updated_at ON partners;
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE leads ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners (id);
CREATE INDEX IF NOT EXISTS leads_partner_idx ON leads (partner_id) WHERE partner_id IS NOT NULL;
