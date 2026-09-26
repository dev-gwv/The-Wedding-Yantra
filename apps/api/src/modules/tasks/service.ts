import { can, checklistDays, describeRepeat, eventScope, type CustomValues, type RepeatFrequency, type TaskStatus } from "@wedding-yantra/core";
import type { ChecklistItem, ChecklistWhen, MyDay, StarterPack, TaskDueFilter, TaskItem, TaskPriority, TeamMember } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { eventTeam, listEvents } from "../bookings/events.js";
import { makeDueRepeats } from "./repeats.js";
import { moveTask } from "./delegation.js";
import { writeCustom } from "../fields/service.js";
import { assertOption, optionJoin } from "../options/service.js";

export const manages = (ctx: MemberContext) => can(ctx.role, "tasks.manage");
const requireWork = (ctx: MemberContext) => {
  if (!can(ctx.role, "tasks.work")) throw forbidden("Your role doesn't include tasks");
};
const requireManage = (ctx: MemberContext) => {
  if (!manages(ctx)) throw forbidden("Only the owner or a manager can do this");
};

// ---------------------------------------------------------------------------
// Reading tasks
// ---------------------------------------------------------------------------

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  event_id: string | null;
  event_title: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  done_at: Date | null;
  done_by: string | null;
  done_by_name: string | null;
  template_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
  today: string;
  repeat_id: string | null;
  repeat_frequency: RepeatFrequency | null;
  repeat_weekdays: number[] | null;
  repeat_month_day: number | null;
  repeat_stopped: boolean | null;
  tag: string | null;
  tag_label: string | null;
  client_id: string | null;
  client_name: string | null;
  start_date: string | null;
  estimate_hours: string | null;
  needs_check: boolean;
  waiting_reason: string | null;
  completed_at: Date | null;
  accepted_at: Date | null;
  revisions: number;
  moved_count: number;
  custom: CustomValues;
  steps_done: number;
  steps_total: number;
  comment_count: number;
  file_count: number;
  last_sub_at: Date | null;
  last_sub_link: string | null;
  last_sub_decision: "approved" | "sent_back" | null;
}

export const TASK_SELECT = `
  SELECT t.id, t.title, t.notes, t.event_id, e.title AS event_title, t.assignee_id, a.name AS assignee_name,
         t.due_date::text AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time, t.priority, t.status,
         t.done_at, t.done_by, d.name AS done_by_name, t.template_id, t.created_by, c.name AS created_by_name,
         t.created_at, (now() AT TIME ZONE w.timezone)::date::text AS today,
         t.repeat_id, rp.frequency AS repeat_frequency, rp.weekdays AS repeat_weekdays, rp.month_day AS repeat_month_day,
         (rp.stopped_at IS NOT NULL) AS repeat_stopped,
         t.tag, tg.label AS tag_label, t.client_id, cl.name AS client_name, t.start_date::text AS start_date, t.estimate_hours,
         t.needs_check, t.waiting_reason, t.completed_at, t.accepted_at, t.revisions, t.moved_count, t.custom,
         (SELECT count(*)::int FROM task_steps s WHERE s.task_id = t.id AND s.done_at IS NOT NULL) AS steps_done,
         (SELECT count(*)::int FROM task_steps s WHERE s.task_id = t.id) AS steps_total,
         (SELECT count(*)::int FROM task_comments k WHERE k.task_id = t.id AND k.deleted_at IS NULL) AS comment_count,
         (SELECT count(*)::int FROM task_files f WHERE f.task_id = t.id) AS file_count,
         ls.created_at AS last_sub_at, ls.link AS last_sub_link, ls.decision AS last_sub_decision
    FROM tasks t
    LEFT JOIN task_repeats rp ON rp.id = t.repeat_id
    LEFT JOIN clients cl ON cl.id = t.client_id
    ${optionJoin("tg", "task_tag", "t.workspace_id", "t.tag")}
    LEFT JOIN LATERAL (SELECT created_at, link, decision FROM task_submissions WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1) ls ON true
    JOIN workspaces w ON w.id = t.workspace_id
    LEFT JOIN events e ON e.id = t.event_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users d ON d.id = t.done_by
    LEFT JOIN users c ON c.id = t.created_by`;

