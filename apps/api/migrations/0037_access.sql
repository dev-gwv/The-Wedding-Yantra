-- Departments decide screens (see packages/core/src/access.ts). A department's role decides
-- how much someone can do on them; the owner can switch on extra screens for one person.

-- A department's screens, once the owner changes them. Until then its starting screens apply.
CREATE TABLE IF NOT EXISTS department_access (
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  department   TEXT NOT NULL,
  areas        TEXT[] NOT NULL DEFAULT '{}',
  updated_by   UUID REFERENCES users (id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, department)
);

-- People placed in a department before this release keep their role's usual access until the
-- owner turns their department's screens on: the app promised a department changed nothing.
ALTER TABLE member_details ADD COLUMN IF NOT EXISTS department_on BOOLEAN NOT NULL DEFAULT false;

-- Extra screens for one person. On the membership, so they never carry over to a rejoin.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS extra_areas TEXT[] NOT NULL DEFAULT '{}';

-- The department an invited person joins.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS department TEXT;
