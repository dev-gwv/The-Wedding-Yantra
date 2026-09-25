-- 0011_billing.sql
-- Phase 5: plans, the free trial and subscriptions.

-- Every business gets a free trial. Businesses that already exist start theirs today.
ALTER TABLE workspaces ADD COLUMN trial_ends_at TIMESTAMPTZ;
UPDATE workspaces SET trial_ends_at = greatest(created_at, now()) + interval '14 days';
ALTER TABLE workspaces ALTER COLUMN trial_ends_at SET DEFAULT now() + interval '14 days';
ALTER TABLE workspaces ALTER COLUMN trial_ends_at SET NOT NULL;

-- A paid plan. Online ones come from Razorpay; manual ones are recorded by whoever runs the
-- service when a business pays another way.
CREATE TABLE subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  plan                      TEXT NOT NULL CHECK (plan IN ('starter', 'studio', 'business')),
  period                    TEXT NOT NULL CHECK (period IN ('monthly', 'yearly')),
  status                    TEXT NOT NULL CHECK (status IN ('created', 'active', 'past_due', 'cancelled', 'completed')),
  provider                  TEXT NOT NULL CHECK (provider IN ('razorpay', 'manual')),
  provider_subscription_id  TEXT UNIQUE,
  checkout_url              TEXT,
  current_period_end        TIMESTAMPTZ,
  note                      TEXT,
  created_by                UUID REFERENCES users (id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_workspace_idx ON subscriptions (workspace_id, created_at DESC);
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every payment-provider message, once: repeats of the same message are ignored.
CREATE TABLE billing_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  type         TEXT NOT NULL,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