/** Urgent first, then high, normal, low. */
export const PRIORITY_RANK = "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END";

/** Tasks that aren't for an event, or whose event is still on. */
const ACTIVE_EVENT = "(t.event_id IS NULL OR (e.status <> 'cancelled' AND e.deleted_at IS NULL))";

export const toTask = (r: TaskRow): TaskItem => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  eventId: r.event_id,
  eventTitle: r.event_title,
  assignee: r.assignee_id ? { id: r.assignee_id, name: r.assignee_name } : null,
  dueDate: r.due_date,
  dueTime: r.due_time,
  priority: r.priority,
  status: r.status,
  done: r.status === "done",
  doneAt: r.done_at?.toISOString() ?? null,
  doneBy: r.done_by ? { id: r.done_by, name: r.done_by_name } : null,
  overdue: r.status !== "done" && r.status !== "cancelled" && r.due_date !== null && r.due_date < r.today,
  tag: r.tag,
  tagLabel: r.tag ? (r.tag_label ?? r.tag) : null,
  clientId: r.client_id,
  clientName: r.client_name,
  startDate: r.start_date,
  estimateHours: r.estimate_hours === null ? null : Number(r.estimate_hours),
  needsCheck: r.needs_check,
  waitingReason: r.waiting_reason,
  completedAt: r.completed_at?.toISOString() ?? null,
  acceptedAt: r.accepted_at?.toISOString() ?? null,
  revisions: r.revisions,
  movedCount: r.moved_count,
  steps: { done: r.steps_done, total: r.steps_total },
  comments: r.comment_count,
  files: r.file_count,
  lastSubmission: r.last_sub_at ? { at: r.last_sub_at.toISOString(), link: r.last_sub_link, decision: r.last_sub_decision } : null,
  custom: r.custom ?? {},
  fromChecklist: r.template_id !== null,
  repeat:
    r.repeat_id && r.repeat_frequency
      ? {
          id: r.repeat_id,
          label: describeRepeat({ frequency: r.repeat_frequency, weekdays: r.repeat_weekdays ?? [], monthDay: r.repeat_month_day }),
          active: !r.repeat_stopped,
        }
      : null,
  createdBy: r.created_by ? { id: r.created_by, name: r.created_by_name } : null,
  createdAt: r.created_at.toISOString(),
});

