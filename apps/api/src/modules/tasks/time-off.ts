import { can } from "@wedding-yantra/core";
import type { TimeOff } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

const manages = (ctx: MemberContext) => can(ctx.role, "tasks.manage");
const requireWork = (ctx: MemberContext) => {
  if (!can(ctx.role, "tasks.work")) throw forbidden("Your role doesn't include days off");
};

interface Row {
  id: string;
  user_id: string;
  user_name: string | null;
  start_date: string;
  end_date: string;
  note: string | null;
  created_by: string | null;
  created_by_name: string | null;
}

const SELECT = `
  SELECT o.id, o.user_id, u.name AS user_name, o.start_date::text AS start_date, o.end_date::text AS end_date,
         o.note, o.created_by, c.name AS created_by_name
    FROM time_off o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN users c ON c.id = o.created_by`;

const toTimeOff = (r: Row): TimeOff => ({
  id: r.id,
  user: { id: r.user_id, name: r.user_name },
  startDate: r.start_date,
  endDate: r.end_date,
  note: r.note,
  createdBy: r.created_by ? { id: r.created_by, name: r.created_by_name } : null,
});

/** Owners and managers see everyone's days off; everyone else sees their own. */
export async function listTimeOff(
  db: Queryable,
  ctx: MemberContext,
  q: { from?: string; to?: string; userId?: string } = {},
): Promise<TimeOff[]> {
  requireWork(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["o.workspace_id = $1", "o.deleted_at IS NULL"];
  if (!manages(ctx)) where.push(`o.user_id = ${add(ctx.userId)}`);
  else if (q.userId) where.push(`o.user_id = ${add(q.userId)}`);
  if (q.from) where.push(`o.end_date >= ${add(q.from)}::date`);
  if (q.to) where.push(`o.start_date <= ${add(q.to)}::date`);
  const { rows } = await db.query<Row>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY o.start_date, u.name LIMIT 500`, params);
  return rows.map(toTimeOff);
}

export async function addTimeOff(
  db: Db,
  ctx: MemberContext,
  input: { userId?: string; startDate: string; endDate: string; note?: string | null },
): Promise<TimeOff> {
  requireWork(ctx);
  const userId = input.userId ?? ctx.userId;
  if (userId !== ctx.userId) {
    if (!manages(ctx)) throw forbidden("Only the owner or a manager can mark someone else's days off");
    const { rowCount } = await db.query(`SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`, [
      ctx.workspaceId,
      userId,
    ]);
    if (!rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose someone from your team", { userId: "Choose someone from your team" });
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO time_off (workspace_id, user_id, start_date, end_date, note, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [ctx.workspaceId, userId, input.startDate, input.endDate, input.note ?? null, ctx.userId],
  );
  const id = rows[0]!.id;
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "time_off.added",
    entityType: "time_off",
    entityId: id,
    meta: { userId, startDate: input.startDate, endDate: input.endDate },
  });
  const created = await db.query<Row>(`${SELECT} WHERE o.id = $1`, [id]);
  return toTimeOff(created.rows[0]!);
}

export async function removeTimeOff(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireWork(ctx);
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM time_off WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [id, ctx.workspaceId],
  );
  // Someone else's days off aren't visible to you unless you manage the team.
  if (!rows[0] || (!manages(ctx) && rows[0].user_id !== ctx.userId)) throw notFound("These days off");
  await db.query(`UPDATE time_off SET deleted_at = now() WHERE id = $1`, [id]);
}

/** Names of people off on a day, for the daily summary. */
export async function offOn(db: Queryable, workspaceId: string, day: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string | null }>(
    `SELECT DISTINCT u.name FROM time_off o JOIN users u ON u.id = o.user_id
      JOIN memberships m ON m.workspace_id = o.workspace_id AND m.user_id = o.user_id AND m.removed_at IS NULL
     WHERE o.workspace_id = $1 AND o.deleted_at IS NULL AND $2::date BETWEEN o.start_date AND o.end_date
     ORDER BY u.name`,
    [workspaceId, day],
  );
  return rows.map((r) => r.name ?? "A team member");
}
