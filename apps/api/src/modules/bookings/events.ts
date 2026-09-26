import { can, eventScope, leadScope, quoteNumber } from "@wedding-yantra/core";
import type {
  CalendarEntry,
  EventClash,
  EventFunction,
  EventStatus,
  EventSummary,
  EventType,
  TeamMember,
  WeddingEvent,
} from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { writeCustom } from "../fields/service.js";

/** Everyone who works events can look at them; freelancers only at the ones they're on. */
const requireView = (ctx: MemberContext) => {
  if (eventScope(ctx.role) === "none") throw forbidden("Your role doesn't include events");
};
const requireViewAll = (ctx: MemberContext) => {
  if (eventScope(ctx.role) !== "all") throw forbidden("Your role doesn't include all events");
};
/** SQL to AND in: only events this person may see. */
function scopeSql(ctx: MemberContext, add: (v: unknown) => string, alias = "e"): string {
  if (eventScope(ctx.role) === "all") return "TRUE";
  return `${alias}.id IN (SELECT event_id FROM event_team WHERE user_id = ${add(ctx.userId)})`;
}
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "events.manage")) throw forbidden("Only the owner or a manager can change events");
};
/** Booking values are money: staff see the dates and venues, not what the job is worth. */
const seesMoney = (ctx: MemberContext) => can(ctx.role, "quotes.view") || can(ctx.role, "finance.view");

interface SummaryRow {
  id: string;
  title: string;
  event_type: EventType | null;
  status: EventStatus;
  client_id: string | null;
  client_name: string | null;
  value: string | null;
  city: string | null;
  start_date: string | null;
  end_date: string | null;
  function_count: string;
}

const SUMMARY_SELECT = `
  SELECT e.id, e.title, e.event_type, e.status, e.client_id, c.name AS client_name, e.value, e.city,
         min(f.date)::text AS start_date, max(f.date)::text AS end_date, count(f.id) AS function_count
    FROM events e
    LEFT JOIN clients c ON c.id = e.client_id
    LEFT JOIN event_functions f ON f.event_id = e.id`;

const toSummary = (r: SummaryRow): EventSummary => ({
  id: r.id,
  title: r.title,
  eventType: r.event_type,
  status: r.status,
  clientId: r.client_id,
  clientName: r.client_name,
  value: r.value === null ? null : Number(r.value),
  city: r.city,
  startDate: r.start_date,
  endDate: r.end_date,
  functionCount: Number(r.function_count),
});

export interface EventFilters {
  from?: string;
  to?: string;
  status?: EventStatus;
  clientId?: string;
  /** Only events this person is on the team for */
  teamUserId?: string;
  limit?: number;
}

