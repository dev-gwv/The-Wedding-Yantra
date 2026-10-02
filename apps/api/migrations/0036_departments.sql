-- Departments: how a business organises its team (Admin, Accountant, Sales, Manager, and any
-- it adds). A department only groups people; what someone can see in the app stays with
-- their role.

ALTER TABLE member_details ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check
  CHECK (list IN ('payment_method', 'expense_category', 'task_tag', 'relation', 'vendor_category', 'designation', 'venue_type', 'service_category', 'department'));

-- The departments every business starts with (skipping a name it already has).
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'department', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES ('admin', 'Admin', 0), ('accountant', 'Accountant', 1), ('sales', 'Sales', 2), ('manager', 'Manager', 3)) AS t (key, label, position)
 WHERE NOT EXISTS (SELECT 1 FROM custom_options o WHERE o.workspace_id = w.id AND o.list = 'department' AND lower(o.label) = lower(t.label))
ON CONFLICT DO NOTHING;
