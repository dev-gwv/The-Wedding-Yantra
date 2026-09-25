-- 0012_client_portal.sql
-- Phase 6, Grow: a page for each client with their events, quotes, bills and payments;
-- asking for a review after an event; and referrals from happy clients.

-- The client's own page. Anyone with the link can open it, so the business can stop
-- sharing it (NULL) or send a new link at any time.
ALTER TABLE clients ADD COLUMN portal_token TEXT UNIQUE;
-- The code in the client's "recommend us" link. Enquiries sent through it name the client.
ALTER TABLE clients ADD COLUMN referral_code TEXT UNIQUE;

-- The client who sent this enquiry our way.
ALTER TABLE leads ADD COLUMN referred_by_client_id UUID REFERENCES clients (id);
CREATE INDEX leads_referred_by_client_idx ON leads (referred_by_client_id) WHERE referred_by_client_id IS NOT NULL;

-- Where happy clients leave a review, usually the Google Business Profile review link.
ALTER TABLE workspaces ADD COLUMN review_url TEXT;

-- When the client was asked for a review of this event, and who asked.
ALTER TABLE events ADD COLUMN review_requested_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN review_requested_by UUID REFERENCES users (id);
