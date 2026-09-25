import { can } from "@wedding-yantra/core";
import type { DailySummary } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { offOn } from "../tasks/time-off.js";
import { requireReview } from "./activity.js";

/**
 * One day of the business in numbers, and tomorrow's events: what an owner sends to
 * themselves or the team group at the end of the day. Counted in the business's time zone.
 */
export async function dailySummary(db: Queryable, ctx: Parameters<typeof requireReview>[0], date?: string): Promise<DailySummary> {
  requireReview(ctx);
  const ws = ctx.workspaceId;
  const { rows } = await db.query<{ day: string; tomorrow: string; tz: string }>(
    `SELECT d::text AS day, (d + 1)::text AS tomorrow, timezone AS tz
       FROM workspaces, LATERAL (SELECT coalesce($2::date, (now() AT TIME ZONE timezone)::date) AS d) x
      WHERE id = $1`,
    [ws, date ?? null],
  );
  const { day, tomorrow, tz } = rows[0]!;
  const seesMoney = can(ctx.role, "finance.view");

  const [received, sales, done, late, waiting, events, dueTomorrow, off] = await Promise.all([
    db.query<{ total: string; count: number }>(
      `SELECT coalesce(sum(amount), 0) AS total, count(*) AS count FROM payments
        WHERE workspace_id = $1 AND deleted_at IS NULL AND paid_on = $2::date`,
      [ws, day],
    ),
    db.query<{ new_leads: number; booked: number }>(
      `SELECT (SELECT count(*) FROM leads WHERE workspace_id = $1 AND deleted_at IS NULL AND (created_at AT TIME ZONE $3)::date = $2::date) AS new_leads,
              (SELECT count(DISTINCT la.lead_id) FROM lead_activities la JOIN leads l ON l.id = la.lead_id AND l.deleted_at IS NULL
                WHERE la.workspace_id = $1 AND la.kind = 'stage_changed' AND la.meta ->> 'kind' = 'won'
                  AND (la.created_at AT TIME ZONE $3)::date = $2::date) AS booked`,
      [ws, day, tz],
    ),
    db.query<{ count: number }>(
      `SELECT count(*) AS count FROM tasks
        WHERE workspace_id = $1 AND deleted_at IS NULL AND status = 'done' AND (done_at AT TIME ZONE $3)::date = $2::date`,
      [ws, day, tz],
    ),
    // Late by the end of the day: due that day or before, and not ticked off by then.
    db.query<{ name: string | null; count: number }>(
      `SELECT u.name, count(*) AS count
         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN events e ON e.id = t.event_id
        WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.due_date <= $2::date
          AND (t.status = 'open' OR (t.done_at AT TIME ZONE $3)::date > $2::date)
          AND (t.event_id IS NULL OR (e.status <> 'cancelled' AND e.deleted_at IS NULL))
        GROUP BY t.assignee_id, u.name
        ORDER BY count(*) DESC, u.name NULLS LAST`,
      [ws, day, tz],
    ),
    db.query<{ count: number }>(
      `SELECT count(*) AS count FROM expenses WHERE workspace_id = $1 AND deleted_at IS NULL AND status = 'pending'`,
      [ws],
    ),
    db.query<{ title: string; functions: { name: string; time: string | null }[]; team: string[] }>(
      `SELECT e.title,
              (SELECT json_agg(json_build_object('name', f.name, 'time', to_char(f.start_time, 'HH24:MI')) ORDER BY f.start_time NULLS LAST, f.name)
                 FROM event_functions f WHERE f.event_id = e.id AND f.date = $2::date) AS functions,
              coalesce((SELECT json_agg(u.name ORDER BY t.call_time NULLS LAST, u.name)
                          FROM event_team t JOIN users u ON u.id = t.user_id WHERE t.event_id = e.id AND u.name IS NOT NULL), '[]') AS team
         FROM events e
        WHERE e.workspace_id = $1 AND e.deleted_at IS NULL AND e.status = 'confirmed'
          AND EXISTS (SELECT 1 FROM event_functions f WHERE f.event_id = e.id AND f.date = $2::date)
        ORDER BY (SELECT min(f.start_time) FROM event_functions f WHERE f.event_id = e.id AND f.date = $2::date) NULLS LAST, e.title`,
      [ws, tomorrow],
    ),
    db.query<{ count: number }>(
      `SELECT count(*) AS count FROM tasks t LEFT JOIN events e ON e.id = t.event_id
        WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.status = 'open' AND t.due_date = $2::date
          AND (t.event_id IS NULL OR (e.status <> 'cancelled' AND e.deleted_at IS NULL))`,
      [ws, tomorrow],
    ),
    offOn(db, ws, tomorrow),
  ]);

  return {
    date: day,
    received: seesMoney ? { total: Number(received.rows[0]!.total), count: Number(received.rows[0]!.count) } : null,
    newLeads: Number(sales.rows[0]!.new_leads),
    booked: Number(sales.rows[0]!.booked),
    tasksDone: Number(done.rows[0]!.count),
    lateTasks: late.rows.map((r) => ({ name: r.name, count: Number(r.count) })),
    expensesWaiting: can(ctx.role, "expenses.approve") ? Number(waiting.rows[0]!.count) : null,
    tomorrow: {
      date: tomorrow,
      events: events.rows.map((e) => ({ title: e.title, functions: e.functions ?? [], team: e.team })),
      tasksDue: Number(dueTomorrow.rows[0]!.count),
      off,
    },
  };
}
