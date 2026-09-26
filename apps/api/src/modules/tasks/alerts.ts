import { taskAlertText, type NotificationKind } from "@wedding-yantra/core";
import type { Queryable } from "../../db.js";
import type { MemberContext } from "../auth/guard.js";
import { notify } from "../notifications/service.js";

/**
 * Tells the people on a task what just happened to it: in the app, and on their phone
 * once the change is saved. Whoever did it is never told; neither is anyone who switched
 * that kind of alert off.
 */
export async function taskAlert(
  db: Queryable,
  ctx: MemberContext,
  kind: NotificationKind,
  task: { id: string; title: string },
  to: (string | null | undefined)[],
  extra: { reason?: string | null; comment?: string | null } = {},
): Promise<void> {
  const people = [...new Set(to.filter((id): id is string => !!id && id !== ctx.userId))];
  if (!people.length) return;
  const { rows } = await db.query<{ name: string | null }>(`SELECT name FROM users WHERE id = $1`, [ctx.userId]);
  const text = taskAlertText(kind, { who: rows[0]?.name, title: task.title, reason: extra.reason, comment: extra.comment });
  await notify(
    db,
    people.map((userId) => ({
      workspaceId: ctx.workspaceId,
      userId,
      kind,
      ...text,
      link: `/app/tasks?open=${task.id}`,
      entityType: "task",
      entityId: task.id,
      actorId: ctx.userId,
    })),
  );
}