/** Whether this person may look at the event (freelancers: only events they're on). */
export async function seesEvent(db: Queryable, ctx: MemberContext, eventId: string): Promise<boolean> {
  const { rows } = await db.query<{ on_team: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM event_team WHERE event_id = e.id AND user_id = $3) AS on_team
       FROM events e WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL`,
    [eventId, ctx.workspaceId, ctx.userId],
  );
  if (!rows[0]) return false;
  return eventScope(ctx.role) === "all" || rows[0].on_team;
}

/** A task is visible to managers, to whoever it's for or who made it, and to anyone who can see its event. */
export async function loadTask(db: Queryable, ctx: MemberContext, id: string, lock = false): Promise<TaskRow> {
  const { rows } = await db.query<TaskRow>(
    `${TASK_SELECT} WHERE t.id = $1 AND t.workspace_id = $2 AND t.deleted_at IS NULL${lock ? " FOR UPDATE OF t" : ""}`,
    [id, ctx.workspaceId],
  );
  const row = rows[0];
  if (!row) throw notFound("This task");
  const visible =
    manages(ctx) ||
    row.assignee_id === ctx.userId ||
    row.created_by === ctx.userId ||
    (row.event_id !== null && (await seesEvent(db, ctx, row.event_id)));
  if (!visible) throw notFound("This task");
  return row;
}

export async function listTasks(
  db: Queryable,
  ctx: MemberContext,
  filters: {
    scope?: "mine" | "team" | "given";
    status?: "open" | "done";
    state?: TaskStatus;
    eventId?: string;
    clientId?: string;
    assigneeId?: string;
    priority?: TaskPriority;
    tag?: string;
    due?: TaskDueFilter;
    q?: string;
  } = {},
): Promise<TaskItem[]> {
  requireWork(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["t.workspace_id = $1", "t.deleted_at IS NULL"];
  if (filters.eventId) {
    // An event's checklist is for everyone who works the event.
    if (!(await seesEvent(db, ctx, filters.eventId))) throw notFound("This event");
    where.push(`t.event_id = ${add(filters.eventId)}`);
  } else {
    if (filters.clientId) {
      // A client's tasks: managers see all of them, everyone else their own.
      where.push(`t.client_id = ${add(filters.clientId)}`);
      if (!manages(ctx)) where.push(`(t.assignee_id = ${add(ctx.userId)} OR t.created_by = $${params.length})`);
    } else if (filters.scope === "team") {
      requireManage(ctx);
      if (filters.assigneeId === "none") where.push("t.assignee_id IS NULL");
      else if (filters.assigneeId) where.push(`t.assignee_id = ${add(filters.assigneeId)}`);
    } else if (filters.scope === "given") {
      // Tasks I gave others: to follow up on.
      where.push(`t.created_by = ${add(ctx.userId)}`, `t.assignee_id IS DISTINCT FROM $${params.length}`);
    } else {
      where.push(`t.assignee_id = ${add(ctx.userId)}`);
    }
    // A cancelled event's tasks stay on the event but leave everyone's list.
    where.push(ACTIVE_EVENT);
    // Today's copies of repeating tasks appear the first time anyone looks.
    await makeDueRepeats(db, ctx.workspaceId);
  }
  if (filters.state) where.push(`t.status = ${add(filters.state)}`);
  else if (filters.status === "open") where.push("t.status NOT IN ('done', 'cancelled')");
  else if (filters.status === "done") where.push("t.status = 'done'");
  if (filters.priority) where.push(`t.priority = ${add(filters.priority)}`);
  if (filters.tag) where.push(`t.tag = ${add(filters.tag)}`);
  if (filters.q) {
    const like = add(`%${filters.q.replace(/[%_]/g, "")}%`);
    where.push(`(t.title ILIKE ${like} OR t.notes ILIKE ${like} OR e.title ILIKE ${like} OR cl.name ILIKE ${like})`);
  }
  const today = "(now() AT TIME ZONE w.timezone)::date";
  if (filters.due === "overdue") where.push(`t.due_date < ${today}`);
  else if (filters.due === "today") where.push(`t.due_date = ${today}`);
  else if (filters.due === "week") where.push(`t.due_date BETWEEN ${today} AND ${today} + 7`);
  else if (filters.due === "none") where.push("t.due_date IS NULL");
  // Finished tasks: the latest first. Otherwise by day, urgent ones first within a day.
  const order =
    filters.status === "done" || filters.state === "done" || filters.state === "cancelled"
      ? "coalesce(t.done_at, t.updated_at) DESC NULLS LAST, t.created_at DESC LIMIT 100"
      : `(t.status IN ('done', 'cancelled')), t.due_date NULLS LAST, ${PRIORITY_RANK}, t.due_time NULLS LAST, t.position, t.created_at LIMIT 500`;
  const { rows } = await db.query<TaskRow>(`${TASK_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order}`, params);
  return rows.map(toTask);
}

// ---------------------------------------------------------------------------
// Writing tasks
// ---------------------------------------------------------------------------

export interface TaskFields {
  title: string;
  notes?: string | null;
  eventId?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
  tag?: string | null;
  clientId?: string | null;
  startDate?: string | null;
  estimateHours?: number | null;
  needsCheck?: boolean;
  custom?: Record<string, unknown>;
  steps?: string[];
}

async function assertMember(db: Queryable, workspaceId: string, userId: string) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`,
    [workspaceId, userId],
  );
  if (!rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose someone from your team", { assigneeId: "Choose someone from your team" });
}

