/**
 * Alerts: what each one says, how people group them when switching them off, quiet
 * hours, and the morning and evening round-ups. Shared by the API, the web app and
 * (later) the phone app, so an alert reads the same everywhere.
 */
import { formatClock } from "./dates.js";

export const NOTIFICATION_KINDS = [
  "task.assigned",
  "task.due_soon",
  "task.overdue",
  "task.reminder",
  "task.submitted",
  "task.approved",
  "task.sent_back",
  "task.done",
  "task.stuck",
  "task.commented",
  "task.mentioned",
  "digest.morning",
  "digest.evening",
  "points.recognised",
  "lead.new",
  "lead.follow_up",
  "quote.accepted",
  "quote.declined",
  "test",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** What people switch on and off: a handful of plain groups, not every kind. */
export const NOTIFICATION_GROUPS = [
  { key: "assigned", label: "New tasks for you", about: "When someone gives you a task", kinds: ["task.assigned"] },
  {
    key: "reminders",
    label: "Reminders until it's done",
    about: "The day before and on the day a task is due, morning and afternoon while it's late, an hour before its time, and every few days for open tasks with no date",
    kinds: ["task.due_soon", "task.overdue", "task.reminder"],
  },
  { key: "checks", label: "Hand-ins and checks", about: "Work handed in to you, and your work approved or sent back", kinds: ["task.submitted", "task.approved", "task.sent_back"] },
  { key: "updates", label: "Finished and stuck", about: "When a task you gave is done, or someone is stuck on it", kinds: ["task.done", "task.stuck"] },
  { key: "talk", label: "Comments and mentions", about: "Comments on your tasks, and when someone @mentions you", kinds: ["task.commented", "task.mentioned"] },
  {
    key: "sales",
    label: "Enquiries and quotes",
    about: "A new enquiry for you, a follow-up that's due, and a client accepting or declining a quote",
    kinds: ["lead.new", "lead.follow_up", "quote.accepted", "quote.declined"],
  },
  { key: "praise", label: "Recognition", about: "When the owner or a manager recognises your work", kinds: ["points.recognised"] },
  { key: "digests", label: "Morning plan and evening round-up", about: "Your day at 8 am; for owners and managers, the team's day at 7 pm", kinds: ["digest.morning", "digest.evening"] },
] as const satisfies readonly { key: string; label: string; about: string; kinds: readonly NotificationKind[] }[];
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]["key"];
export const NOTIFICATION_GROUP_KEYS = NOTIFICATION_GROUPS.map((g) => g.key) as NotificationGroup[];

/** The group a kind belongs to; the test alert belongs to none and always arrives. */
export function groupOf(kind: NotificationKind): NotificationGroup | null {
  return NOTIFICATION_GROUPS.find((g) => (g.kinds as readonly string[]).includes(kind))?.key ?? null;
}

/** Quiet hours when nothing is set: 10 pm to 7 am. */
export const DEFAULT_QUIET = { from: "22:00", to: "07:00" } as const;

/** Whether a local "HH:MM" falls inside quiet hours. Handles hours that cross midnight. */
export function inQuietHours(clock: string, from: string | null, to: string | null): boolean {
  if (!from || !to || from === to) return false;
  return from < to ? clock >= from && clock < to : clock >= from || clock < to;
}

export interface TaskAlertFacts {
  /** Who did it, first name is enough */
  who?: string | null;
  title: string;
  reason?: string | null;
  /** "HH:MM" for due soon */
  dueTime?: string | null;
  /** For a comment: what was said */
  comment?: string | null;
}

const first = (name: string | null | undefined) => (name ? name.trim().split(/\s+/)[0]! : "Someone");
const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The title and line for one task alert. */
export function taskAlertText(kind: NotificationKind, f: TaskAlertFacts): { title: string; body: string } {
  const who = first(f.who);
  const t = clip(f.title, 90);
  switch (kind) {
    case "task.assigned":
      return { title: `New task from ${who}`, body: t };
    case "task.due_soon":
      return { title: f.dueTime ? `Due at ${formatClock(f.dueTime)}` : "Due soon", body: t };
    case "task.overdue":
      return { title: "Late: this was due yesterday", body: t };
    case "task.submitted":
      return { title: `${who} handed in work to check`, body: t };
    case "task.approved":
      return { title: `${who} approved your work`, body: t };
    case "task.sent_back":
      return { title: `${who} sent your work back`, body: f.reason ? `${t}: ${clip(f.reason)}` : t };
    case "task.done":
      return { title: `${who} finished a task`, body: t };
    case "task.stuck":
      return { title: `${who} is stuck`, body: f.reason ? `${t}: ${clip(f.reason)}` : t };
    case "task.commented":
      return { title: `${who} commented`, body: f.comment ? `${t}: ${clip(f.comment)}` : t };
    case "task.mentioned":
      return { title: `${who} mentioned you`, body: f.comment ? `${t}: ${clip(f.comment)}` : t };
    default:
      return { title: t, body: "" };
  }
}

export interface SalesAlertFacts {
  /** The enquiry's or the client's name */
  name: string;
  /** A line under it: where the enquiry came from, or which quote */
  detail?: string | null;
  /** The same number enquiring again, added to their open lead */
  again?: boolean;
  /** For a declined quote: why */
  reason?: string | null;
}

