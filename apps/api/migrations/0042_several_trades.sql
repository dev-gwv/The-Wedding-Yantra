-- A business can do several kinds of work (a wedding planner who also shoots photos).
-- business_type_id stays the main one, for the icon; business_type_ids holds all of them, main first.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS business_type_ids TEXT[];
UPDATE workspaces SET business_type_ids = ARRAY[business_type_id] WHERE business_type_ids IS NULL OR cardinality(business_type_ids) = 0;
ALTER TABLE workspaces ALTER COLUMN business_type_ids SET NOT NULL;

-- A vendor can do several things too (a florist who also does lighting). category stays the first one.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';
UPDATE vendors SET categories = ARRAY[category] WHERE category IS NOT NULL AND cardinality(categories) = 0;
