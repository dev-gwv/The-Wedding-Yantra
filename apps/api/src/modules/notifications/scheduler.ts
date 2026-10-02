import { eveningDigestText, morningDigestText, taskAlertText, taskReminderText, teamScope, type ReminderState } from "@wedding-yantra/core";
import type { Queryable } from "../../db.js";
import { loadAccess } from "../auth/access.js";
import { awardStreaks } from "../review/points.js";
import { enquiryLine, salesAlert } from "../sales/alerts.js";
import { makeDueRepeats } from "../tasks/repeats.js";
import { notify } from "./service.js";

/**
 * Alerts nobody clicks for: they come from the clock. Runs every minute on the API server
 * (see index.ts), so there is nothing else to deploy. Each business's jobs run in its own
 * time zone, once a day each: `job_runs` records the run, and scheduled alerts carry a key
 * so a restart never sends one twice.
 */

/** Local times each job runs, and the latest it may still run after a restart. */
export const SCHEDULE = {
  /** Streak points for the seven days up to yesterday */
  streak: { from: "00:10", until: "06:00" },
  morning: { from: "08:00", until: "11:00" },
  /** Reminders for every open task until it's done: a morning round and an afternoon round */
  remindAm: { from: "08:05", until: "12:00" },
  remindPm: { from: "16:00", until: "19:00" },
  evening: { from: "19:00", until: "22:00" },
} as const;
type Job = keyof typeof SCHEDULE;

const OPEN = "t.status IN ('open', 'doing', 'waiting')";
const LIVE_EVENT = "(t.event_id IS NULL OR EXISTS (SELECT 1 FROM events e WHERE e.id = t.event_id AND e.status <> 'cancelled' AND e.deleted_at IS NULL))";

export interface ScheduleResult {
  dueSoon: number;
  /** "Follow-up due" alerts sent for leads */
  followUps: number;
  morning: number;
  /** Task reminders sent (due tomorrow, due today, late, long open) */
  reminders: number;
  evening: number;
  /** Streak points paid */
  streak: number;
}

export async function runSchedule(db: Queryable, now: Date = new Date()): Promise<ScheduleResult> {
  const result: ScheduleResult = { dueSoon: await dueSoon(db, now), followUps: await followUps(db, now), morning: 0, reminders: 0, evening: 0, streak: 0 };
  const { rows } = await db.query<{ id: string; clock: string; today: string }>(
    `SELECT id, to_char($1::timestamptz AT TIME ZONE timezone, 'HH24:MI') AS clock, ($1::timestamptz AT TIME ZONE timezone)::date::text AS today
       FROM workspaces WHERE deleted_at IS NULL`,
    [now],
  );
  for (const ws of rows) {
    for (const job of Object.keys(SCHEDULE) as Job[]) {
      const { from, until } = SCHEDULE[job];
      if (ws.clock < from || ws.clock >= until) continue;
      if (!(await claim(db, job, ws.id, ws.today))) continue;
      if (job === "morning") result.morning += await morning(db, ws.id, ws.today);
      else if (job === "remindAm" || job === "remindPm") result.reminders += await reminders(db, ws.id, ws.today, job === "remindAm" ? "am" : "pm");
      else if (job === "streak") result.streak += await awardStreaks(db, ws.id, ws.today, now);
      else result.evening += await evening(db, ws.id, ws.today);
    }
  }
  return result;
}

