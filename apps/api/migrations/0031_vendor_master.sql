-- The vendor master: category (the business's own list), contact person, city, bank and GST
-- details, a preferred star, and archive instead of delete.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS ifsc TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS preferred BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE custom_options DROP CONSTRAINT IF EXISTS custom_options_list_check;
ALTER TABLE custom_options ADD CONSTRAINT custom_options_list_check
  CHECK (list IN ('payment_method', 'expense_category', 'task_tag', 'relation', 'vendor_category'));

-- The categories every business starts with (skipping a name it already has).
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'vendor_category', t.key, t.label, t.position
  FROM workspaces w
 CROSS JOIN (VALUES
   ('florist', 'Florist', 0), ('decor', 'Tent and décor', 1), ('lights', 'Lights', 2), ('sound_dj', 'Sound and DJ', 3),
   ('caterer', 'Caterer', 4), ('photo_video', 'Photo and video', 5), ('makeup', 'Makeup and mehendi', 6),
   ('band', 'Band, dhol and shehnai', 7), ('transport', 'Transport', 8), ('printing', 'Printing and stationery', 9),
   ('helpers', 'Helpers and labour', 10), ('other', 'Other', 11)
 ) AS t (key, label, position)
ON CONFLICT DO NOTHING;

-- What vendors were described as ("What they do") becomes their category: a matching
-- category where there is one, else a new category of the business's own.
UPDATE vendors v SET category = o.key
  FROM custom_options o
 WHERE o.workspace_id = v.workspace_id AND o.list = 'vendor_category' AND o.archived_at IS NULL
   AND lower(o.label) = lower(trim(v.service)) AND v.category IS NULL;

INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT DISTINCT ON (v.workspace_id, lower(trim(v.service)))
       v.workspace_id, 'vendor_category', 'x_' || substr(md5(v.workspace_id::text || lower(trim(v.service))), 1, 12), trim(v.service), 20
  FROM vendors v
 WHERE v.category IS NULL AND v.service IS NOT NULL AND trim(v.service) <> ''
ON CONFLICT DO NOTHING;

UPDATE vendors v SET category = o.key
  FROM custom_options o
 WHERE o.workspace_id = v.workspace_id AND o.list = 'vendor_category'
   AND lower(o.label) = lower(trim(v.service)) AND v.category IS NULL;
