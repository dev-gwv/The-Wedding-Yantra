-- The business chooses its enquiry form's questions (name and mobile are always asked),
-- and where people go after sending it: by default a WhatsApp chat with the business.
ALTER TABLE lead_forms
  ADD COLUMN IF NOT EXISTS fields JSONB NOT NULL
    DEFAULT '[{"key":"email"},{"key":"event_type"},{"key":"event_date"},{"key":"message"}]'::jsonb,
  ADD COLUMN IF NOT EXISTS after_submit TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (after_submit IN ('thanks', 'whatsapp', 'link')),
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_text TEXT,
  ADD COLUMN IF NOT EXISTS redirect_url TEXT CHECK (redirect_url IS NULL OR redirect_url ~ '^https://');