/** Takes today's run of a job for a business; false if it already ran. */
async function claim(db: Queryable, job: Job, workspaceId: string, today: string): Promise<boolean> {
  const { rowCount } = await db.query(`INSERT INTO job_runs (job, workspace_id, run_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
    job,
    workspaceId,
    today,
  ]);
  return (rowCount ?? 0) > 0;
}

/** An hour before a task's time, to whoever it's for. */
async function dueSoon(db: Queryable, now: Date): Promise<number> {
  const { rows } = await db.query<{ id: string; workspace_id: string; assignee_id: string; title: string; due_date: string; due_time: string }>(
    `SELECT t.id, t.workspace_id, t.assignee_id, t.title, t.due_date::text AS due_date, to_char(t.due_time, 'HH24:MI') AS due_time
       FROM tasks t JOIN workspaces w ON w.id = t.workspace_id AND w.deleted_at IS NULL
      WHERE t.deleted_at IS NULL AND ${OPEN} AND t.assignee_id IS NOT NULL AND t.due_date IS NOT NULL AND t.due_time IS NOT NULL
        AND ((t.due_date + t.due_time) AT TIME ZONE w.timezone) > $1::timestamptz
        AND ((t.due_date + t.due_time) AT TIME ZONE w.timezone) <= $1::timestamptz + interval '60 minutes'
        AND ${LIVE_EVENT}`,
    [now],
  );
  return notify(
    db,
    rows.map((t) => ({
      workspaceId: t.workspace_id,
      userId: t.assignee_id,
      kind: "task.due_soon" as const,
      ...taskAlertText("task.due_soon", { title: t.title, dueTime: t.due_time }),
      link: `/app/tasks?open=${t.id}`,
      entityType: "task",
      entityId: t.id,
      dedupeKey: `due:${t.id}:${t.due_date} ${t.due_time}`,
    })),
  );
}

/**
 * When a lead's follow-up time arrives, to whoever has the lead (the owner if nobody does).
 * Open leads only. `follow_up_alerted_for` remembers which follow-up time was alerted, so
 * each one goes out once, and moving the follow-up alerts again at the new time.
 */
async function followUps(db: Queryable, now: Date): Promise<number> {
  const { rows } = await db.query<{ id: string; workspace_id: string; name: string; assigned_to: string | null; at: Date; event_type: string | null; city: string | null }>(
    `SELECT l.id, l.workspace_id, l.name, l.assigned_to, l.next_follow_up_at AS at, l.event_type, l.city
       FROM leads l
       JOIN pipeline_stages s ON s.id = l.stage_id AND s.kind = 'open'
       JOIN workspaces w ON w.id = l.workspace_id AND w.deleted_at IS NULL
      WHERE l.deleted_at IS NULL AND l.next_follow_up_at <= $1
        AND l.follow_up_alerted_for IS DISTINCT FROM l.next_follow_up_at
      ORDER BY l.next_follow_up_at LIMIT 500`,
    [now],
  );
  let sent = 0;
  for (const l of rows) {
    sent += await salesAlert(db, {
      workspaceId: l.workspace_id,
      kind: "lead.follow_up",
      to: [l.assigned_to],
      facts: { name: l.name, detail: enquiryLine({ eventType: l.event_type, city: l.city }) || null },
      link: `/app/leads/${l.id}`,
      entityType: "lead",
      entityId: l.id,
      dedupeKey: `follow_up:${l.id}:${l.at.toISOString()}`,
    });
  }
  // Marks the time that was alerted, not whatever it is now: a follow-up moved meanwhile still alerts.
  if (rows.length) {
    await db.query(
      `UPDATE leads l SET follow_up_alerted_for = v.at FROM unnest($1::uuid[], $2::timestamptz[]) AS v(id, at) WHERE l.id = v.id`,
      [rows.map((l) => l.id), rows.map((l) => l.at)],
    );
  }
  return sent;
}

/** "Your day" for everyone who works tasks and has something on, unless they're off today. */
async function morning(db: Queryable, workspaceId: string, today: string): Promise<number> {
  // Today's copies of repeating tasks, so they're counted.
  await makeDueRepeats(db, workspaceId);
  const { rows } = await db.query<{ user_id: string; late: number; due_today: number; to_check: number; top: string | null }>(
    `SELECT m.user_id,
            count(*) FILTER (WHERE t.assignee_id = m.user_id AND ${OPEN} AND t.due_date < $2)::int AS late,
            count(*) FILTER (WHERE t.assignee_id = m.user_id AND ${OPEN} AND t.due_date = $2)::int AS due_today,
            count(*) FILTER (WHERE t.created_by = m.user_id AND t.status = 'review' AND t.assignee_id IS DISTINCT FROM m.user_id)::int AS to_check,
            (SELECT t2.title FROM tasks t2
              WHERE t2.workspace_id = $1 AND t2.assignee_id = m.user_id AND t2.deleted_at IS NULL
                AND t2.status IN ('open', 'doing', 'waiting') AND t2.due_date <= $2
              ORDER BY t2.due_date, CASE t2.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t2.due_time NULLS LAST
              LIMIT 1) AS top
       FROM memberships m
       LEFT JOIN tasks t ON t.workspace_id = m.workspace_id AND t.deleted_at IS NULL AND (t.assignee_id = m.user_id OR t.created_by = m.user_id) AND ${LIVE_EVENT}
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL AND m.role <> 'accountant'
        AND NOT EXISTS (SELECT 1 FROM time_off o WHERE o.workspace_id = $1 AND o.user_id = m.user_id AND o.deleted_at IS NULL AND $2 BETWEEN o.start_date AND o.end_date)
      GROUP BY m.user_id`,
    [workspaceId, today],
  );
  const events = await db.query<{ user_id: string; title: string; call_time: string | null }>(
    `SELECT DISTINCT ON (et.user_id, e.id) et.user_id, e.title, to_char(et.call_time, 'HH24:MI') AS call_time
       FROM event_team et
       JOIN events e ON e.id = et.event_id AND e.deleted_at IS NULL AND e.status = 'confirmed'
       JOIN event_functions f ON f.event_id = e.id AND f.date = $2
      WHERE et.workspace_id = $1`,
    [workspaceId, today],
  );
  const eventsBy = new Map<string, { title: string; callTime: string | null }[]>();
  for (const e of events.rows) eventsBy.set(e.user_id, [...(eventsBy.get(e.user_id) ?? []), { title: e.title, callTime: e.call_time }]);

  const items = rows.flatMap((r) => {
    const text = morningDigestText({ late: r.late, dueToday: r.due_today, toCheck: r.to_check, events: eventsBy.get(r.user_id) ?? [], top: r.top });
    if (!text) return [];
    return [{ workspaceId, userId: r.user_id, kind: "digest.morning" as const, ...text, link: "/app/my-day", dedupeKey: `morning:${workspaceId}:${today}` }];
  });
  return notify(db, items);
}

/** At most this many reminders per person per round, most urgent first: the rest are on My day. */
const REMINDERS_PER_ROUND = 5;
/** A task with no date is mentioned again every this many days while it's open. */
const NO_DATE_EVERY = 3;

const STATE_RANK: Record<ReminderState, number> = { late: 0, due_today: 1, due_tomorrow: 2, pending: 3 };

/**
 * Reminders until it's done, to whoever the task is for (the owner too, for their own):
 * due tomorrow (morning), due today (morning and afternoon), late (morning and afternoon,
 * every day, with how many days), and no date (every few days). Not on a day off.
 */
async function reminders(db: Queryable, workspaceId: string, today: string, slot: "am" | "pm"): Promise<number> {
  const { rows } = await db.query<{
    id: string;
    assignee_id: string;
    title: string;
    due_date: string | null;
    days_late: number | null;
    age: number;
    status: string;
    waiting_reason: string | null;
    priority: string;
  }>(
    `SELECT t.id, t.assignee_id, t.title, t.due_date::text AS due_date, ($2::date - t.due_date) AS days_late,
            ($2::date - (t.created_at AT TIME ZONE w.timezone)::date) AS age, t.status, t.waiting_reason, t.priority
       FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND ${OPEN} AND t.assignee_id IS NOT NULL AND ${LIVE_EVENT}
        AND (t.due_date IS NULL OR t.due_date <= $2::date + 1)
        AND EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = $1 AND m.user_id = t.assignee_id AND m.removed_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM time_off o WHERE o.workspace_id = $1 AND o.user_id = t.assignee_id AND o.deleted_at IS NULL
                         AND $2::date BETWEEN o.start_date AND o.end_date)`,
    [workspaceId, today],
  );
  const due = rows.flatMap((t) => {
    let state: ReminderState;
    if (t.due_date === null) {
      if (slot !== "am" || t.age < NO_DATE_EVERY || t.age % NO_DATE_EVERY !== 0) return [];
      state = "pending";
    } else if (t.days_late! > 0) state = "late";
    else if (t.days_late === 0) state = "due_today";
    else if (slot === "am") state = "due_tomorrow";
    else return [];
    return [{ t, state }];
  });
  const rank = (p: string) => (p === "urgent" ? 0 : p === "high" ? 1 : p === "normal" ? 2 : 3);
  due.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (b.t.days_late ?? 0) - (a.t.days_late ?? 0) || rank(a.t.priority) - rank(b.t.priority));
  const perPerson = new Map<string, number>();
  const items = due.flatMap(({ t, state }) => {
    const n = perPerson.get(t.assignee_id) ?? 0;
    if (n >= REMINDERS_PER_ROUND) return [];
    perPerson.set(t.assignee_id, n + 1);
    return [
      {
        workspaceId,
        userId: t.assignee_id,
        kind: state === "late" ? ("task.overdue" as const) : ("task.reminder" as const),
        ...taskReminderText({ title: t.title, state, slot, daysLate: t.days_late ?? undefined, ageDays: t.age, stuckReason: t.status === "waiting" ? t.waiting_reason : null }),
        link: `/app/tasks?open=${t.id}`,
        entityType: "task",
        entityId: t.id,
        dedupeKey: `remind:${t.id}:${today}:${slot}`,
      },
    ];
  });
  return notify(db, items);
}

/**
 * The team's day for the owner and managers who run everyone's work: done, late by person,
 * stuck, waiting for a check. A manager limited to a department doesn't get the whole team's.
 */
async function evening(db: Queryable, workspaceId: string, today: string): Promise<number> {
  const access = await loadAccess(db, workspaceId);
  const bosses = [...access].filter(([, a]) => teamScope(a) === "all").map(([userId]) => userId);
  if (!bosses.length) return 0;
  const { rows } = await db.query<{ done_today: number; stuck: number; to_check: number; due_tomorrow: number }>(
    `SELECT count(*) FILTER (WHERE t.status = 'done' AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE w.timezone)::date = $2)::int AS done_today,
            count(*) FILTER (WHERE t.status = 'waiting')::int AS stuck,
            count(*) FILTER (WHERE t.status = 'review')::int AS to_check,
            count(*) FILTER (WHERE ${OPEN} AND t.due_date = $2::date + 1)::int AS due_tomorrow
       FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND ${LIVE_EVENT}`,
    [workspaceId, today],
  );
  const late = await db.query<{ name: string | null; count: number }>(
    `SELECT u.name, count(*)::int AS count FROM tasks t JOIN users u ON u.id = t.assignee_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND ${OPEN} AND t.due_date < $2 AND ${LIVE_EVENT}
      GROUP BY u.id, u.name ORDER BY count(*) DESC, u.name`,
    [workspaceId, today],
  );
  const r = rows[0]!;
  const text = eveningDigestText({ doneToday: r.done_today, lateBy: late.rows, stuck: r.stuck, toCheck: r.to_check, dueTomorrow: r.due_tomorrow });
  if (!text) return 0;
  return notify(
    db,
    bosses.map((userId) => ({
      workspaceId,
      userId,
      kind: "digest.evening" as const,
      ...text,
      link: "/app/tasks/team",
      dedupeKey: `evening:${workspaceId}:${today}`,
    })),
  );
}
