-- 0020_lists_and_invoices.sql
-- 1. The business's own lists: payment modes and expense categories. Each option keeps a
--    fixed key (what records store) and a name the owner can change, so renaming never
--    touches old records. The built-in ones keep their old keys (upi, cash, materials…).
-- 2. Invoices in more depth: a subject line, GST on or off per invoice, prices that
--    include GST, and a discount given as a percentage.

CREATE TABLE custom_options (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  list          TEXT NOT NULL CHECK (list IN ('payment_method', 'expense_category')),
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, list, key)
);
-- No two live options with the same name in a list, whatever the capitals.
CREATE UNIQUE INDEX custom_options_label_uniq ON custom_options (workspace_id, list, lower(label)) WHERE archived_at IS NULL;
CREATE INDEX custom_options_list_idx ON custom_options (workspace_id, list, position);
CREATE TRIGGER custom_options_updated_at BEFORE UPDATE ON custom_options FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Records now hold any key from the business's list; the API checks it.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_method_check;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_method_check;

-- Every business starts with the built-in options.
INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'payment_method', o.key, o.label, o.position
  FROM workspaces w
 CROSS JOIN (VALUES ('upi', 'UPI', 0), ('cash', 'Cash', 1), ('bank', 'Bank transfer', 2), ('cheque', 'Cheque', 3), ('card', 'Card', 4), ('other', 'Other', 5))
       AS o (key, label, position)
ON CONFLICT DO NOTHING;

INSERT INTO custom_options (workspace_id, list, key, label, position)
SELECT w.id, 'expense_category', o.key, o.label, o.position
  FROM workspaces w
 CROSS JOIN (VALUES ('materials', 'Materials', 0), ('vendor', 'Vendors & helpers', 1), ('staff', 'Staff pay', 2), ('travel', 'Travel', 3),
                    ('food', 'Food', 4), ('equipment', 'Equipment', 5), ('rent', 'Rent & bills', 6), ('marketing', 'Ads & marketing', 7),
                    ('other', 'Other', 8))
       AS o (key, label, position)
ON CONFLICT DO NOTHING;

ALTER TABLE bills ADD COLUMN subject TEXT;
ALTER TABLE bills ADD COLUMN prices_include_gst BOOLEAN NOT NULL DEFAULT false;
-- Remembered so the invoice reopens as "10% off"; the rupee discount is still stored.
ALTER TABLE bills ADD COLUMN discount_percent NUMERIC(5, 2) CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100));
