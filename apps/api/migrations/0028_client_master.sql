-- The client master: a family (or company, or planner), its contacts, the wedding and billing.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'family' CHECK (kind IN ('family', 'company', 'agency')),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  -- Where they came from (same keys as enquiry sources)
  ADD COLUMN IF NOT EXISTS source TEXT,
  -- The wedding
  ADD COLUMN IF NOT EXISTS bride_name TEXT,
  ADD COLUMN IF NOT EXISTS groom_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_count INTEGER CHECK (guest_count IS NULL OR guest_count BETWEEN 0 AND 100000),
  -- Billing: who the invoice is made out to, and the state for GST
  ADD COLUMN IF NOT EXISTS billing_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_address TEXT,
  ADD COLUMN IF NOT EXISTS state_code TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS clients_gstin_uniq ON clients (workspace_id, gstin) WHERE gstin IS NOT NULL AND deleted_at IS NULL;

-- Where clients came from, and how big the wedding is, from their first enquiry.
UPDATE clients c SET source = l.source, guest_count = coalesce(c.guest_count, l.guest_count)
  FROM (SELECT DISTINCT ON (client_id) client_id, source, guest_count FROM leads
         WHERE client_id IS NOT NULL AND deleted_at IS NULL ORDER BY client_id, created_at) l
 WHERE l.client_id = c.id AND c.source IS NULL;

-- The family: everyone we deal with besides the main number on the client.
CREATE TABLE client_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  relation      TEXT,
  phone         TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_contacts_client_idx ON client_contacts (client_id, position);

-- Relations: the business's own list (bride, groom, father, planner…).
ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check
  CHECK (list IN ('payment_method', 'expense_category', 'task_tag', 'relation'));

INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'relation', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES
   ('bride', 'Bride', 0), ('groom', 'Groom', 1), ('father', 'Father', 2), ('mother', 'Mother', 3),
   ('brother', 'Brother', 4), ('sister', 'Sister', 5), ('relative', 'Relative', 6), ('friend', 'Friend', 7),
   ('planner', 'Planner', 8), ('coordinator', 'Coordinator', 9), ('other', 'Other', 10)
 ) AS t (key, label, position)
ON CONFLICT DO NOTHING;
