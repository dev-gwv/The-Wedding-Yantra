"use client";

import { can, daysBetween, formatClock, formatDueDay, type Role } from "@wedding-yantra/core";
import { useSetTaskDone } from "@wedding-yantra/api-client/react";
import type { TaskItem } from "@wedding-yantra/types";
import { Check, Flag } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Card } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** Whoever it's for or made it, owners and managers, or anyone on its event when it's for nobody. Same rule as the API. */
export function canTick(task: TaskItem, role: Role, userId: string) {
  return can(role, "tasks.manage") || task.assignee?.id === userId || task.createdBy?.id === userId || task.assignee === null;
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
  const tickable = canTick(task, workspace.role, me.user.id);

  async function toggle() {
    const next = !done;
    setPending({ done: next, was: task.done });
    try {
      await setDone.mutateAsync({ id: task.id, done: next });
    } catch (err) {
      setPending(null);
      toast(errorMessage(err), "error");
    }
  }

  const late = !done && task.dueDate !== null && task.dueDate < today;
  const who = task.assignee ? (task.assignee.id === me.user.id ? "You" : (task.assignee.name ?? "Team member")) : "Anyone on the event";

  return (
    <li className="flex items-start gap-1 py-1 pl-1.5 pr-4 sm:pr-5">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        disabled={!tickable}
        title={tickable ? undefined : "This task is for someone else"}
        onClick={toggle}
        className="group grid size-11 shrink-0 place-items-center rounded-full disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "grid size-6 place-items-center rounded-full border-2 transition",
            done ? "border-success bg-success text-on-brand" : "border-line-strong bg-surface group-hover:border-sun-300",
            !tickable && !done && "border-dashed opacity-50",
          )}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
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
          {task.priority === "high" && !done && (
            <span className="inline-flex items-center gap-1 font-semibold text-brand-strong">
              <Flag className="size-3.5" /> Urgent
            </span>
          )}
          {task.dueDate && (
            <span className={cn(late && "font-semibold text-danger")}>
              {formatDueDay(task.dueDate, today)}
              {task.dueTime && `, ${formatClock(task.dueTime)}`}
            </span>
          )}
          {show.event && task.eventTitle && <span className="min-w-0 truncate">{task.eventTitle}</span>}
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
