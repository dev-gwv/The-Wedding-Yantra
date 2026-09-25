import { can, eventScope } from "@wedding-yantra/core";
import type { Deliverable, DeliverableStatus } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

/** Owners and managers plan deliverables; whoever makes one keeps it up to date. */
const manages = (ctx: MemberContext) => can(ctx.role, "events.manage");
const requireManage = (ctx: MemberContext) => {
  if (!manages(ctx)) throw forbidden("Only the owner or a manager can plan deliverables");
};
const requireView = (ctx: MemberContext) => {
  if (eventScope(ctx.role) === "none") throw forbidden("Your role doesn't include events");
};

interface Row {
  id: string;
  event_id: string;
  event_title: string;
  client_name: string | null;
  title: string;
  due_date: string | null;
  status: DeliverableStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  link: string | null;
  note: string | null;
  delivered_at: Date | null;
  delivered_by: string | null;
  delivered_by_name: string | null;
  created_at: Date;
  today: string;
  on_team: boolean;
}

/** `$2` is always the person asking, so "on the event's team" can be worked out per row. */
const SELECT = `
  SELECT d.id, d.event_id, e.title AS event_title, c.name AS client_name, d.title, d.due_date::text AS due_date,
         d.status, d.assignee_id, a.name AS assignee_name, d.link, d.note, d.delivered_at, d.delivered_by,
         db.name AS delivered_by_name, d.created_at, (now() AT TIME ZONE w.timezone)::date::text AS today,
         EXISTS (SELECT 1 FROM event_team t WHERE t.event_id = d.event_id AND t.user_id = $2) AS on_team
    FROM deliverables d
    JOIN workspaces w ON w.id = d.workspace_id
    JOIN events e ON e.id = d.event_id AND e.deleted_at IS NULL
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN users a ON a.id = d.assignee_id
    LEFT JOIN users db ON db.id = d.delivered_by`;

/** Whoever it's given to moves it along; when it's nobody's, anyone on the event's team can. */
const works = (ctx: MemberContext, r: Row) => manages(ctx) || r.assignee_id === ctx.userId || (r.assignee_id === null && r.on_team);

const toDeliverable = (ctx: MemberContext, r: Row): Deliverable => ({
  id: r.id,
  eventId: r.event_id,
  eventTitle: r.event_title,
  clientName: r.client_name,
  title: r.title,
  dueDate: r.due_date,
  status: r.status,
  late: r.status !== "delivered" && r.due_date !== null && r.due_date < r.today,
  assignee: r.assignee_id ? { id: r.assignee_id, name: r.assignee_name } : null,
  link: r.link,
  note: r.note,
  deliveredAt: r.delivered_at?.toISOString() ?? null,
  deliveredBy: r.delivered_by ? { id: r.delivered_by, name: r.delivered_by_name } : null,
  canUpdate: works(ctx, r),
  createdAt: r.created_at.toISOString(),
});

/** Everyone who sees all events sees their deliverables; freelancers only their events' and their own. */
const visibleSql = (ctx: MemberContext) => (eventScope(ctx.role) === "all" ? "TRUE" : "(d.assignee_id = $2 OR EXISTS (SELECT 1 FROM event_team t WHERE t.event_id = d.event_id AND t.user_id = $2))");

async function load(db: Queryable, ctx: MemberContext, id: string, lock = false): Promise<Row> {
  requireView(ctx);
  const { rows } = await db.query<Row>(
    `${SELECT} WHERE d.id = $3 AND d.workspace_id = $1 AND d.deleted_at IS NULL AND ${visibleSql(ctx)}${lock ? " FOR UPDATE OF d" : ""}`,
    [ctx.workspaceId, ctx.userId, id],
  );
  if (!rows[0]) throw notFound("This deliverable");
  return rows[0];
}

