-- 0013_deliverables.sql
-- Phase 6, Grow: what each event owes the client after (or before) the day: edited photos,
-- the film, the album, reels, hampers, a song mix. Each has a due date, who's on it, and
-- a link once it's handed over.

CREATE TABLE deliverables (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events (id),
  title         TEXT NOT NULL,
  due_date      DATE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'delivered')),
  assignee_id   UUID REFERENCES users (id),
  -- Where the client gets it: a gallery, a Drive folder, a video.
  link          TEXT,
  note          TEXT,
  delivered_at  TIMESTAMPTZ,
  delivered_by  UUID REFERENCES users (id),
  position      INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ,
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL))
);
CREATE INDEX deliverables_event_idx ON deliverables (event_id, position) WHERE deleted_at IS NULL;
CREATE INDEX deliverables_open_idx ON deliverables (workspace_id, due_date) WHERE deleted_at IS NULL AND status <> 'delivered';
CREATE INDEX deliverables_assignee_idx ON deliverables (workspace_id, assignee_id) WHERE deleted_at IS NULL;
CREATE TRIGGER deliverables_updated_at BEFORE UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
