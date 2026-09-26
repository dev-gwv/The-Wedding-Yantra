import { can, describeRepeat, latestOccurrence, nextOccurrence, type RepeatFrequency } from "@wedding-yantra/core";
import type { TaskPriority, TaskRepeat } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

const manages = (ctx: MemberContext) => can(ctx.role, "tasks.manage");
const requireWork = (ctx: MemberContext) => {
  if (!can(ctx.role, "tasks.work")) throw forbidden("Your role doesn't include tasks");
};

interface RuleRow {
  id: string;
  title: string;
  notes: string | null;
  assignee_id: string;
  assignee_name: string | null;
  priority: TaskPriority;
  due_time: string | null;
  frequency: RepeatFrequency;
  weekdays: number[];
  month_day: number | null;
  start_date: string;
  checked_on: string | null;
  created_by: string | null;
  created_by_name: string | null;
  today: string;
}

const RULE_SELECT = `
  SELECT r.id, r.title, r.notes, r.assignee_id, a.name AS assignee_name, r.priority, to_char(r.due_time, 'HH24:MI') AS due_time,
         r.frequency, r.weekdays, r.month_day, r.start_date::text AS start_date, r.checked_on::text AS checked_on,
         r.created_by, c.name AS created_by_name, (now() AT TIME ZONE w.timezone)::date::text AS today
    FROM task_repeats r
    JOIN workspaces w ON w.id = r.workspace_id
    JOIN users a ON a.id = r.assignee_id
    LEFT JOIN users c ON c.id = r.created_by`;

const rule = (r: RuleRow) => ({ frequency: r.frequency, weekdays: r.weekdays, monthDay: r.month_day, startDate: r.start_date });

const toRepeat = (r: RuleRow): TaskRepeat => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  assignee: { id: r.assignee_id, name: r.assignee_name },
  priority: r.priority,
  dueTime: r.due_time,
  frequency: r.frequency,
  weekdays: r.weekdays,
  monthDay: r.month_day,
  startDate: r.start_date,
  label: describeRepeat(rule(r)),
  nextDate: nextOccurrence(rule(r), r.today),
  createdBy: r.created_by ? { id: r.created_by, name: r.created_by_name } : null,
});

/**
 * Makes today's tasks from the business's repeating rules, once per rule per day. Only the
 * latest day is made: if nobody opened the app for a while, there's one task, not a pile.
 */
export async function makeDueRepeats(db: Queryable, workspaceId: string): Promise<void> {
  const { rows } = await db.query<RuleRow>(
    `${RULE_SELECT}
      WHERE r.workspace_id = $1 AND r.stopped_at IS NULL
        AND (r.checked_on IS NULL OR r.checked_on < (now() AT TIME ZONE w.timezone)::date)`,
    [workspaceId],
  );
  for (const r of rows) {
    const day = latestOccurrence(rule(r), r.today);
    if (day && (r.checked_on === null || day > r.checked_on)) {
      // The unique (rule, day) index makes this safe when two people open the app at once.
      await db.query(
        `INSERT INTO tasks (workspace_id, title, notes, assignee_id, due_date, due_time, priority, created_by, repeat_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (repeat_id, due_date) WHERE repeat_id IS NOT NULL DO NOTHING`,
        [workspaceId, r.title, r.notes, r.assignee_id, day, r.due_time, r.priority, r.created_by, r.id],
      );
    }
    await db.query(`UPDATE task_repeats SET checked_on = $2 WHERE id = $1`, [r.id, r.today]);
  }
}

/** Your own rules; owners and managers can ask for everyone's. */
export async function listRepeats(db: Queryable, ctx: MemberContext, scope: "mine" | "team" = "mine"): Promise<TaskRepeat[]> {
  requireWork(ctx);
  if (scope === "team" && !manages(ctx)) throw forbidden("Only the owner or a manager can see everyone's");
  const { rows } = await db.query<RuleRow>(
    `${RULE_SELECT}
      WHERE r.workspace_id = $1 AND r.stopped_at IS NULL ${scope === "team" ? "" : "AND r.assignee_id = $2"}
      ORDER BY r.created_at`,
    scope === "team" ? [ctx.workspaceId] : [ctx.workspaceId, ctx.userId],
  );
  return rows.map(toRepeat);
}

export async function createRepeat(
  db: Db,
  ctx: MemberContext,
  input: {
    title: string;
    notes?: string | null;
    assigneeId?: string | null;
    priority?: TaskPriority;
    dueTime?: string | null;
    frequency: RepeatFrequency;
    weekdays?: number[];
    monthDay?: number | null;
    startDate?: string;
  },
): Promise<TaskRepeat> {
  requireWork(ctx);
  const assignee = input.assigneeId || ctx.userId;
  if (assignee !== ctx.userId) {
    if (!manages(ctx)) throw forbidden("Only the owner or a manager can give tasks to others");
    const m = await db.query(`SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`, [ctx.workspaceId, assignee]);
    if (!m.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose someone from your team", { assigneeId: "Choose someone from your team" });
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO task_repeats (workspace_id, title, notes, assignee_id, priority, due_time, frequency, weekdays, month_day, start_date, created_by)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::date, (now() AT TIME ZONE w.timezone)::date), $11
       FROM workspaces w WHERE w.id = $1
     RETURNING id`,
    [
      ctx.workspaceId,
      input.title,
      input.notes ?? null,
      assignee,
      input.priority ?? "normal",
      input.dueTime ?? null,
      input.frequency,
      input.frequency === "weekly" ? [...new Set(input.weekdays ?? [])].sort() : [],
      input.frequency === "monthly" ? (input.monthDay ?? null) : null,
      input.startDate ?? null,
      ctx.userId,
    ],
  );
  // If today is one of its days, the task shows up straight away.
  await makeDueRepeats(db, ctx.workspaceId);
  const made = await db.query<RuleRow>(`${RULE_SELECT} WHERE r.id = $1`, [rows[0]!.id]);
  return toRepeat(made.rows[0]!);
}

/** Stops making new tasks. Ones already made stay on the list. */
export async function stopRepeat(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireWork(ctx);
  const { rows } = await db.query<{ assignee_id: string; created_by: string | null }>(
    `SELECT assignee_id, created_by FROM task_repeats WHERE id = $1 AND workspace_id = $2 AND stopped_at IS NULL`,
    [id, ctx.workspaceId],
  );
  const r = rows[0];
  if (!r) throw notFound("This repeating task");
  if (!manages(ctx) && r.assignee_id !== ctx.userId && r.created_by !== ctx.userId) {
    throw forbidden("Only the owner, a manager or whoever it's for can stop it");
  }
  await db.query(`UPDATE task_repeats SET stopped_at = now() WHERE id = $1`, [id]);
}
