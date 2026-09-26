-- 0021_expenses_deep.sql
-- Expenses in more depth:
-- - Who paid: the business, or a team member from their own pocket, who is then paid back.
-- - GST on the purchase (input tax the CA can claim) and the vendor's bill number.
-- - The vendor it was paid to, when they're in the vendor list.
-- The amount stays what was actually paid, GST included.

ALTER TABLE expenses ADD COLUMN vendor_id UUID REFERENCES vendors (id);
ALTER TABLE expenses ADD COLUMN paid_by UUID REFERENCES users (id);
ALTER TABLE expenses ADD COLUMN reimbursed_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN reimbursed_by UUID REFERENCES users (id);
ALTER TABLE expenses ADD COLUMN gst_rate NUMERIC(5, 2) CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 40));
ALTER TABLE expenses ADD COLUMN gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0);
ALTER TABLE expenses ADD COLUMN vendor_invoice_no TEXT;

-- The GST can't be more than what was paid.
ALTER TABLE expenses ADD CONSTRAINT expenses_gst_within_amount CHECK (gst_amount <= amount);

CREATE INDEX expenses_to_reimburse_idx ON expenses (workspace_id)
  WHERE paid_by IS NOT NULL AND reimbursed_at IS NULL AND deleted_at IS NULL;
