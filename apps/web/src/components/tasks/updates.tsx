"use client";

import {
  formatDate,
  localISODate,
  TASK_STATUS_INFO,
} from "@wedding-yantra/core";
import type { TaskHistoryItem, TaskUpdate } from "@wedding-yantra/types";
import {
  CalendarClock,
  Check,
  CirclePause,
  FileUp,
  ListChecks,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  Undo2,
  Upload,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** One line of a task's own history, as it reads under "What happened". */
export function historyText(
  h: Pick<TaskHistoryItem, "action" | "meta">,
): string {
  const m = h.meta;
  switch (h.action) {
    case "created":
      return "added this task";
    case "moved": {
      const to = str(m.to) as keyof typeof TASK_STATUS_INFO | null;
      const label = to
        ? TASK_STATUS_INFO[to]?.label.toLowerCase()
        : "a new stage";
      return `moved it to ${label}${str(m.reason) ? `: ${str(m.reason)}` : ""}`;
    }
    case "submitted":
      return "handed it in";
    case "approved":
      return "approved it";
    case "sent_back":
      return `sent it back${str(m.reason) ? `: ${str(m.reason)}` : ""}`;
    case "deadline_moved":
      return `moved the date${str(m.to) ? ` to ${formatDate(str(m.to)!, { year: false })}` : ""}${str(m.reason) ? `: ${str(m.reason)}` : ""}`;
    case "due_changed":
      return str(m.to)
        ? `set the date to ${formatDate(str(m.to)!, { year: false })}`
        : "took the date off";
    case "reassigned":
      return "changed who does it";
    case "file_added":
      return "added a file";
    case "edited":
      return "changed the details";
    default:
      return h.action.replace(/[._]/g, " ");
  }
}

/** How an update reads in a person's timeline: words before the task's name, words after, and an icon. */
function phrase(u: TaskUpdate): {
  before: string;
  after: string | null;
  icon: LucideIcon;
  tone?: "danger" | "success" | "warning";
} {
  const reason = str(u.meta.reason);
  if (u.kind === "comment")
    return {
      before: "commented on",
      after: u.text ? `“${u.text}”` : null,
      icon: MessageSquare,
    };
  if (u.kind === "step")
    return { before: "ticked a step on", after: u.text, icon: ListChecks };
  if (u.kind === "done")
    return { before: "finished", after: null, icon: Check, tone: "success" };
  switch (u.action) {
    case "created":
      // Given to someone else reads as assigned; a task for yourself is just added.
      return { before: str(u.meta.assigneeId) && str(u.meta.assigneeId) !== u.actor?.id ? "assigned" : "added", after: null, icon: Plus };
    case "moved": {
      const to = str(u.meta.to);
      if (to === "doing") return { before: "started", after: null, icon: Play };
      if (to === "waiting")
        return {
          before: "marked",
          after: `stuck${reason ? `: ${reason}` : ""}`,
          icon: CirclePause,
          tone: "warning",
        };
      if (to === "review")
        return { before: "handed in", after: null, icon: Upload };
      if (to === "cancelled")
        return { before: "cancelled", after: null, icon: Undo2 };
      return { before: "moved", after: "back to To do", icon: RotateCcw };
    }
    case "submitted":
      return { before: "handed in", after: null, icon: Upload };
    case "approved":
      return {
        before: "approved",
        after: null,
        icon: ShieldCheck,
        tone: "success",
      };
    case "sent_back":
      return {
        before: "sent back",
        after: reason,
        icon: Undo2,
        tone: "danger",
      };
    case "deadline_moved":
      return {
        before: "moved the date of",
        after:
          `${str(u.meta.to) ? `to ${formatDate(str(u.meta.to)!, { year: false })}` : ""}${reason ? `: ${reason}` : ""}` ||
          null,
        icon: CalendarClock,
      };
    case "due_changed":
      return {
        before: str(u.meta.to) ? "set the date of" : "took the date off",
        after: str(u.meta.to)
          ? `to ${formatDate(str(u.meta.to)!, { year: false })}`
          : null,
        icon: CalendarClock,
      };
    case "reassigned":
      return { before: "changed who does", after: null, icon: UserRound };
    case "file_added":
      return { before: "added a file to", after: null, icon: FileUp };
    case "edited":
      return { before: "changed the details of", after: null, icon: Pencil };
    default:
      return {
        before: u.action.replace(/[._]/g, " "),
        after: null,
        icon: Pencil,
      };
  }
}

const dayLabel = (day: string, today: string) => {
  if (day === today) return "Today";
  const y = new Date(`${today}T00:00:00`);
  y.setDate(y.getDate() - 1);
  return day === localISODate(y)
    ? "Yesterday"
    : formatDate(day, { year: false });
};
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

/** A person's recent updates, newest first, by day. Each line opens its task. */
export function UpdatesTimeline({
  updates,
  today,
  meId,
  onOpenTask,
}: {
  updates: TaskUpdate[];
  today: string;
  meId: string;
  onOpenTask: (taskId: string) => void;
}) {
  const days: { day: string; items: TaskUpdate[] }[] = [];
  for (const u of updates) {
    const day = localISODate(new Date(u.at));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(u);
    else days.push({ day, items: [u] });
  }
  return (
    <div className="space-y-5">
      {days.map(({ day, items }) => (
        <section key={day}>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-subtle">
            {dayLabel(day, today)}
          </h4>
          <ol className="space-y-3">
            {items.map((u) => {
              const { before, after, icon: Icon, tone } = phrase(u);
              const who = u.actor
                ? u.actor.id === meId
                  ? "You"
                  : (u.actor.name ?? "Someone")
                : "Someone";
              return (
                <li key={u.id} className="flex gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
                      tone === "danger"
                        ? "bg-danger-soft text-danger"
                        : tone === "success"
                          ? "bg-success-soft text-success"
                          : tone === "warning"
                            ? "bg-sun-100 text-brand-strong"
                            : "bg-cream text-ink-muted",
                    )}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-snug">
                    <span className="font-semibold">{who}</span> {before}{" "}
                    <button
                      type="button"
                      onClick={() => onOpenTask(u.task.id)}
                      className="font-semibold text-brand-strong hover:underline"
                    >
                      {u.task.title}
                    </button>
                    {after && <span className="text-ink-muted"> {after}</span>}
                    <span className="block text-xs text-ink-subtle tabular">
                      {clock(u.at)}
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
