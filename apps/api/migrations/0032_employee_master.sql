-- The employee master: work details, an emergency contact, and pay and bank details for each
-- person in the team. Pay, bank and PAN are for the owner (and the person themselves) only.

CREATE TABLE IF NOT EXISTS member_details (
  membership_id    UUID PRIMARY KEY REFERENCES memberships (id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  designation      TEXT,
  employment_type  TEXT CHECK (employment_type IN ('full_time', 'part_time', 'freelance')),
  joined_on        DATE,
  emergency_name   TEXT,
  emergency_phone  TEXT,
  pay_type         TEXT CHECK (pay_type IN ('monthly', 'daily')),
  pay_amount       NUMERIC(12, 2) CHECK (pay_amount >= 0),
  upi_id           TEXT,
  bank_account     TEXT,
  ifsc             TEXT,
  pan              TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_details_workspace_idx ON member_details (workspace_id);
DROP TRIGGER IF EXISTS member_details_updated_at ON member_details;
CREATE TRIGGER member_details_updated_at BEFORE UPDATE ON member_details FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check
  CHECK (list IN ('payment_method', 'expense_category', 'task_tag', 'relation', 'vendor_category', 'designation'));

-- The designations every business starts with (skipping a name it already has).
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'designation', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES
   ('coordinator', 'Event coordinator', 0), ('sales', 'Sales', 1), ('photographer', 'Photographer', 2),
   ('videographer', 'Videographer', 3), ('editor', 'Editor', 4), ('designer', 'Designer', 5),
   ('decorator', 'Decorator', 6), ('makeup', 'Makeup artist', 7), ('cook', 'Chef or cook', 8),
   ('driver', 'Driver', 9), ('helper', 'Helper', 10), ('accounts', 'Accounts', 11), ('other', 'Other', 12)
 ) AS t (key, label, position)
ON CONFLICT DO NOTHING;
