-- 0009_team_review.sql
-- Phase 4 part 2: the activity log reads a business's history newest first, merged from
-- the business log and every lead's timeline, optionally for one person.

CREATE INDEX IF NOT EXISTS lead_activities_workspace_idx ON lead_activities (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_activities_actor_idx ON lead_activities (workspace_id, actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON activity_log (workspace_id, actor_user_id, created_at DESC);
-- Follow-ups set on leads, for the "follow-ups kept" score.
CREATE INDEX IF NOT EXISTS lead_activities_follow_ups_idx ON lead_activities (workspace_id, lead_id, created_at)
  WHERE kind = 'follow_up_set';
