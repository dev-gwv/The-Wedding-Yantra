-- The client is the person who booked us. Their relationship to the wedding sits beside
-- their name; contacts become emergency contacts; billing stays on invoices only.

-- Who booked us: bride, groom, bride's father… (a key from the "relation" list)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS relation TEXT;

-- Billing is filled in on each invoice, not kept on the client.
DROP INDEX IF EXISTS clients_gstin_uniq;
ALTER TABLE clients
  DROP COLUMN IF EXISTS billing_name,
  DROP COLUMN IF EXISTS billing_address,
  DROP COLUMN IF EXISTS state_code,
  DROP COLUMN IF EXISTS gstin;

-- Relationships to the wedding, for the client and for emergency contacts.
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'relation', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES
   ('bride', 'Bride', 0), ('groom', 'Groom', 1),
   ('brides_father', 'Bride''s father', 2), ('grooms_father', 'Groom''s father', 3),
   ('brides_mother', 'Bride''s mother', 4), ('grooms_mother', 'Groom''s mother', 5),
   ('other', 'Other', 6)
 ) AS t (key, label, position)
 -- Skip a name the business already added itself.
 WHERE NOT EXISTS (SELECT 1 FROM custom_options o WHERE o.workspace_id = w.id AND o.list = 'relation' AND o.archived_at IS NULL
                     AND lower(o.label) = lower(t.label) AND o.key <> t.key)
ON CONFLICT (workspace_id, list, key) DO UPDATE SET position = EXCLUDED.position;

-- The earlier choices are hidden, not deleted: anything already using them keeps its name.
UPDATE custom_options SET archived_at = coalesce(archived_at, now())
 WHERE list = 'relation' AND key IN ('father', 'mother', 'brother', 'sister', 'relative', 'friend', 'planner', 'coordinator');
