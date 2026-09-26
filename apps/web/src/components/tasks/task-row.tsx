"use client";

import { can, daysBetween, formatClock, formatDueDay, type Role } from "@wedding-yantra/core";
import { useSetTaskDone } from "@wedding-yantra/api-client/react";
import type { TaskItem } from "@wedding-yantra/types";
import { Check, ListChecks, MessageSquare, Paperclip, Repeat, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Card } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { PriorityMark, StatusPill } from "./task-bits";

/** Whoever it's for or made it, owners and managers, or anyone on its event when it's for nobody. Same rule as the API. */
export function canTick(task: TaskItem, role: Role, userId: string) {
  return can(role, "tasks.manage") || task.assignee?.id === userId || task.createdBy?.id === userId || task.assignee === null;
}

/** Whoever gave it, or an owner or manager: they approve, send back and cancel. */
export function isBoss(task: TaskItem, role: Role, userId: string) {
  return can(role, "tasks.manage") || task.createdBy?.id === userId;
}

/** Owners and managers change any task; everyone else the ones they added. */
export function canEditTask(task: TaskItem, role: Role, userId: string) {
  return can(role, "tasks.manage") || task.createdBy?.id === userId;
}

/** One task: a big round tick on the left, what and when on the right. */
export function TaskRow({
  task,
  today,
  show = {},
  onOpen,
  note,
}: {
  task: TaskItem;
  /** The business's today, `YYYY-MM-DD` */
  today: string;
  show?: { event?: boolean; assignee?: boolean };
  onOpen?: (task: TaskItem) => void;
  /** A last small line, e.g. who ticked it off */
  note?: string | null;
}) {
  const { workspace, me } = useCurrentWorkspace();
  const setDone = useSetTaskDone(workspace.id);
  const toast = useToast();
  // The tick shows at once; it stops overriding as soon as the refreshed task arrives.
  const [pending, setPending] = useState<{ done: boolean; was: boolean } | null>(null);
  const done = pending && pending.was === task.done ? pending.done : task.done;
  const tickable = canTick(task, workspace.role, me.user.id) && task.status !== "cancelled";
  // A task that needs a check is handed in, not ticked: the tick opens it.
  const handIn = task.needsCheck && !isBoss(task, workspace.role, me.user.id) && task.status !== "done";

  async function toggle() {
    if (handIn || task.status === "review") return onOpen?.(task);
    const next = !done;
    setPending({ done: next, was: task.done });
    try {
      await setDone.mutateAsync({ id: task.id, done: next });
    } catch (err) {
      setPending(null);
      toast(errorMessage(err), "error");
    }
  }

  const late = !done && task.status !== "cancelled" && task.dueDate !== null && task.dueDate < today;
  const who = task.assignee ? (task.assignee.id === me.user.id ? "You" : (task.assignee.name ?? "Team member")) : "Anyone on the event";

  return (
    <li className="flex items-start gap-1 py-1 pl-1.5 pr-4 sm:pr-5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        disabled={!tickable}
        onClick={toggle}
        title={handIn ? "Hand it in for a check" : task.status === "review" ? "Waiting for a check" : tickable ? undefined : "This task is for someone else"}
        className="group grid size-11 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "grid size-6 place-items-center rounded-full border-2 transition",
            done
              ? "border-success bg-success text-on-brand"
              : task.status === "review"
                ? "border-[#6366F1] bg-[#EEF2FF] text-[#4338CA]"
                : "border-line-strong bg-surface group-hover:border-sun-300",
            !tickable && !done && "border-dashed opacity-50",
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
          {!done && task.status === "review" && <ShieldCheck className="size-3.5" />}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onOpen?.(task)}
        disabled={!onOpen}
        className="min-w-0 flex-1 py-2 text-left disabled:cursor-default"
      >
        <span className={cn("block font-semibold leading-snug", done && "text-ink-muted line-through")}>{task.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-muted">
          {(task.status === "doing" || task.status === "waiting" || task.status === "review" || task.status === "cancelled") && <StatusPill status={task.status} />}
          {!done && <PriorityMark priority={task.priority} />}
          {task.dueDate && (
            <span className={cn(late && "font-semibold text-danger")}>
              {formatDueDay(task.dueDate, today)}
              {task.dueTime && `, ${formatClock(task.dueTime)}`}
            </span>
          )}
          {task.repeat && (
            <span className="inline-flex items-center gap-1" title={task.repeat.label}>
              <Repeat className="size-3.5" /> <span className="sr-only">{task.repeat.label}</span>
            </span>
          )}
          {task.steps.total > 0 && (
            <span className="inline-flex items-center gap-1 tabular" title="Steps done">
              <ListChecks className="size-3.5" /> {task.steps.done}/{task.steps.total}
            </span>
          )}
          {task.comments > 0 && (
            <span className="inline-flex items-center gap-1 tabular" title="Comments">
              <MessageSquare className="size-3.5" /> {task.comments}
            </span>
          )}
          {task.files > 0 && (
            <span className="inline-flex items-center gap-1 tabular" title="Files">
              <Paperclip className="size-3.5" /> {task.files}
            </span>
          )}
          {task.needsCheck && !done && task.status !== "review" && (
            <span className="inline-flex items-center gap-1" title="Whoever gave it checks the work">
              <ShieldCheck className="size-3.5" /> Check
            </span>
          )}
          {task.tagLabel && <span className="rounded-md bg-cream px-1.5 text-xs font-semibold leading-5 text-ink-muted">{task.tagLabel}</span>}
          {show.event && task.eventTitle && <span className="min-w-0 truncate">{task.eventTitle}</span>}
          {!show.event && task.clientName && <span className="min-w-0 truncate">{task.clientName}</span>}
          {show.assignee && <span>{who}</span>}
        </span>
        {note && <span className="mt-0.5 block text-xs text-ink-subtle">{note}</span>}
      </button>
    </li>
  );
}

type GroupKey = "late" | "today" | "tomorrow" | "week" | "later" | "none";
const GROUP_LABELS: Record<GroupKey, string> = {
  late: "Late",
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
  none: "No date",
};

function groupOf(task: TaskItem, today: string): GroupKey {
  if (!task.dueDate) return "none";
  const days = daysBetween(today, task.dueDate);
  if (days < 0) return "late";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return days <= 7 ? "week" : "later";
}

/** Open tasks in the order people think about them: late, today, tomorrow, this week, later. */
export function TaskGroups({
  tasks,
  today,
  show,
  onOpen,
}: {
  tasks: TaskItem[];
  today: string;
  show?: { event?: boolean; assignee?: boolean };
  onOpen?: (task: TaskItem) => void;
}) {
  const groups = new Map<GroupKey, TaskItem[]>();
  for (const key of Object.keys(GROUP_LABELS) as GroupKey[]) groups.set(key, []);
  for (const t of tasks) groups.get(groupOf(t, today))!.push(t);

  return (
    <div className="space-y-5">
      {[...groups.entries()]
        .filter(([, list]) => list.length > 0)
        .map(([key, list]) => (
          <section key={key}>
            <h2 className={cn("mb-2 px-1 text-xs font-extrabold uppercase tracking-wider", key === "late" ? "text-danger" : "text-ink-muted")}>
              {GROUP_LABELS[key]} <span className="tabular">· {list.length}</span>
            </h2>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} today={today} show={show} onOpen={onOpen} />
                ))}
              </ul>
            </Card>
          </section>
        ))}
    </div>
  );
}