/** The title and line for an enquiry or quote alert. */
export function salesAlertText(kind: NotificationKind, f: SalesAlertFacts): { title: string; body: string } {
  const name = clip(f.name.trim() || "Someone", 60);
  const detail = f.detail ? clip(f.detail) : "";
  switch (kind) {
    case "lead.new":
      return { title: f.again ? `Enquired again: ${name}` : `New enquiry: ${name}`, body: detail };
    case "lead.follow_up":
      return { title: `Follow-up due: ${name}`, body: detail || "Time to get back to them" };
    case "quote.accepted":
      return { title: `Quote accepted by ${name}`, body: detail };
    case "quote.declined":
      return { title: `Quote declined by ${name}`, body: f.reason ? `${detail ? `${detail}: ` : ""}${clip(f.reason)}` : detail };
    default:
      return { title: name, body: detail };
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where an open task stands, for a reminder. */
export type ReminderState = "due_tomorrow" | "due_today" | "late" | "pending";

export interface ReminderFacts {
  title: string;
  state: ReminderState;
  /** Morning or afternoon round */
  slot: "am" | "pm";
  daysLate?: number;
  /** Open this many days, for a task with no date */
  ageDays?: number;
  /** Stuck on something: say what, so the reminder isn't just nagging */
  stuckReason?: string | null;
}

/** A reminder about one open task, repeated until it's done. */
export function taskReminderText(f: ReminderFacts): { title: string; body: string } {
  const t = clip(f.title, 90);
  const stuck = f.stuckReason ? ` · stuck: ${clip(f.stuckReason, 80)}` : "";
  switch (f.state) {
    case "due_tomorrow":
      return { title: "Due tomorrow", body: `${t}${stuck}` };
    case "due_today":
      return { title: f.slot === "am" ? "Due today" : "Still open, due today", body: `${t}${stuck}` };
    case "late":
      return { title: `Late by ${plural(f.daysLate ?? 1, "day")}: still not done`, body: `${t}${stuck}` };
    default:
      return { title: "Still pending", body: `${t} · open for ${plural(f.ageDays ?? 0, "day")}${stuck}` };
  }
}

export interface MorningFacts {
  late: number;
  dueToday: number;
  /** Tasks handed in to this person, waiting for their check */
  toCheck: number;
  /** Events today: title and reach time */
  events: { title: string; callTime: string | null }[];
  /** The most pressing task, to name in the alert */
  top?: string | null;
}

/** "Your day": sent at 8 am when there is something to do. Null when there's nothing. */
export function morningDigestText(f: MorningFacts): { title: string; body: string } | null {
  const tasks = f.late + f.dueToday;
  if (tasks === 0 && f.toCheck === 0 && f.events.length === 0) return null;
  const parts: string[] = [];
  for (const e of f.events.slice(0, 2)) parts.push(e.callTime ? `${e.title}, reach by ${formatClock(e.callTime)}` : `${e.title} today`);
  if (f.late) parts.push(`${f.late} late`);
  if (f.dueToday) parts.push(`${f.dueToday} due today`);
  if (f.toCheck) parts.push(`${f.toCheck} to check`);
  const title = tasks > 0 ? `Your day: ${plural(tasks, "task")}` : f.events.length ? "Your day: an event today" : "Your day: work to check";
  const body = [parts.join(" · "), f.top ? `Start with: ${clip(f.top, 80)}` : null].filter(Boolean).join("\n");
  return { title, body };
}

export interface EveningFacts {
  doneToday: number;
  /** Late tasks by person, most first */
  lateBy: { name: string | null; count: number }[];
  stuck: number;
  toCheck: number;
  dueTomorrow: number;
}

/** The team's day for owners and managers at 7 pm. Null on a day with nothing to say. */
export function eveningDigestText(f: EveningFacts): { title: string; body: string } | null {
  const late = f.lateBy.reduce((s, p) => s + p.count, 0);
  if (!f.doneToday && !late && !f.stuck && !f.toCheck && !f.dueTomorrow) return null;
  const title = `Team today: ${plural(f.doneToday, "task")} done${late ? `, ${late} late` : ""}`;
  const lines: string[] = [];
  if (late) lines.push(`Late: ${f.lateBy.slice(0, 3).map((p) => `${first(p.name)} ${p.count}`).join(", ")}${f.lateBy.length > 3 ? "…" : ""}`);
  const rest = [f.toCheck ? `${f.toCheck} waiting for a check` : null, f.stuck ? `${f.stuck} stuck` : null, f.dueTomorrow ? `${f.dueTomorrow} due tomorrow` : null].filter(Boolean);
  if (rest.length) lines.push(rest.join(" · "));
  return { title, body: lines.join("\n") };
}

/** "Done for the day": what someone finished, what's left, and tomorrow, to send to whoever they report to. */
export function dayReportText(f: { name: string | null; date: string; done: string[]; left: string[]; tomorrow: string[] }): string {
  const lines = [`*${f.name ? `${first(f.name)}'s` : "My"} day, ${f.date}*`];
  lines.push("", `Done (${f.done.length}):`, ...(f.done.length ? f.done.map((t) => `✓ ${t}`) : ["Nothing ticked off today"]));
  if (f.left.length) lines.push("", `Still open (${f.left.length}):`, ...f.left.map((t) => `• ${t}`));
  if (f.tomorrow.length) lines.push("", "Tomorrow:", ...f.tomorrow.map((t) => `• ${t}`));
  return lines.join("\n");
}
