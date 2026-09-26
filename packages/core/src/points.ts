/**
 * Points: a daily reason to finish work well. Each finished task earns points by its
 * priority, with more for finishing on time and for work approved first time. Penalties
 * exist but only count once the owner switches them on. Paid once per thing, by the API.
 */
import type { TaskPriorityLevel } from "./tasks.js";

export const POINT_RULE_KEYS = [
  "done_urgent",
  "done_high",
  "done_normal",
  "done_low",
  "on_time",
  "first_time",
  "streak_7",
  "recognition",
  "late",
  "sent_back",
  "deadline_moved",
] as const;
export type PointRuleKey = (typeof POINT_RULE_KEYS)[number];

export interface PointRuleInfo {
  label: string;
  /** Points when nothing is changed */
  points: number;
  /** Counts only when the business turns penalties on */
  penalty: boolean;
}

export const POINT_RULE_INFO: Record<PointRuleKey, PointRuleInfo> = {
  done_urgent: { label: "Finished an urgent task", points: 12, penalty: false },
  done_high: { label: "Finished a high-priority task", points: 8, penalty: false },
  done_normal: { label: "Finished a task", points: 5, penalty: false },
  done_low: { label: "Finished a low-priority task", points: 3, penalty: false },
  on_time: { label: "Finished by its day", points: 2, penalty: false },
  first_time: { label: "Approved first time", points: 3, penalty: false },
  streak_7: { label: "A task finished every day for 7 days", points: 10, penalty: false },
  recognition: { label: "Recognised for great work", points: 5, penalty: false },
  late: { label: "Finished after its day", points: -3, penalty: true },
  sent_back: { label: "Work sent back", points: -2, penalty: true },
  deadline_moved: { label: "Moved a task's date later", points: -5, penalty: true },
};

/** What the owner changed, per rule. Anything not listed keeps its default. */
export type PointRuleOverrides = Partial<Record<PointRuleKey, { points?: number; enabled?: boolean }>>;
export type PointRules = Record<PointRuleKey, { points: number; enabled: boolean }>;

export function resolveRules(overrides: PointRuleOverrides | null | undefined): PointRules {
  const out = {} as PointRules;
  for (const key of POINT_RULE_KEYS) {
    const o = overrides?.[key];
    out[key] = { points: o?.points ?? POINT_RULE_INFO[key].points, enabled: o?.enabled ?? true };
  }
  return out;
}

export type PointEvent =
  | { kind: "finished"; priority: TaskPriorityLevel; late: boolean; checked: boolean; revisions: number }
  | { kind: "sent_back" }
  | { kind: "deadline_moved" };

/** The points one thing earns (or costs), after the business's own rules. */
export function awardsFor(event: PointEvent, rules: PointRules, penaltiesOn: boolean): { rule: PointRuleKey; points: number }[] {
  const keys: PointRuleKey[] = [];
  if (event.kind === "finished") {
    keys.push(`done_${event.priority}` as PointRuleKey);
    keys.push(event.late ? "late" : "on_time");
    if (event.checked && event.revisions === 0) keys.push("first_time");
  } else {
    keys.push(event.kind);
  }
  return keys
    .filter((k) => rules[k].enabled && rules[k].points !== 0 && (!POINT_RULE_INFO[k].penalty || penaltiesOn))
    .map((k) => ({ rule: k, points: rules[k].points }));
}

export interface ScoreBand {
  name: string;
  /** Points this month to reach it */
  min: number;
}

/** Highest first. The last band starts at zero. */
export const DEFAULT_BANDS: ScoreBand[] = [
  { name: "Excellent", min: 80 },
  { name: "Good", min: 50 },
  { name: "Needs attention", min: 20 },
  { name: "Just starting", min: 0 },
];

export function bandFor(points: number, bands: ScoreBand[] = DEFAULT_BANDS): { band: ScoreBand; next: ScoreBand | null; gap: number } {
  const sorted = [...bands].sort((a, b) => b.min - a.min);
  const i = sorted.findIndex((b) => points >= b.min);
  const band = sorted[i === -1 ? sorted.length - 1 : i]!;
  const next = i > 0 ? sorted[i - 1]! : null;
  return { band, next, gap: next ? next.min - points : 0 };
}

export interface RankInput {
  id: string;
  points: number;
  tasksDone: number;
  /** 0 to 100, or null with nothing due */
  onTime: number | null;
}

/**
 * Ranks by points, then by on-time %. Someone who finished nothing this month isn't
 * ranked (instead of a silent zero at the bottom). Ties share a rank.
 */
export function rankPeople<T extends RankInput>(people: T[]): (T & { rank: number | null; notRanked: string | null })[] {
  const ranked = people
    .filter((p) => p.tasksDone > 0 || p.points !== 0)
    .sort((a, b) => b.points - a.points || (b.onTime ?? -1) - (a.onTime ?? -1));
  const out: (T & { rank: number | null; notRanked: string | null })[] = [];
  ranked.forEach((p, i) => {
    const prev = ranked[i - 1];
    const rank = prev && prev.points === p.points && (prev.onTime ?? -1) === (p.onTime ?? -1) ? out[i - 1]!.rank : i + 1;
    out.push({ ...p, rank, notRanked: null });
  });
  for (const p of people) if (!ranked.includes(p)) out.push({ ...p, rank: null, notRanked: "No tasks finished this month" });
  return out;
}

/** One line on what to do next, for the person themselves. */
export function coachingLine(f: {
  lateNow: number;
  onTime: number | null;
  gap: number;
  nextBand: string | null;
  rank: number | null;
  ranked: number;
  onTimeTaskPoints: number;
}): string {
  if (f.lateNow > 0) {
    const tasks = `${f.lateNow} late task${f.lateNow === 1 ? "" : "s"}`;
    return f.onTime !== null ? `${tasks}: finish ${f.lateNow === 1 ? "it" : "them"} today to keep your on-time at ${f.onTime}%.` : `${tasks}: finish ${f.lateNow === 1 ? "it" : "them"} today.`;
  }
  if (f.nextBand && f.gap > 0) {
    const tasks = Math.max(1, Math.ceil(f.gap / Math.max(1, f.onTimeTaskPoints)));
    return `${f.gap} point${f.gap === 1 ? "" : "s"} to ${f.nextBand}: about ${tasks} task${tasks === 1 ? "" : "s"} finished on time.`;
  }
  if (f.rank === 1 && f.ranked > 1) return "Top of the board this month. Keep finishing on time to stay there.";
  if (f.rank === null) return `Finish a task on time for your first ${f.onTimeTaskPoints} points this month.`;
  return `Every task finished on time is ${f.onTimeTaskPoints} points.`;
}
