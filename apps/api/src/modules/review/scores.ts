import { can, overallScore, SCORE_KEYS, type Role, type ScoreKey } from "@wedding-yantra/core";
import type { PersonScore, TeamScores } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import type { MemberContext } from "../auth/guard.js";

type Counts = Map<string, { done: number; total: number }>;

async function counts(db: Queryable, sql: string, params: unknown[]): Promise<Counts> {
  const { rows } = await db.query<{ user_id: string; done: number; total: number }>(sql, params);
  return new Map(rows.map((r) => [r.user_id, { done: Number(r.done), total: Number(r.total) }]));
}

/** Tasks of events that were called off don't count for or against anyone. */
const ACTIVE_EVENT = "(t.event_id IS NULL OR (e.status <> 'cancelled' AND e.deleted_at IS NULL))";

/**
 * Each person's month, measured from their own work: tasks done by their day, follow-ups
 * kept, enquiries booked and expenses added in time. Owners and managers see everyone and
 * the business as a whole; everyone else sees only themselves.
 */
export async function teamScores(db: Queryable, ctx: MemberContext, month: string): Promise<TeamScores> {
  const all = can(ctx.role, "team.review");
  // The month and today, counted in the business's time zone.
  const { rows } = await db.query<{ start: string; end: string; today: string; tz: string }>(
    `SELECT to_date($2, 'YYYY-MM')::text AS start, (to_date($2, 'YYYY-MM') + interval '1 month')::date::text AS end,
            (now() AT TIME ZONE timezone)::date::text AS today, timezone AS tz
       FROM workspaces WHERE id = $1`,
    [ctx.workspaceId, month],
  );
  const { start, end, today, tz } = rows[0]!;

  const members = await db.query<{ user_id: string; name: string | null; role: Role }>(
    `SELECT m.user_id, u.name, m.role
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL ${all ? "" : "AND m.user_id = $2"}
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'staff' THEN 2 WHEN 'freelancer' THEN 3 ELSE 4 END, u.name`,
    all ? [ctx.workspaceId] : [ctx.workspaceId, ctx.userId],
  );

  // Tasks whose day has passed this month, and whether they were ticked off by then.
  const tasks = await counts(
    db,
    `SELECT t.assignee_id AS user_id, count(*) AS total,
            count(*) FILTER (WHERE t.status = 'done' AND (t.done_at AT TIME ZONE $5)::date <= t.due_date) AS done
       FROM tasks t LEFT JOIN events e ON e.id = t.event_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.assignee_id IS NOT NULL
        AND t.due_date >= $2::date AND t.due_date < $3::date AND t.due_date < $4::date AND ${ACTIVE_EVENT}
      GROUP BY t.assignee_id`,
    [ctx.workspaceId, start, end, today, tz],
  );

  // Follow-ups that came due this month (not moved or closed before then), and whether the
  // lead heard from the business by the end of that day.
  const followUps = await counts(
    db,
    `WITH fu AS (
       SELECT la.lead_id, la.created_at AS set_at, (la.meta ->> 'at')::timestamptz AS due_at,
              ((la.meta ->> 'at')::timestamptz AT TIME ZONE $5)::date AS due_day
         FROM lead_activities la
        WHERE la.workspace_id = $1 AND la.kind = 'follow_up_set' AND la.meta ->> 'at' IS NOT NULL
     )
     SELECT l.assigned_to AS user_id, count(*) AS total,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM lead_activities c
               WHERE c.lead_id = fu.lead_id AND c.kind IN ('call', 'whatsapp', 'note', 'stage_changed')
                 AND c.created_at >= fu.set_at AND (c.created_at AT TIME ZONE $5)::date <= fu.due_day)) AS done
       FROM fu JOIN leads l ON l.id = fu.lead_id AND l.deleted_at IS NULL AND l.assigned_to IS NOT NULL
      WHERE fu.due_day >= $2::date AND fu.due_day < $3::date AND fu.due_day < $4::date
        AND NOT EXISTS (SELECT 1 FROM lead_activities r
                         WHERE r.lead_id = fu.lead_id AND r.kind = 'follow_up_set' AND r.created_at > fu.set_at AND r.created_at < fu.due_at)
        AND NOT EXISTS (SELECT 1 FROM lead_activities s
                         WHERE s.lead_id = fu.lead_id AND s.kind = 'stage_changed' AND s.meta ->> 'kind' IN ('won', 'lost')
                           AND s.created_at > fu.set_at AND s.created_at < fu.due_at)
      GROUP BY l.assigned_to`,
    [ctx.workspaceId, start, end, today, tz],
  );

  // Enquiries closed this month: booked or lost.
  const leads = await counts(
    db,
    `SELECT l.assigned_to AS user_id, count(*) AS total, count(*) FILTER (WHERE ps.kind = 'won') AS done
       FROM leads l JOIN pipeline_stages ps ON ps.id = l.stage_id
      WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND l.assigned_to IS NOT NULL AND ps.kind IN ('won', 'lost')
        AND (l.stage_changed_at AT TIME ZONE $4)::date >= $2::date AND (l.stage_changed_at AT TIME ZONE $4)::date < $3::date
      GROUP BY l.assigned_to`,
    [ctx.workspaceId, start, end, tz],
  );

  // Money spent this month, and whether it was added by the next day.
  const expenses = await counts(
    db,
    `SELECT submitted_by AS user_id, count(*) AS total,
            count(*) FILTER (WHERE (created_at AT TIME ZONE $4)::date <= spent_on + 1) AS done
       FROM expenses
      WHERE workspace_id = $1 AND deleted_at IS NULL AND submitted_by IS NOT NULL AND spent_on >= $2::date AND spent_on < $3::date
      GROUP BY submitted_by`,
    [ctx.workspaceId, start, end, tz],
  );

  const late = await db.query<{ user_id: string; late: number }>(
    `SELECT t.assignee_id AS user_id, count(*) AS late
       FROM tasks t LEFT JOIN events e ON e.id = t.event_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.status = 'open' AND t.assignee_id IS NOT NULL
        AND t.due_date < $2::date AND ${ACTIVE_EVENT}
      GROUP BY t.assignee_id`,
    [ctx.workspaceId, today],
  );
  const lateNow = new Map(late.rows.map((r) => [r.user_id, Number(r.late)]));

  const sources: Record<ScoreKey, Counts> = {
    tasks_on_time: tasks,
    follow_ups_on_time: followUps,
    leads_booked: leads,
    expenses_on_time: expenses,
  };
  const people: PersonScore[] = members.rows.map((m) => {
    const measures = SCORE_KEYS.flatMap((key) => {
      const c = sources[key].get(m.user_id);
      return c && c.total > 0 ? [{ key, done: c.done, total: c.total }] : [];
    });
    return {
      user: { id: m.user_id, name: m.name },
      role: m.role,
      score: overallScore(measures),
      measures,
      lateNow: lateNow.get(m.user_id) ?? 0,
    };
  });

  return { month, people, business: all ? await businessScores(db, ctx.workspaceId, { start, end, today, tz }) : null };
}

