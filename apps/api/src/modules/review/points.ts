import { randomUUID } from "node:crypto";
import {
  awardsFor,
  bandFor,
  can,
  coachingLine,
  DEFAULT_BANDS,
  POINT_RULE_INFO,
  POINT_RULE_KEYS,
  rankPeople,
  resolveRules,
  type PointEvent,
  type PointRuleKey,
  type PointRuleOverrides,
  type PointRules,
  type Role,
  type ScoreBand,
  type TaskPriorityLevel,
} from "@wedding-yantra/core";
import type { Leaderboard, LeaderboardRow, Ledger, PointSettings, SavePointSettingsInput } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { notify } from "../notifications/service.js";

/**
 * Points for finishing work well. Paid from task changes as they happen (inside the same
 * save), once per thing: the ledger's unique key means finishing a task again after it
 * was reopened earns nothing more. Only tasks someone else gave count, so nobody earns by
 * giving themselves work.
 */

async function settings(db: Queryable, workspaceId: string): Promise<{ rules: PointRules; penaltiesOn: boolean; bands: ScoreBand[] }> {
  const { rows } = await db.query<{ point_rules: PointRuleOverrides; penalties_enabled: boolean; score_bands: ScoreBand[] | null }>(
    `SELECT point_rules, penalties_enabled, score_bands FROM workspaces WHERE id = $1`,
    [workspaceId],
  );
  const r = rows[0]!;
  return { rules: resolveRules(r.point_rules), penaltiesOn: r.penalties_enabled, bands: r.score_bands?.length ? r.score_bands : DEFAULT_BANDS };
}

async function pay(
  db: Queryable,
  entry: {
    workspaceId: string;
    userId: string;
    awards: { rule: PointRuleKey; points: number }[];
    sourceKind: "task" | "submission" | "move" | "streak" | "recognition";
    sourceId: string;
    taskId?: string | null;
    note?: string | null;
    by?: string | null;
    at?: Date;
  },
): Promise<number> {
  let total = 0;
  for (const a of entry.awards) {
    const { rowCount } = await db.query(
      `INSERT INTO points_ledger (workspace_id, user_id, rule_key, points, source_kind, source_id, task_id, note, awarded_by, at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, now()))
       ON CONFLICT (workspace_id, source_kind, source_id, rule_key, user_id) DO NOTHING`,
      [entry.workspaceId, entry.userId, a.rule, a.points, entry.sourceKind, entry.sourceId, entry.taskId ?? null, entry.note ?? null, entry.by ?? null, entry.at ?? null],
    );
    if (rowCount) total += a.points;
  }
  return total;
}

export interface PointTask {
  id: string;
  assignee_id: string | null;
  created_by: string | null;
  priority: TaskPriorityLevel;
  needs_check: boolean;
  revisions: number;
}

/** Whether a task earns points: it's for someone, and someone else gave it. */
const earns = (t: PointTask): t is PointTask & { assignee_id: string } => t.assignee_id !== null && t.assignee_id !== t.created_by;

/** A task finished: ticked done, or approved. */
export async function awardFinished(db: Queryable, ctx: MemberContext, task: PointTask, late: boolean): Promise<number> {
  if (!earns(task)) return 0;
  const s = await settings(db, ctx.workspaceId);
  const event: PointEvent = { kind: "finished", priority: task.priority, late, checked: task.needs_check, revisions: task.revisions };
  return pay(db, { workspaceId: ctx.workspaceId, userId: task.assignee_id, awards: awardsFor(event, s.rules, s.penaltiesOn), sourceKind: "task", sourceId: task.id, taskId: task.id, by: ctx.userId });
}

/** Handed-in work sent back (a penalty, when penalties are on). */
export async function awardSentBack(db: Queryable, ctx: MemberContext, task: PointTask, submissionId: string): Promise<number> {
  if (!earns(task)) return 0;
  const s = await settings(db, ctx.workspaceId);
  return pay(db, {
    workspaceId: ctx.workspaceId,
    userId: task.assignee_id,
    awards: awardsFor({ kind: "sent_back" }, s.rules, s.penaltiesOn),
    sourceKind: "submission",
    sourceId: submissionId,
    taskId: task.id,
    by: ctx.userId,
  });
}