async function assertClient(db: Queryable, workspaceId: string, clientId: string) {
  const { rowCount } = await db.query(`SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [clientId, workspaceId]);
  if (!rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a client from your list", { clientId: "Choose a client" });
}

/** One line in a task's history. */
export async function taskEvent(db: Queryable, taskId: string, actorId: string | null, action: string, meta: Record<string, unknown> = {}) {
  await db.query(`INSERT INTO task_events (task_id, actor_id, action, meta) VALUES ($1, $2, $3, $4)`, [taskId, actorId, action, JSON.stringify(meta)]);
}

/**
 * Owners and managers give tasks to anyone, or to whoever is on the event; everyone else
 * adds tasks for themselves. No one chosen means yourself.
 */
export async function createTask(db: Db, ctx: MemberContext, input: TaskFields): Promise<TaskItem> {
  requireWork(ctx);
  const assignee = input.assigneeId === undefined ? ctx.userId : input.assigneeId;
  if (assignee !== ctx.userId) {
    if (!manages(ctx)) throw forbidden("Only the owner or a manager can give tasks to others");
    if (assignee) await assertMember(db, ctx.workspaceId, assignee);
    else if (!input.eventId) {
      throw new AppError(400, "VALIDATION_ERROR", "Choose who does it", { assigneeId: "Choose who does it" });
    }
  }
  if (input.eventId && !(await seesEvent(db, ctx, input.eventId))) {
    throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
  }
  return withTransaction(db, async (tx) => {
    if (input.clientId) await assertClient(tx, ctx.workspaceId, input.clientId);
    if (input.tag) await assertOption(tx, ctx.workspaceId, "task_tag", input.tag, "tag");
    // A check only makes sense when someone else does the work.
    const needsCheck = !!input.needsCheck && assignee !== ctx.userId;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO tasks (workspace_id, title, notes, event_id, assignee_id, due_date, due_time, priority, created_by,
                          tag, client_id, start_date, estimate_hours, needs_check)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [
        ctx.workspaceId,
        input.title,
        input.notes ?? null,
        input.eventId ?? null,
        assignee,
        input.dueDate ?? null,
        input.dueTime ?? null,
        input.priority ?? "normal",
        ctx.userId,
        input.tag ?? null,
        input.clientId ?? null,
        input.startDate ?? null,
        input.estimateHours ?? null,
        needsCheck,
      ],
    );
    const id = rows[0]!.id;
    for (const [position, title] of (input.steps ?? []).entries()) {
      await tx.query(`INSERT INTO task_steps (task_id, title, position) VALUES ($1, $2, $3)`, [id, title, position]);
    }
    await writeCustom(tx, ctx.workspaceId, "task", id, input.custom);
    await taskEvent(tx, id, ctx.userId, "created", { assigneeId: assignee, dueDate: input.dueDate ?? null });
    if (assignee !== ctx.userId) {
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "task.assigned",
        entityType: "task",
        entityId: id,
        meta: { title: input.title, assigneeId: assignee },
      });
    }
    return toTask(await loadTask(tx, ctx, id));
  });
}

/** Owners, managers and whoever added it change a task. A later date is counted as moved. */
export async function updateTask(db: Db, ctx: MemberContext, id: string, input: Partial<TaskFields>): Promise<TaskItem> {
  requireWork(ctx);
  return withTransaction(db, async (tx) => {
    const row = await loadTask(tx, ctx, id, true);
    // Your own tasks are yours to change; other people's are the manager's.
    if (!manages(ctx) && row.created_by !== ctx.userId) throw forbidden("Only the owner or a manager can change this task");
    if (input.assigneeId !== undefined && input.assigneeId !== row.assignee_id) {
      if (!manages(ctx)) throw forbidden("Only the owner or a manager can give tasks to others");
      if (input.assigneeId) await assertMember(tx, ctx.workspaceId, input.assigneeId);
    }
    if (input.eventId && !(await seesEvent(tx, ctx, input.eventId))) {
      throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
    }
    if (input.clientId) await assertClient(tx, ctx.workspaceId, input.clientId);
    if (input.tag) await assertOption(tx, ctx.workspaceId, "task_tag", input.tag, "tag", row.tag ?? undefined);
    const map: [keyof TaskFields, string][] = [
      ["title", "title"],
      ["notes", "notes"],
      ["eventId", "event_id"],
      ["assigneeId", "assignee_id"],
      ["dueDate", "due_date"],
      ["dueTime", "due_time"],
      ["priority", "priority"],
      ["tag", "tag"],
      ["clientId", "client_id"],
      ["startDate", "start_date"],
      ["estimateHours", "estimate_hours"],
      ["needsCheck", "needs_check"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [id];
    const changed: string[] = [];
    for (const [key, column] of map) {
      if (input[key] === undefined) continue;
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
      changed.push(key);
    }
    // Pushing an open task's date later is counted: it's the moved-deadline measure.
    const later = input.dueDate !== undefined && row.due_date !== null && (input.dueDate === null || input.dueDate > row.due_date);
    const active = row.status !== "done" && row.status !== "cancelled";
    if (later && active) sets.push("moved_count = moved_count + 1");
    if (sets.length) await tx.query(`UPDATE tasks SET ${sets.join(", ")} WHERE id = $1`, values);
    await writeCustom(tx, ctx.workspaceId, "task", id, input.custom);

    if (input.assigneeId !== undefined && input.assigneeId !== row.assignee_id) {
      await taskEvent(tx, id, ctx.userId, "reassigned", { from: row.assignee_id, to: input.assigneeId });
      if (input.assigneeId && input.assigneeId !== ctx.userId) {
        await logActivity(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: "task.assigned",
          entityType: "task",
          entityId: id,
          meta: { title: input.title ?? row.title, assigneeId: input.assigneeId },
        });
      }
    }
    if (input.dueDate !== undefined && input.dueDate !== row.due_date) {
      await taskEvent(tx, id, ctx.userId, later ? "deadline_moved" : "due_changed", { from: row.due_date, to: input.dueDate });
      if (later && active) {
        await logActivity(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: "task.deadline_moved",
          entityType: "task",
          entityId: id,
          meta: { title: row.title, from: row.due_date, to: input.dueDate, assigneeId: row.assignee_id },
        });
      }
    }
    const other = changed.filter((k) => k !== "assigneeId" && k !== "dueDate");
    if (other.length || input.custom) await taskEvent(tx, id, ctx.userId, "edited", { fields: other });
    return toTask(await loadTask(tx, ctx, id));
  });
}

/** Tick a task off (or back on). Same as moving it to done, or back to to-do. */
export async function setTaskDone(db: Db, ctx: MemberContext, id: string, done: boolean): Promise<TaskItem> {
  return moveTask(db, ctx, id, { status: done ? "done" : "open" });
}

export async function deleteTask(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireWork(ctx);
  const row = await loadTask(db, ctx, id);
  if (!manages(ctx) && row.created_by !== ctx.userId) throw forbidden("Only the owner or a manager can remove this task");
  await db.query(`UPDATE tasks SET deleted_at = now() WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// The checklist every event starts with
// ---------------------------------------------------------------------------

/** A new business starts with its trade's checklist, spread over the days around each event. */
export async function installChecklist(db: Queryable, workspaceId: string, pack: StarterPack): Promise<void> {
  const days = checklistDays(pack.checklist);
  for (const [i, item] of pack.checklist.entries()) {
    await db.query(
      `INSERT INTO checklist_templates (workspace_id, title, when_kind, days, position) VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, item.title, item.when, days[i], i],
    );
  }
}

export async function getChecklist(db: Queryable, ctx: MemberContext): Promise<ChecklistItem[]> {
  requireWork(ctx);
  const { rows } = await db.query<{ id: string; title: string; when_kind: ChecklistWhen; days: number }>(
    `SELECT id, title, when_kind, days FROM checklist_templates WHERE workspace_id = $1
      ORDER BY CASE when_kind WHEN 'before' THEN 0 WHEN 'on_day' THEN 1 ELSE 2 END, position, created_at`,
    [ctx.workspaceId],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, when: r.when_kind, days: r.days }));
}

/** Replaces the checklist. Tasks already made for events stay as they are. */
export async function saveChecklist(
  db: Db,
  ctx: MemberContext,
  items: { id?: string; title: string; when: ChecklistWhen; days: number }[],
): Promise<ChecklistItem[]> {
  requireManage(ctx);
  await withTransaction(db, async (tx) => {
    const keep = items.filter((i) => i.id).map((i) => i.id!);
    await tx.query(`DELETE FROM checklist_templates WHERE workspace_id = $1 AND NOT (id = ANY($2::uuid[]))`, [ctx.workspaceId, keep]);
    for (const [position, item] of items.entries()) {
      const days = item.when === "on_day" ? 0 : item.days;
      if (item.id) {
        const { rowCount } = await tx.query(
          `UPDATE checklist_templates SET title = $3, when_kind = $4, days = $5, position = $6 WHERE id = $1 AND workspace_id = $2`,
          [item.id, ctx.workspaceId, item.title, item.when, days, position],
        );
        if (!rowCount) throw notFound("A checklist step");
      } else {
        await tx.query(
          `INSERT INTO checklist_templates (workspace_id, title, when_kind, days, position) VALUES ($1, $2, $3, $4, $5)`,
          [ctx.workspaceId, item.title, item.when, days, position],
        );
      }
    }
  });
  return getChecklist(db, ctx);
}

/**
 * Adds the business's checklist to an event, with due dates counted from its functions.
 * Steps already added are skipped, so it's safe to press again after the checklist grows.
 */
export async function applyChecklist(db: Db, ctx: MemberContext, eventId: string): Promise<TaskItem[]> {
  requireManage(ctx);
  await withTransaction(db, async (tx) => {
    const e = await tx.query<{ start_date: string | null; end_date: string | null }>(
      `SELECT (SELECT min(date)::text FROM event_functions WHERE event_id = e.id) AS start_date,
              (SELECT max(date)::text FROM event_functions WHERE event_id = e.id) AS end_date
         FROM events e WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL`,
      [eventId, ctx.workspaceId],
    );
    if (!e.rows[0]) throw notFound("This event");
    const { start_date: start, end_date: end } = e.rows[0];
    await tx.query(
      `INSERT INTO tasks (workspace_id, title, event_id, due_date, template_id, position, created_by)
       SELECT $1, ct.title, $2,
              CASE ct.when_kind
                WHEN 'before' THEN $3::date - ct.days
                WHEN 'on_day' THEN $3::date
                ELSE $4::date + ct.days
              END,
              ct.id, ct.position, $5
         FROM checklist_templates ct
        WHERE ct.workspace_id = $1
          -- Steps already added are skipped, and so are ones removed from this event on purpose.
          AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.event_id = $2 AND t.template_id = ct.id)`,
      [ctx.workspaceId, eventId, start, end, ctx.userId],
    );
  });
  return listTasks(db, ctx, { eventId });
}

// ---------------------------------------------------------------------------
// Who works an event
// ---------------------------------------------------------------------------

export async function saveEventTeam(
  db: Db,
  ctx: MemberContext,
  eventId: string,
  members: { userId: string; roleNote?: string | null; callTime?: string | null }[],
): Promise<TeamMember[]> {
  requireManage(ctx);
  await withTransaction(db, async (tx) => {
    const e = await tx.query(`SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [eventId, ctx.workspaceId]);
    if (!e.rowCount) throw notFound("This event");
    const ids = [...new Set(members.map((m) => m.userId))];
    if (ids.length) {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM memberships WHERE workspace_id = $1 AND user_id = ANY($2::uuid[]) AND removed_at IS NULL`,
        [ctx.workspaceId, ids],
      );
      if (rows.length !== ids.length) {
        throw new AppError(400, "VALIDATION_ERROR", "Choose people from your team", { members: "Choose people from your team" });
      }
    }
    await tx.query(`DELETE FROM event_team WHERE event_id = $1 AND NOT (user_id = ANY($2::uuid[]))`, [eventId, ids]);
    for (const m of members) {
      await tx.query(
        `INSERT INTO event_team (event_id, workspace_id, user_id, role_note, call_time, added_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (event_id, user_id) DO UPDATE SET role_note = EXCLUDED.role_note, call_time = EXCLUDED.call_time`,
        [eventId, ctx.workspaceId, m.userId, m.roleNote ?? null, m.callTime ?? null, ctx.userId],
      );
    }
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "event.team_changed",
      entityType: "event",
      entityId: eventId,
      meta: { members: ids.length },
    });
  });
  return eventTeam(db, eventId);
}

// ---------------------------------------------------------------------------
// My Day and Home
// ---------------------------------------------------------------------------

export async function myDay(db: Db, ctx: MemberContext): Promise<MyDay> {
  requireWork(ctx);
  const { rows } = await db.query<{ today: string; week: string }>(
    `SELECT (now() AT TIME ZONE timezone)::date::text AS today, ((now() AT TIME ZONE timezone)::date + 7)::text AS week
       FROM workspaces WHERE id = $1`,
    [ctx.workspaceId],
  );
  const { today, week } = rows[0]!;
  const open = await listTasks(db, ctx, { scope: "mine", status: "open" });

  // Events you're on the team for, from today to a week out.
  const onTeam = await db.query<{ event_id: string; call_time: string | null; role_note: string | null }>(
    `SELECT event_id, to_char(call_time, 'HH24:MI') AS call_time, role_note FROM event_team WHERE workspace_id = $1 AND user_id = $2`,
    [ctx.workspaceId, ctx.userId],
  );
  const mine = new Map(onTeam.rows.map((r) => [r.event_id, r]));
  const events = mine.size
    ? (await listEvents(db, ctx, { from: today, to: week, status: "confirmed", teamUserId: ctx.userId }))
        .filter((e) => e.startDate !== null)
        .map((e) => ({ ...e, callTime: mine.get(e.id)?.call_time ?? null, roleNote: mine.get(e.id)?.role_note ?? null }))
    : [];

  return {
    today,
    overdue: open.filter((t) => t.overdue),
    dueToday: open.filter((t) => t.dueDate === today),
    upcoming: open.filter((t) => t.dueDate !== null && t.dueDate > today && t.dueDate <= week),
    events,
  };
}

export async function homeTasks(db: Queryable, ctx: MemberContext): Promise<{ overdue: number; dueToday: number; teamOverdue: number | null }> {
  if (!can(ctx.role, "tasks.work")) return { overdue: 0, dueToday: 0, teamOverdue: null };
  await makeDueRepeats(db, ctx.workspaceId);
  const { rows } = await db.query<{ overdue: string; due_today: string; team_overdue: string }>(
    `WITH today AS (SELECT (now() AT TIME ZONE timezone)::date AS d FROM workspaces WHERE id = $1)
     SELECT count(*) FILTER (WHERE t.assignee_id = $2 AND t.due_date < today.d) AS overdue,
            count(*) FILTER (WHERE t.assignee_id = $2 AND t.due_date = today.d) AS due_today,
            count(*) FILTER (WHERE t.due_date < today.d) AS team_overdue
       FROM tasks t CROSS JOIN today
       LEFT JOIN events e ON e.id = t.event_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.status NOT IN ('done', 'cancelled') AND ${ACTIVE_EVENT}`,
    [ctx.workspaceId, ctx.userId],
  );
  const r = rows[0]!;
  return { overdue: Number(r.overdue), dueToday: Number(r.due_today), teamOverdue: manages(ctx) ? Number(r.team_overdue) : null };
}