export async function listDeliverables(
  db: Queryable,
  ctx: MemberContext,
  filters: { eventId?: string; status?: "open" | "delivered"; mine?: boolean } = {},
): Promise<Deliverable[]> {
  requireView(ctx);
  const params: unknown[] = [ctx.workspaceId, ctx.userId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["d.workspace_id = $1", "d.deleted_at IS NULL", visibleSql(ctx)];
  // A cancelled event keeps its deliverables on the event, but they leave the lists.
  if (filters.eventId) where.push(`d.event_id = ${add(filters.eventId)}`);
  else where.push("e.status <> 'cancelled'");
  if (filters.status === "open") where.push("d.status <> 'delivered'");
  if (filters.status === "delivered") where.push("d.status = 'delivered'");
  if (filters.mine) where.push("d.assignee_id = $2");
  const order =
    filters.status === "delivered"
      ? "d.delivered_at DESC LIMIT 100"
      : "(d.status = 'delivered'), d.due_date NULLS LAST, d.position, d.created_at LIMIT 500";
  const { rows } = await db.query<Row>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order}`, params);
  return rows.map((r) => toDeliverable(ctx, r));
}

async function assertMember(db: Queryable, workspaceId: string, userId: string) {
  const { rowCount } = await db.query(`SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`, [
    workspaceId,
    userId,
  ]);
  if (!rowCount) throw new AppError(400, "VALIDATION_ERROR", "Pick someone from your team", { assigneeId: "Pick someone from your team" });
}

export interface DeliverableFields {
  title?: string;
  dueDate?: string | null;
  assigneeId?: string | null;
  link?: string | null;
  note?: string | null;
  status?: DeliverableStatus;
}

export async function createDeliverable(db: Db, ctx: MemberContext, input: DeliverableFields & { eventId: string; title: string }): Promise<Deliverable> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const event = await tx.query(`SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [input.eventId, ctx.workspaceId]);
    if (!event.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
    if (input.assigneeId) await assertMember(tx, ctx.workspaceId, input.assigneeId);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO deliverables (workspace_id, event_id, title, due_date, assignee_id, link, note, position, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               (SELECT coalesce(max(position), -1) + 1 FROM deliverables WHERE event_id = $2), $8)
       RETURNING id`,
      [ctx.workspaceId, input.eventId, input.title, input.dueDate ?? null, input.assigneeId ?? null, input.link ?? null, input.note ?? null, ctx.userId],
    );
    return toDeliverable(ctx, await load(tx, ctx, rows[0]!.id));
  });
}

/**
 * Owners and managers change anything. Whoever it's given to (or anyone on the event's
 * team when it's nobody's) moves it along: status, link and note.
 */
export async function updateDeliverable(db: Db, ctx: MemberContext, id: string, input: DeliverableFields): Promise<Deliverable> {
  return withTransaction(db, async (tx) => {
    const current = await load(tx, ctx, id, true);
    const planning = input.title !== undefined || input.dueDate !== undefined || input.assigneeId !== undefined;
    if (!manages(ctx) && (planning || !works(ctx, current))) throw forbidden("Only the owner, a manager or whoever is making it can change this");
    if (input.assigneeId) await assertMember(tx, ctx.workspaceId, input.assigneeId);

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.title !== undefined) set("title", input.title);
    if (input.dueDate !== undefined) set("due_date", input.dueDate);
    if (input.assigneeId !== undefined) set("assignee_id", input.assigneeId);
    if (input.link !== undefined) set("link", input.link);
    if (input.note !== undefined) set("note", input.note);
    const delivering = input.status === "delivered" && current.status !== "delivered";
    if (input.status !== undefined && input.status !== current.status) {
      set("status", input.status);
      if (delivering) {
        sets.push("delivered_at = now()");
        set("delivered_by", ctx.userId);
      } else {
        sets.push("delivered_at = NULL", "delivered_by = NULL");
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await tx.query(`UPDATE deliverables SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    }
    if (delivering) {
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "deliverable.delivered",
        entityType: "deliverable",
        entityId: id,
        meta: {
          title: input.title ?? current.title,
          eventId: current.event_id,
          late: current.due_date !== null && current.due_date < current.today,
        },
      });
    }
    return toDeliverable(ctx, await load(tx, ctx, id));
  });
}

export async function deleteDeliverable(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  await load(db, ctx, id);
  await db.query(`UPDATE deliverables SET deleted_at = now() WHERE id = $1`, [id]);
}

/** For Home: late and due this week. Everyone's for owners and managers, your own otherwise. */
export async function homeDeliverables(db: Queryable, ctx: MemberContext): Promise<{ late: number; dueThisWeek: number } | null> {
  if (eventScope(ctx.role) === "none") return null;
  const { rows } = await db.query<{ late: string; week: string }>(
    `WITH today AS (SELECT (now() AT TIME ZONE timezone)::date AS d FROM workspaces WHERE id = $1)
     SELECT count(*) FILTER (WHERE x.due_date < today.d) AS late,
            count(*) FILTER (WHERE x.due_date BETWEEN today.d AND today.d + 6) AS week
       FROM deliverables x CROSS JOIN today
       JOIN events e ON e.id = x.event_id AND e.deleted_at IS NULL AND e.status <> 'cancelled'
      WHERE x.workspace_id = $1 AND x.deleted_at IS NULL AND x.status <> 'delivered'
        AND ($3::boolean OR x.assignee_id = $2)`,
    [ctx.workspaceId, ctx.userId, manages(ctx)],
  );
  return { late: Number(rows[0]?.late ?? 0), dueThisWeek: Number(rows[0]?.week ?? 0) };
}