/** For events that began this month: money in before the day, and whether every step was on time. */
async function businessScores(
  db: Queryable,
  workspaceId: string,
  m: { start: string; end: string; today: string; tz: string },
): Promise<NonNullable<TeamScores["business"]>> {
  const { rows } = await db.query<{ due: string; collected: string; done: number; total: number }>(
    `WITH ev AS (
       SELECT e.id, e.value, min(f.date) AS first_day
         FROM events e JOIN event_functions f ON f.event_id = e.id
        WHERE e.workspace_id = $1 AND e.deleted_at IS NULL AND e.status <> 'cancelled'
        GROUP BY e.id
       HAVING min(f.date) >= $2::date AND min(f.date) < $3::date AND min(f.date) <= $4::date
     ),
     money AS (
       SELECT coalesce(sum(due), 0) AS due, coalesce(sum(least(collected, due)), 0) AS collected
         FROM (SELECT coalesce((SELECT sum(b.total) FROM bills b WHERE b.event_id = ev.id AND b.status = 'issued'), ev.value, 0) AS due,
                      coalesce((SELECT sum(p.amount) FROM payments p
                                 WHERE p.event_id = ev.id AND p.deleted_at IS NULL AND p.paid_on < ev.first_day), 0) AS collected
                 FROM ev) x
     ),
     steps AS (
       SELECT count(*) FILTER (WHERE late = 0) AS done, count(*) AS total
         FROM (SELECT ev.id,
                      count(*) FILTER (WHERE NOT (t.status = 'done' AND (t.done_at AT TIME ZONE $5)::date <= t.due_date)) AS late
                 FROM ev JOIN tasks t ON t.event_id = ev.id AND t.deleted_at IS NULL AND t.due_date < $4::date
                GROUP BY ev.id) y
     )
     SELECT money.due, money.collected, steps.done, steps.total FROM money, steps`,
    [workspaceId, m.start, m.end, m.today, m.tz],
  );
  const r = rows[0]!;
  return {
    moneyBeforeEvents: { collected: Number(r.collected), due: Number(r.due) },
    eventsOnTime: { done: Number(r.done), total: Number(r.total) },
  };
}