export async function listEvents(db: Queryable, ctx: MemberContext, filters: EventFilters = {}): Promise<EventSummary[]> {
  requireView(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const where = ["e.workspace_id = $1", "e.deleted_at IS NULL"];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  where.push(scopeSql(ctx, add));
  if (filters.status) where.push(`e.status = ${add(filters.status)}`);
  if (filters.clientId) where.push(`e.client_id = ${add(filters.clientId)}`);
  if (filters.teamUserId) where.push(`e.id IN (SELECT event_id FROM event_team WHERE user_id = ${add(filters.teamUserId)})`);
  const having: string[] = [];
  // An event is "in range" when any of its functions falls in it. Events without dates
  // yet are always shown so they aren't forgotten.
  if (filters.from) having.push(`(max(f.date) >= ${add(filters.from)} OR count(f.id) = 0)`);
  if (filters.to) having.push(`(min(f.date) <= ${add(filters.to)} OR count(f.id) = 0)`);

  const { rows } = await db.query<SummaryRow>(
    `${SUMMARY_SELECT}
      WHERE ${where.join(" AND ")}
      GROUP BY e.id, c.name
      ${having.length ? `HAVING ${having.join(" AND ")}` : ""}
      ORDER BY min(f.date) ASC NULLS FIRST, e.created_at DESC
      LIMIT ${Math.min(filters.limit ?? 300, 500)}`,
    params,
  );
  const hideValue = !seesMoney(ctx);
  return rows.map((r) => ({ ...toSummary(r), ...(hideValue && { value: null }) }));
}

/** Other events that already have a function on any of these dates. */
export async function findClashes(
  db: Queryable,
  workspaceId: string,
  dates: string[],
  excludeEventId?: string | null,
): Promise<EventClash[]> {
  if (dates.length === 0) return [];
  const { rows } = await db.query<{ date: string; event_id: string; title: string; name: string }>(
    `SELECT f.date::text AS date, e.id AS event_id, e.title, f.name
       FROM event_functions f
       JOIN events e ON e.id = f.event_id AND e.deleted_at IS NULL AND e.status <> 'cancelled'
      WHERE f.workspace_id = $1 AND f.date = ANY($2::date[]) AND ($3::uuid IS NULL OR e.id <> $3)
      ORDER BY f.date, e.title`,
    [workspaceId, dates, excludeEventId ?? null],
  );
  return rows.map((r) => ({ date: r.date, eventId: r.event_id, eventTitle: r.title, functionName: r.name }));
}

export async function clashesFor(db: Db, ctx: MemberContext, dates: string[], excludeEventId?: string) {
  requireViewAll(ctx);
  return findClashes(db, ctx.workspaceId, dates, excludeEventId);
}

export async function getEvent(db: Queryable, ctx: MemberContext, eventId: string): Promise<WeddingEvent> {
  requireView(ctx);
  const { rows } = await db.query<
    SummaryRow & {
      venue: string | null;
      notes: string | null;
      live_lead_id: string | null;
      lead_assigned_to: string | null;
      lead_created_by: string | null;
      client_phone: string | null;
      review_requested_at: Date | null;
      custom: Record<string, string | number | boolean | null>;
      created_at: Date;
    }
  >(
    `SELECT e.id, e.title, e.event_type, e.status, e.client_id, c.name AS client_name, c.phone AS client_phone,
            e.value, e.city, e.venue, e.notes, l.id AS live_lead_id, l.assigned_to AS lead_assigned_to,
            l.created_by AS lead_created_by, e.review_requested_at, e.custom, e.created_at,
            (SELECT min(date)::text FROM event_functions WHERE event_id = e.id) AS start_date,
            (SELECT max(date)::text FROM event_functions WHERE event_id = e.id) AS end_date,
            (SELECT count(*) FROM event_functions WHERE event_id = e.id) AS function_count
       FROM events e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN leads l ON l.id = e.lead_id AND l.deleted_at IS NULL
      WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL`,
    [eventId, ctx.workspaceId],
  );
  const r = rows[0];
  if (!r) throw notFound("This event");
  const team = await eventTeam(db, eventId);
  const all = eventScope(ctx.role) === "all";
  // Freelancers see only the events they're on, and not the client's number.
  if (!all && !team.some((m) => m.userId === ctx.userId)) throw notFound("This event");

  const fns = await db.query<{
    id: string;
    name: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    venue: string | null;
    notes: string | null;
  }>(
    `SELECT id, name, date::text AS date, to_char(start_time, 'HH24:MI') AS start_time,
            to_char(end_time, 'HH24:MI') AS end_time, venue, notes
       FROM event_functions WHERE event_id = $1 ORDER BY date, start_time NULLS LAST, position`,
    [eventId],
  );
  const functions: EventFunction[] = fns.rows.map((f) => ({
    id: f.id,
    name: f.name,
    date: f.date,
    startTime: f.start_time,
    endTime: f.end_time,
    venue: f.venue,
    notes: f.notes,
  }));

  const quote = can(ctx.role, "quotes.view")
    ? (
        await db.query<{ id: string; number: number }>(
          `SELECT id, number FROM quotes WHERE event_id = $1 AND deleted_at IS NULL AND status = 'accepted'
            ORDER BY accepted_at DESC LIMIT 1`,
          [eventId],
        )
      ).rows[0]
    : undefined;
  // Same rule as the leads list: staff open only the leads they added or were given.
  const scope = leadScope(ctx.role);
  const opensLead =
    r.live_lead_id !== null &&
    (scope === "all" || (scope === "own" && (r.lead_assigned_to === ctx.userId || r.lead_created_by === ctx.userId)));

  return {
    ...toSummary(r),
    ...(!seesMoney(ctx) && { value: null }),
    venue: r.venue,
    notes: r.notes,
    leadId: opensLead ? r.live_lead_id : null,
    quoteId: quote?.id ?? null,
    quoteNumber: quote ? quoteNumber(quote.number) : null,
    clientPhone: all ? r.client_phone : null,
    functions,
    team,
    clashes:
      r.status === "cancelled" || !all
        ? []
        : await findClashes(
            db,
            ctx.workspaceId,
            [...new Set(functions.map((f) => f.date))],
            eventId,
          ),
    reviewRequestedAt: r.review_requested_at?.toISOString() ?? null,
    custom: r.custom,
    createdAt: r.created_at.toISOString(),
  };
}

export interface FunctionFields {
  name: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  venue?: string | null;
  notes?: string | null;
}

async function writeFunctions(db: Queryable, workspaceId: string, eventId: string, functions: FunctionFields[]) {
  await db.query(`DELETE FROM event_functions WHERE event_id = $1`, [eventId]);
  for (const [i, f] of functions.entries()) {
    await db.query(
      `INSERT INTO event_functions (workspace_id, event_id, name, date, start_time, end_time, venue, notes, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [workspaceId, eventId, f.name, f.date, f.startTime ?? null, f.endTime ?? null, f.venue ?? null, f.notes ?? null, i],
    );
  }
}

async function assertInWorkspace(db: Queryable, table: "clients" | "leads", id: string, workspaceId: string, field: string) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [id, workspaceId],
  );
  if (!rowCount) {
    const message = table === "clients" ? "Choose a client from your list" : "Choose a lead from your list";
    throw new AppError(400, "VALIDATION_ERROR", message, { [field]: message });
  }
}

export interface EventFields {
  clientId?: string | null;
  newClient?: { name: string; phone?: string };
  leadId?: string | null;
  title: string;
  eventType?: EventType | null;
  value?: number | null;
  city?: string | null;
  venue?: string | null;
  notes?: string | null;
  functions: FunctionFields[];
  custom?: Record<string, unknown>;
}

export async function createEvent(db: Db, ctx: MemberContext, input: EventFields): Promise<WeddingEvent> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    let clientId = input.clientId ?? null;
    if (clientId) await assertInWorkspace(tx, "clients", clientId, ctx.workspaceId, "clientId");
    if (!clientId && input.newClient) {
      const phone = input.newClient.phone || null;
      const existing = phone
        ? await tx.query<{ id: string }>(
            `SELECT id FROM clients WHERE workspace_id = $1 AND phone = $2 AND deleted_at IS NULL`,
            [ctx.workspaceId, phone],
          )
        : { rows: [] as { id: string }[] };
      clientId =
        existing.rows[0]?.id ??
        (
          await tx.query<{ id: string }>(
            `INSERT INTO clients (workspace_id, name, phone, city, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [ctx.workspaceId, input.newClient.name, phone, input.city ?? null, ctx.userId],
          )
        ).rows[0]!.id;
    }
    if (input.leadId) {
      await assertInWorkspace(tx, "leads", input.leadId, ctx.workspaceId, "leadId");
      const taken = await tx.query(`SELECT 1 FROM events WHERE lead_id = $1 AND deleted_at IS NULL`, [input.leadId]);
      if (taken.rowCount) throw new AppError(409, "EVENT_EXISTS", "This lead already has an event");
    }

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO events (workspace_id, client_id, lead_id, title, event_type, value, city, venue, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        ctx.workspaceId,
        clientId,
        input.leadId ?? null,
        input.title,
        input.eventType ?? null,
        input.value ?? null,
        input.city ?? null,
        input.venue ?? null,
        input.notes ?? null,
        ctx.userId,
      ],
    );
    const id = rows[0]!.id;
    await writeFunctions(tx, ctx.workspaceId, id, input.functions);
    await writeCustom(tx, ctx.workspaceId, "event", id, input.custom);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "event.created",
      entityType: "event",
      entityId: id,
    });
    return getEvent(tx, ctx, id);
  });
}

