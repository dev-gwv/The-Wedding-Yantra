import type { Queryable } from "../db.js";

/** Records who did what in a business. Feeds the activity log and accountability features. */
export async function logActivity(
  db: Queryable,
  entry: {
    workspaceId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO activity_log (workspace_id, actor_user_id, action, entity_type, entity_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.workspaceId, entry.actorUserId, entry.action, entry.entityType, entry.entityId ?? null, entry.meta ?? {}],
  );
}
