-- The follow-up time a lead was last alerted for, so "Follow-up due" goes out once per
-- follow-up, and again when the follow-up is moved to a new time.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_alerted_for TIMESTAMPTZ;

-- Follow-ups already past when this ships count as alerted: no burst of old ones on deploy.
UPDATE leads SET follow_up_alerted_for = next_follow_up_at
 WHERE next_follow_up_at IS NOT NULL AND next_follow_up_at <= now() AND follow_up_alerted_for IS NULL;
