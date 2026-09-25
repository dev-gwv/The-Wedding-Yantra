-- 0004_leads_and_clients.sql
-- Phase 1, Sales: sales stages, leads (enquiries), their activity, clients,
-- WhatsApp quick replies and the public enquiry form. Every table carries workspace_id.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- The steps a lead moves through. Each business has its own list.
CREATE TABLE pipeline_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  position      INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pipeline_stages_workspace_idx ON pipeline_stages (workspace_id, position);
CREATE TRIGGER pipeline_stages_updated_at BEFORE UPDATE ON pipeline_stages FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- People who have booked, or are about to. One row per person per business.
CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  city          TEXT,
  notes         TEXT,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX clients_workspace_idx ON clients (workspace_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX clients_phone_uniq ON clients (workspace_id, phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enquiries. A lead becomes a client when it reaches a "won" stage.
CREATE TABLE leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  stage_id           UUID NOT NULL REFERENCES pipeline_stages (id),
  client_id          UUID REFERENCES clients (id),
  name               TEXT NOT NULL,
  phone              TEXT,
  email              TEXT,
  event_type         TEXT,
  event_date         DATE,
  city               TEXT,
  venue              TEXT,
  guest_count        INTEGER CHECK (guest_count IS NULL OR guest_count >= 0),
  budget             NUMERIC(12, 2) CHECK (budget IS NULL OR budget >= 0),
  source             TEXT NOT NULL DEFAULT 'other',
  referred_by        TEXT,
  requirements       TEXT,
  lost_reason        TEXT,
  assigned_to        UUID REFERENCES users (id),
  next_follow_up_at  TIMESTAMPTZ,
  stage_changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES users (id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE INDEX leads_workspace_stage_idx ON leads (workspace_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX leads_follow_up_idx ON leads (workspace_id, next_follow_up_at) WHERE deleted_at IS NULL AND next_follow_up_at IS NOT NULL;
CREATE INDEX leads_assigned_idx ON leads (workspace_id, assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX leads_client_idx ON leads (client_id) WHERE client_id IS NOT NULL;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Everything that happened on a lead: notes, calls, WhatsApp messages, stage moves.
CREATE TABLE lead_activities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  lead_id        UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  actor_user_id  UUID REFERENCES users (id),
  kind           TEXT NOT NULL CHECK (kind IN ('created', 'note', 'call', 'whatsapp', 'stage_changed', 'follow_up_set', 'assigned')),
  body           TEXT,
  meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_activities_lead_idx ON lead_activities (lead_id, created_at DESC);

-- Ready-made WhatsApp replies, sent from a lead in one tap.
CREATE TABLE whatsapp_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_templates_workspace_idx ON whatsapp_templates (workspace_id, position);
CREATE TRIGGER whatsapp_templates_updated_at BEFORE UPDATE ON whatsapp_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The public enquiry form link for each business (share on Instagram, WhatsApp, a QR code).
CREATE TABLE lead_forms (
  workspace_id  UUID PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE,
  slug          TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{4,60}$'),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Record of public form submissions, used to rate-limit by IP.
CREATE TABLE lead_form_submissions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_form_submissions_ip_idx ON lead_form_submissions (ip, created_at DESC);

-- Give businesses created before this release their stages, replies and form.
INSERT INTO pipeline_stages (workspace_id, name, position, kind)
SELECT w.id, s.name, s.ord - 1,
       CASE WHEN s.name ILIKE 'lost%' THEN 'lost'
            WHEN s.name ILIKE 'booked%' THEN 'won'
            ELSE 'open' END
  FROM workspaces w
  JOIN business_types bt ON bt.id = w.business_type_id
  CROSS JOIN LATERAL jsonb_array_elements_text(bt.starter_pack -> 'pipelineStages') WITH ORDINALITY AS s(name, ord);

INSERT INTO whatsapp_templates (workspace_id, title, body, position)
SELECT w.id, t.title, t.body, t.position
  FROM workspaces w
  CROSS JOIN (VALUES
    ('Thank you for your enquiry', 'Hi {first_name}, thank you for contacting {business}! We''d love to be part of your celebration. Could you share your event date and venue?', 0),
    ('Share our packages', 'Hi {first_name}, here are our packages and prices. Happy to customise one for your event on {event_date}. When is a good time to talk?', 1),
    ('Check availability', 'Hi {first_name}, good news: we are available on {event_date}. Shall we block the date for you?', 2),
    ('Gentle follow-up', 'Hi {first_name}, just checking in about your event on {event_date}. Do you have any questions I can help with?', 3)
  ) AS t(title, body, position);

INSERT INTO lead_forms (workspace_id, slug)
SELECT w.id,
       coalesce(nullif(left(trim(both '-' from regexp_replace(lower(w.name), '[^a-z0-9]+', '-', 'g')), 40), ''), 'studio')
         || '-' || substr(md5(w.id::text), 1, 6)
  FROM workspaces w;