/** Someone moved their own task's date later (a penalty, when penalties are on). */
export async function awardMoved(db: Queryable, ctx: MemberContext, task: PointTask): Promise<number> {
  if (!earns(task) || task.assignee_id !== ctx.userId) return 0;
  const s = await settings(db, ctx.workspaceId);
  return pay(db, {
    workspaceId: ctx.workspaceId,
    userId: task.assignee_id,
    awards: awardsFor({ kind: "deadline_moved" }, s.rules, s.penaltiesOn),
    sourceKind: "move",
    sourceId: randomUUID(),
    taskId: task.id,
    by: ctx.userId,
  });
}

/**
 * The streak: someone who finished a task on each of the last seven days. Run once a day
 * by the scheduler; paid at most once a week per person.
 */
export async function awardStreaks(db: Queryable, workspaceId: string, today: string, now: Date): Promise<number> {
  const s = await settings(db, workspaceId);
  if (!s.rules.streak_7.enabled || s.rules.streak_7.points === 0) return 0;
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT t.assignee_id AS user_id
       FROM tasks t JOIN workspaces w ON w.id = t.workspace_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.status = 'done' AND t.assignee_id IS NOT NULL
        AND t.created_by IS DISTINCT FROM t.assignee_id
        AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE w.timezone)::date BETWEEN $2::date - 7 AND $2::date - 1
      GROUP BY t.assignee_id
     HAVING count(DISTINCT (coalesce(t.completed_at, t.done_at) AT TIME ZONE w.timezone)::date) = 7
        AND NOT EXISTS (SELECT 1 FROM points_ledger p WHERE p.workspace_id = $1 AND p.user_id = t.assignee_id
                          AND p.rule_key = 'streak_7' AND p.at > $3::timestamptz - interval '7 days')`,
    [workspaceId, today, now],
  );
  let paid = 0;
  for (const r of rows) {
    paid += await pay(db, {
      workspaceId,
      userId: r.user_id,
      awards: [{ rule: "streak_7", points: s.rules.streak_7.points }],
      sourceKind: "streak",
      sourceId: randomUUID(),
      note: `7 days in a row, to ${today}`,
      at: now,
    });
  }
  return paid;
}

/** An owner or manager recognises someone's work: points, and an alert saying why. */
export async function recognise(db: Queryable, ctx: MemberContext, input: { userId: string; note: string }): Promise<number> {
  if (!can(ctx.role, "team.review")) throw forbidden("Only the owner or a manager can recognise work");
  if (input.userId === ctx.userId) throw new AppError(400, "VALIDATION_ERROR", "Recognise someone else's work", { userId: "Choose someone else" });
  const member = await db.query<{ name: string | null }>(
    `SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.removed_at IS NULL`,
    [ctx.workspaceId, input.userId],
  );
  if (!member.rows[0]) throw notFound("This team member");
  const s = await settings(db, ctx.workspaceId);
  const rule = s.rules.recognition;
  if (!rule.enabled || rule.points === 0) throw new AppError(409, "RECOGNITION_OFF", "Recognition points are switched off in Points settings");
  await pay(db, {
    workspaceId: ctx.workspaceId,
    userId: input.userId,
    awards: [{ rule: "recognition", points: rule.points }],
    sourceKind: "recognition",
    sourceId: randomUUID(),
    note: input.note,
    by: ctx.userId,
  });
  const me = await db.query<{ name: string | null }>(`SELECT name FROM users WHERE id = $1`, [ctx.userId]);
  const who = me.rows[0]?.name?.split(/\s+/)[0] ?? "Someone";
  await notify(db, [
    {
      workspaceId: ctx.workspaceId,
      userId: input.userId,
      kind: "points.recognised",
      title: `${who} recognised your work: +${rule.points} points`,
      body: input.note,
      link: "/app/scores",
      actorId: ctx.userId,
    },
  ]);
  return rule.points;
}

// ---------------------------------------------------------------------------
// The month's board, one person's ledger, and the rules
// ---------------------------------------------------------------------------

async function monthBounds(db: Queryable, workspaceId: string, month: string) {
  const { rows } = await db.query<{ start: string; end: string; today: string; tz: string }>(
    `SELECT to_date($2, 'YYYY-MM')::text AS start, (to_date($2, 'YYYY-MM') + interval '1 month')::date::text AS end,
            (now() AT TIME ZONE timezone)::date::text AS today, timezone AS tz
       FROM workspaces WHERE id = $1`,
    [workspaceId, month],
  );
  return rows[0]!;
}

/** Everyone's points this month, ranked. Everyone sees the board; details of others are for owners and managers. */
export async function leaderboard(db: Queryable, ctx: MemberContext, month: string): Promise<Leaderboard> {
  const { start, end, today, tz } = await monthBounds(db, ctx.workspaceId, month);
  const all = can(ctx.role, "team.review");
  const s = await settings(db, ctx.workspaceId);
  const { rows } = await db.query<{
    user_id: string;
    name: string | null;
    role: Role;
    points: number;
    done: number;
    dated: number;
    on_time: number;
    late_now: number;
  }>(
    `SELECT m.user_id, u.name, m.role,
            coalesce((SELECT sum(p.points) FROM points_ledger p
                       WHERE p.workspace_id = $1 AND p.user_id = m.user_id
                         AND (p.at AT TIME ZONE $5)::date >= $2::date AND (p.at AT TIME ZONE $5)::date < $3::date), 0)::int AS points,
            count(t.id) FILTER (WHERE t.status = 'done' AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date >= $2::date
                                  AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date < $3::date)::int AS done,
            count(t.id) FILTER (WHERE t.status = 'done' AND t.due_date IS NOT NULL
                                  AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date >= $2::date
                                  AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date < $3::date)::int AS dated,
            count(t.id) FILTER (WHERE t.status = 'done' AND t.due_date IS NOT NULL
                                  AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date >= $2::date
                                  AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date < $3::date
                                  AND (coalesce(t.completed_at, t.done_at) AT TIME ZONE $5)::date <= t.due_date)::int AS on_time,
            count(t.id) FILTER (WHERE t.status IN ('open', 'doing', 'waiting') AND t.due_date < $4::date)::int AS late_now
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN tasks t ON t.workspace_id = m.workspace_id AND t.assignee_id = m.user_id AND t.deleted_at IS NULL
                        AND t.created_by IS DISTINCT FROM m.user_id
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL AND m.role <> 'accountant'
      GROUP BY m.user_id, u.name, m.role`,
    [ctx.workspaceId, start, end, today, tz],
  );
  const ranked = rankPeople(
    rows.map((r) => ({
      id: r.user_id,
      points: r.points,
      tasksDone: r.done,
      onTime: r.dated > 0 ? Math.round((100 * r.on_time) / r.dated) : null,
      row: r,
    })),
  );
  const out: LeaderboardRow[] = ranked.map((p) => {
    const mine = p.id === ctx.userId;
    return {
      user: { id: p.id, name: p.row.name },
      role: p.row.role,
      points: p.points,
      rank: p.rank,
      notRanked: p.notRanked,
      band: bandFor(p.points, s.bands).band.name,
      tasksDone: p.tasksDone,
      // How someone else is doing in detail is for owners and managers.
      onTime: all || mine ? p.onTime : null,
      lateNow: all || mine ? p.row.late_now : 0,
    };
  });
  const meRow = out.find((r) => r.user.id === ctx.userId) ?? null;
  let me: Leaderboard["me"] = null;
  if (meRow) {
    const b = bandFor(meRow.points, s.bands);
    const onTimeTaskPoints = (s.rules.done_normal.enabled ? s.rules.done_normal.points : 0) + (s.rules.on_time.enabled ? s.rules.on_time.points : 0);
    me = {
      ...meRow,
      nextBand: b.next?.name ?? null,
      gap: b.gap,
      coaching: coachingLine({
        lateNow: meRow.lateNow,
        onTime: meRow.onTime,
        gap: b.gap,
        nextBand: b.next?.name ?? null,
        rank: meRow.rank,
        ranked: out.filter((r) => r.rank !== null).length,
        onTimeTaskPoints,
      }),
    };
  }
  return { month, rows: out, me, penaltiesOn: s.penaltiesOn, bands: s.bands };
}

/** How someone's points this month were earned. Your own, or anyone's for owners and managers. */
export async function ledger(db: Queryable, ctx: MemberContext, q: { userId?: string; month: string }): Promise<Ledger> {
  const userId = q.userId ?? ctx.userId;
  if (userId !== ctx.userId && !can(ctx.role, "team.review")) throw forbidden("You can see only your own points");
  const person = await db.query<{ name: string | null }>(
    `SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND m.user_id = $2`,
    [ctx.workspaceId, userId],
  );
  if (!person.rows[0]) throw notFound("This team member");
  const { start, end, tz } = await monthBounds(db, ctx.workspaceId, q.month);
  const { rows } = await db.query<{
    id: string;
    rule_key: PointRuleKey;
    points: number;
    note: string | null;
    task_id: string | null;
    task_title: string | null;
    by_id: string | null;
    by_name: string | null;
    at: Date;
  }>(
    `SELECT p.id, p.rule_key, p.points, p.note, p.task_id, t.title AS task_title, p.awarded_by AS by_id, u.name AS by_name, p.at
       FROM points_ledger p
       LEFT JOIN tasks t ON t.id = p.task_id
       LEFT JOIN users u ON u.id = p.awarded_by
      WHERE p.workspace_id = $1 AND p.user_id = $2
        AND (p.at AT TIME ZONE $5)::date >= $3::date AND (p.at AT TIME ZONE $5)::date < $4::date
      ORDER BY p.at DESC, p.points DESC LIMIT 300`,
    [ctx.workspaceId, userId, start, end, tz],
  );
  return {
    user: { id: userId, name: person.rows[0].name },
    month: q.month,
    total: rows.reduce((a, r) => a + r.points, 0),
    entries: rows.map((r) => ({
      id: r.id,
      rule: r.rule_key,
      label: POINT_RULE_INFO[r.rule_key]?.label ?? r.rule_key,
      points: r.points,
      note: r.note,
      task: r.task_id ? { id: r.task_id, title: r.task_title ?? "A task" } : null,
      by: r.by_id && r.by_id !== userId ? { id: r.by_id, name: r.by_name } : null,
      at: r.at.toISOString(),
    })),
  };
}

/** The rules, as everyone can read them: how points are earned should be no secret. */
export async function getPointSettings(db: Queryable, ctx: MemberContext): Promise<PointSettings> {
  const s = await settings(db, ctx.workspaceId);
  return {
    rules: POINT_RULE_KEYS.map((key) => ({
      key,
      label: POINT_RULE_INFO[key].label,
      points: s.rules[key].points,
      enabled: s.rules[key].enabled,
      penalty: POINT_RULE_INFO[key].penalty,
      defaultPoints: POINT_RULE_INFO[key].points,
    })),
    penaltiesOn: s.penaltiesOn,
    bands: [...s.bands].sort((a, b) => b.min - a.min),
  };
}

/** The owner changes the rules. Changes count from now on; points already paid stay. */
export async function savePointSettings(db: Queryable, ctx: MemberContext, input: SavePointSettingsInput): Promise<PointSettings> {
  if (!can(ctx.role, "workspace.update")) throw forbidden("Only the owner can change how points work");
  const overrides: PointRuleOverrides = {};
  for (const r of input.rules) {
    const info = POINT_RULE_INFO[r.key];
    // A penalty stays a penalty and a reward stays a reward.
    if (info.penalty ? r.points > 0 : r.points < 0) {
      throw new AppError(400, "VALIDATION_ERROR", info.penalty ? "A penalty takes points away (0 or less)" : "A reward adds points (0 or more)", {
        [`rules.${r.key}`]: info.penalty ? "Use 0 or less" : "Use 0 or more",
      });
    }
    if (r.points !== info.points || !r.enabled) overrides[r.key] = { points: r.points, enabled: r.enabled };
  }
  const bands = [...input.bands].sort((a, b) => b.min - a.min);
  const isDefault = JSON.stringify(bands) === JSON.stringify(DEFAULT_BANDS);
  await db.query(`UPDATE workspaces SET point_rules = $2, penalties_enabled = $3, score_bands = $4 WHERE id = $1`, [
    ctx.workspaceId,
    overrides,
    input.penaltiesOn,
    isDefault ? null : JSON.stringify(bands),
  ]);
  return getPointSettings(db, ctx);
}
