/**
 * Delegation rules shared by the API, the web app and (later) the phone app: where a task
 * can stand, who can move it there, how late it is, and how it reads on WhatsApp.
 */
import { formatDate } from "./dates.js";

/** "open" is the "to do" value, kept from the first version so old links keep working. */
export const TASK_STATUSES = ["open", "doing", "waiting", "review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_INFO: Record<TaskStatus, { label: string; short: string; about: string }> = {
  open: { label: "To do", short: "To do", about: "Given, not started yet" },
  doing: { label: "Doing", short: "Doing", about: "Being worked on" },
  waiting: { label: "Stuck", short: "Stuck", about: "Waiting on something or someone" },
  review: { label: "Waiting for a check", short: "To check", about: "Handed in, waiting for whoever gave it" },
  done: { label: "Done", short: "Done", about: "Finished" },
  cancelled: { label: "Cancelled", short: "Cancelled", about: "No longer needed" },
};

/** Still to finish: everything but done and cancelled. */
export const ACTIVE_STATUSES: TaskStatus[] = ["open", "doing", "waiting", "review"];
export const isActive = (status: TaskStatus) => status !== "done" && status !== "cancelled";

export const TASK_PRIORITY_LEVELS = ["low", "normal", "high", "urgent"] as const;
export type TaskPriorityLevel = (typeof TASK_PRIORITY_LEVELS)[number];
export const TASK_PRIORITY_INFO: Record<TaskPriorityLevel, { label: string; rank: number }> = {
  urgent: { label: "Urgent", rank: 0 },
  high: { label: "High", rank: 1 },
  normal: { label: "Normal", rank: 2 },
  low: { label: "Low", rank: 3 },
};

export interface MoveFacts {
  from: TaskStatus;
  to: TaskStatus;
  /** Whoever gave it checks the work first */
  needsCheck: boolean;
  /** The person moving it: can give tasks to others (owner, manager) */
  manages: boolean;
  /** The person moving it is who it's for (or it's for anyone on the event) */
  isAssignee: boolean;
  /** The person moving it gave the task */
  isGiver: boolean;
}

/**
 * Whether this person may move the task, and if not, why (in words they can act on).
 * - Whoever it's for moves it between to do, doing and stuck, and finishes it: ticks it
 *   done, or hands it in when it needs a check.
 * - Only whoever gave it (or an owner or manager) approves or sends back, and cancels.
 * - A task that needs a check can't skip the check, except by its giver or a manager.
 */
export function canMove(f: MoveFacts): { ok: true } | { ok: false; reason: string } {
  if (f.from === f.to) return { ok: true };
  const boss = f.manages || f.isGiver;
  if (!f.isAssignee && !boss) return { ok: false, reason: "This task is for someone else" };
  if (f.to === "cancelled") return boss ? { ok: true } : { ok: false, reason: "Only whoever gave it can cancel this task" };
  if (f.from === "cancelled" && !boss) return { ok: false, reason: "Only whoever gave it can bring this task back" };
  if (f.from === "review" && (f.to === "done" || f.to === "doing" || f.to === "open") && !boss) {
    return { ok: false, reason: "Waiting for whoever gave it to check your work" };
  }
  if (f.to === "done" && f.needsCheck && !boss) return { ok: false, reason: "Hand it in for a check instead" };
  if (f.to === "review" && !f.needsCheck && !boss) return { ok: false, reason: "This task doesn't need a check: tick it done" };
  if (f.from === "done" && !boss && !f.needsCheck) return { ok: true };
  if (f.from === "done" && f.needsCheck && !boss) return { ok: false, reason: "It was approved. Ask whoever gave it to open it again." };
  return { ok: true };
}

export type DueState = "none" | "overdue" | "today" | "soon" | "later";

/** How close a task is to its date: overdue, today, within three days, later, or no date. */
export function dueState(t: { status: TaskStatus; dueDate: string | null; dueTime?: string | null }, today: string, nowClock?: string): DueState {
  if (!t.dueDate || !isActive(t.status)) return "none";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return t.dueTime && nowClock && t.dueTime < nowClock ? "overdue" : "today";
  const [y, m, d] = today.split("-").map(Number);
  const soon = new Date(Date.UTC(y!, m! - 1, d! + 3)).toISOString().slice(0, 10);
  return t.dueDate <= soon ? "soon" : "later";
}

/** Links in a description, for "Open drive.google.com" chips. */
export function linksIn(text: string | null | undefined): { url: string; host: string }[] {
  if (!text) return [];
  const found = text.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  const seen = new Set<string>();
  return found
    .map((raw) => raw.replace(/[.,;:!?]+$/, ""))
    .filter((url) => (seen.has(url) ? false : (seen.add(url), true)))
    .map((url) => {
      try {
        return { url, host: new URL(url).host.replace(/^www\./, "") };
      } catch {
        return null;
      }
    })
    .filter((x): x is { url: string; host: string } => x !== null);
}

/** A task as a WhatsApp message, to send or forward. */
export function taskWhatsappText(t: {
  title: string;
  assigneeName?: string | null;
  priority: TaskPriorityLevel;
  dueDate: string | null;
  dueTime?: string | null;
  eventTitle?: string | null;
  notes?: string | null;
  steps?: { title: string; done: boolean }[];
  link?: string | null;
}): string {
  const lines = [`*${t.title}*`];
  if (t.assigneeName) lines.push(`For: ${t.assigneeName}`);
  if (t.dueDate) lines.push(`By: ${formatDate(t.dueDate)}${t.dueTime ? `, ${t.dueTime}` : ""}`);
  if (t.priority === "urgent" || t.priority === "high") lines.push(`Priority: ${TASK_PRIORITY_INFO[t.priority].label}`);
  if (t.eventTitle) lines.push(`Event: ${t.eventTitle}`);
  if (t.notes) lines.push("", t.notes);
  if (t.steps?.length) lines.push("", ...t.steps.map((s) => `${s.done ? "✓" : "•"} ${s.title}`));
  if (t.link) lines.push("", t.link);
  return lines.join("\n");
}