export async function updateEvent(
  db: Db,
  ctx: MemberContext,
  eventId: string,
  input: Partial<Omit<EventFields, "clientId" | "newClient" | "leadId">> & { status?: EventStatus },
): Promise<WeddingEvent> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const exists = await tx.query(`SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL FOR UPDATE`, [
      eventId,
      ctx.workspaceId,
    ]);
    if (!exists.rowCount) throw notFound("This event");

    const map: [keyof typeof input, string][] = [
      ["title", "title"],
      ["eventType", "event_type"],
      ["status", "status"],
      ["value", "value"],
      ["city", "city"],
      ["venue", "venue"],
      ["notes", "notes"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [eventId];
    for (const [key, column] of map) {
      if (input[key] === undefined) continue;
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length) await tx.query(`UPDATE events SET ${sets.join(", ")} WHERE id = $1`, values);
    if (input.functions) await writeFunctions(tx, ctx.workspaceId, eventId, input.functions);
    await writeCustom(tx, ctx.workspaceId, "event", eventId, input.custom);
    if (input.status) {
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: `event.${input.status}`,
        entityType: "event",
        entityId: eventId,
      });
    }
    return getEvent(tx, ctx, eventId);
  });
}

export async function deleteEvent(db: Db, ctx: MemberContext, eventId: string): Promise<void> {
  requireManage(ctx);
  const { rowCount } = await db.query(
    `UPDATE events SET deleted_at = now() WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [eventId, ctx.workspaceId],
  );
  if (!rowCount) throw notFound("This event");
  await db.query(`UPDATE quotes SET event_id = NULL WHERE event_id = $1`, [eventId]);
  // Its checklist and tasks go with it.
  await db.query(`UPDATE tasks SET deleted_at = now() WHERE event_id = $1 AND deleted_at IS NULL`, [eventId]);
  await db.query(`UPDATE deliverables SET deleted_at = now() WHERE event_id = $1 AND deleted_at IS NULL`, [eventId]);
}

/** Every function in a month, for the calendar. `month` is YYYY-MM. */
export async function calendar(db: Db, ctx: MemberContext, month: string): Promise<CalendarEntry[]> {
  requireView(ctx);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError(400, "VALIDATION_ERROR", "Month should look like 2026-11", { month: "Pick a month" });
  }
  const params: unknown[] = [ctx.workspaceId, month];
  const { rows } = await db.query<{
    date: string;
    event_id: string;
    title: string;
    status: EventStatus;
    name: string;
    start_time: string | null;
    venue: string | null;
  }>(
    `SELECT f.date::text AS date, e.id AS event_id, e.title, e.status, f.name,
            to_char(f.start_time, 'HH24:MI') AS start_time, coalesce(f.venue, e.venue) AS venue
       FROM event_functions f
       JOIN events e ON e.id = f.event_id AND e.deleted_at IS NULL
      WHERE f.workspace_id = $1
        AND f.date >= to_date($2, 'YYYY-MM')
        AND f.date < to_date($2, 'YYYY-MM') + interval '1 month'
        AND ${scopeSql(ctx, (v) => (params.push(v), `$${params.length}`))}
      ORDER BY f.date, f.start_time NULLS LAST, e.title`,
    params,
  );
  return rows.map((r) => ({
    date: r.date,
    eventId: r.event_id,
    eventTitle: r.title,
    eventStatus: r.status,
    functionName: r.name,
    startTime: r.start_time,
    venue: r.venue,
  }));
}

/** Who works an event, with their role there and when they must reach. */
export async function eventTeam(db: Queryable, eventId: string): Promise<TeamMember[]> {
  const { rows } = await db.query<{ user_id: string; name: string | null; role_note: string | null; call_time: string | null }>(
    `SELECT t.user_id, u.name, t.role_note, to_char(t.call_time, 'HH24:MI') AS call_time
       FROM event_team t JOIN users u ON u.id = t.user_id
      WHERE t.event_id = $1 ORDER BY t.call_time NULLS LAST, u.name`,
    [eventId],
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name, roleNote: r.role_note, callTime: r.call_time }));
}
