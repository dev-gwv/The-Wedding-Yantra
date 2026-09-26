-- 0019_logo_and_setup.sql
-- The business's logo, shown on quotes, bills, the client's page and the enquiry form.
-- And "these prices are right": the owner can finish setting prices without changing any.

ALTER TABLE workspaces ADD COLUMN logo_file_id UUID REFERENCES files (id);
ALTER TABLE workspaces ADD COLUMN prices_confirmed_at TIMESTAMPTZ;
