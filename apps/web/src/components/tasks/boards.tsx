"use client";

import { formatClock, formatDueDay, TASK_STATUS_INFO, type TaskStatus } from "@wedding-yantra/core";
import { useMoveAnyTask, useUpdateTask } from "@wedding-yantra/api-client/react";
import type { PeopleBoard, TaskItem } from "@wedding-yantra/types";
import { CalendarOff, ListChecks, MessageSquare, Paperclip, Plus, ShieldCheck } from "lucide-react";
import { useState, type DragEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { PriorityMark, STATUS_STYLE, StatusPill } from "./task-bits";

/** A task as a card on a board. Drag it to another column. */
export function TaskCard({
  task,
  today,
  onOpen,
  showAssignee,
  showStatus,
}: {
  task: TaskItem;
  today: string;
  onOpen: (t: TaskItem) => void;
  showAssignee?: boolean;
  showStatus?: boolean;
}) {
  const late = task.overdue;
  const closed = task.status === "done" || task.status === "cancelled";
  return (
    <button
      type="button"
      draggable
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData("text/task", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onOpen(task)}
      className={cn(
        "block w-full cursor-grab rounded-2xl border bg-surface p-3 text-left shadow-soft transition hover:border-sun-300 active:cursor-grabbing",
        late ? "border-danger/40" : "border-line",
        task.status === "done" && "bg-success-soft/40",
      )}
    >
      <span className={cn("block text-[15px] font-semibold leading-snug", closed && "text-ink-muted line-through")}>{task.title}</span>
      <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted">
        {showStatus && task.status !== "open" && <StatusPill status={task.status} />}
        {!closed && <PriorityMark priority={task.priority} />}
        {task.dueDate && (
          <span className={cn(late && "font-semibold text-danger")}>
            {late ? "Late · " : ""}
            {formatDueDay(task.dueDate, today)}
            {task.dueTime && `, ${formatClock(task.dueTime)}`}
          </span>
        )}
        {task.steps.total > 0 && (
          <span className="inline-flex items-center gap-0.5 tabular">
            <ListChecks className="size-3.5" /> {task.steps.done}/{task.steps.total}
          </span>
        )}
        {task.comments > 0 && (
          <span className="inline-flex items-center gap-0.5 tabular">
            <MessageSquare className="size-3.5" /> {task.comments}
          </span>
        )}
        {task.files > 0 && (
          <span className="inline-flex items-center gap-0.5 tabular">
            <Paperclip className="size-3.5" /> {task.files}
          </span>
        )}
        {task.needsCheck && !closed && task.status !== "review" && <ShieldCheck className="size-3.5" aria-label="Checked before done" />}
        {task.tagLabel && <span className="rounded bg-cream px-1.5 font-semibold">{task.tagLabel}</span>}
      </span>
      {task.status === "waiting" && task.waitingReason && <span className="mt-1.5 block text-xs text-warning">Stuck: {task.waitingReason}</span>}
      {(showAssignee || task.eventTitle) && (
        <span className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
          {showAssignee && task.assignee && <Avatar name={task.assignee.name} className="size-5 text-[9px]" />}
          <span className="min-w-0 truncate">
            {[showAssignee ? (task.assignee?.name ?? "Anyone on the event") : null, task.eventTitle ?? task.clientName].filter(Boolean).join(" · ")}
          </span>
        </span>
      )}
    </button>
  );
}

/** A column that takes dropped cards. */
function Column({
  title,
  count,
  head,
  onDropTask,
  children,
  bar,
}: {
  title: React.ReactNode;
  count: number;
  head?: React.ReactNode;
  onDropTask?: (taskId: string) => void;
  children: React.ReactNode;
  bar?: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <section
      onDragOver={(e) => {
        if (!onDropTask) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const id = e.dataTransfer.getData("text/task");
        if (id && onDropTask) onDropTask(id);
      }}
      className={cn("flex w-72 shrink-0 flex-col rounded-3xl bg-cream/60 p-2.5 transition sm:w-[17.5rem]", over && "bg-sun-50 ring-2 ring-sun-300")}
    >
      {bar && <span className={cn("mx-1 mb-2 h-1 rounded-full", bar)} />}
      <header className="mb-2 px-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate font-bold">{title}</h3>
          <span className="text-sm font-semibold text-ink-muted tabular">{count}</span>
        </div>
        {head}
      </header>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </section>
  );
}

const BOARD_COLUMNS: TaskStatus[] = ["open", "doing", "waiting", "review", "done"];

/** Columns by where each task stands. Drag a card to move it. */
export function StatusBoard({ tasks, done, today, onOpen }: { tasks: TaskItem[]; done: TaskItem[]; today: string; onOpen: (t: TaskItem) => void }) {
  const { workspace } = useCurrentWorkspace();
  const move = useMoveAnyTask(workspace.id);
  const toast = useToast();
  const all = [...tasks, ...done];

  function drop(to: TaskStatus, id: string) {
    const task = all.find((t) => t.id === id);
    if (!task || task.status === to) return;
    let reason: string | undefined;
    if (to === "waiting") {
      reason = window.prompt(`What is "${task.title}" waiting on?`)?.trim() || undefined;
      if (!reason) return;
    }
    move.mutate(
      { id, status: to, reason },
      {
        onSuccess: () => toast(`Moved to ${TASK_STATUS_INFO[to].label}`),
        onError: (err) => toast(errorMessage(err), "error"),
      },
    );
  }

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {BOARD_COLUMNS.map((status) => {
        const list = status === "done" ? done : tasks.filter((t) => t.status === status);
        return (
          <Column key={status} title={TASK_STATUS_INFO[status].label} count={list.length} bar={STATUS_STYLE[status].bar} onDropTask={(id) => drop(status, id)}>
            {list.map((t) => (
              <TaskCard key={t.id} task={t} today={today} onOpen={onOpen} showAssignee />
            ))}
            {list.length === 0 && <p className="px-2 py-3 text-sm text-ink-subtle">{status === "done" ? "Nothing done this week yet" : "Nothing here"}</p>}
          </Column>
        );
      })}
    </div>
  );
}

/** One column per person: their load at a glance. Drag a card onto someone to give it to them. */
export function PeopleView({
  board,
  tasks,
  today,
  onOpen,
  onAddFor,
}: {
  board: PeopleBoard;
  tasks: TaskItem[];
  today: string;
  onOpen: (t: TaskItem) => void;
  onAddFor: (userId: string) => void;
}) {
  const { workspace, me } = useCurrentWorkspace();
  const update = useUpdateTask(workspace.id);
  const toast = useToast();

  function drop(userId: string, name: string, id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.assignee?.id === userId) return;
    update.mutate(
      { id, assigneeId: userId },
      {
        onSuccess: () => toast(`Given to ${userId === me.user.id ? "you" : name}`),
        onError: (err) => toast(errorMessage(err), "error"),
      },
    );
  }

  const unassigned = tasks.filter((t) => !t.assignee);
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
      {board.people.map((p) => {
        const list = tasks.filter((t) => t.assignee?.id === p.user.id);
        const name = p.user.id === me.user.id ? "You" : (p.user.name ?? "Team member");
        return (
          <Column
            key={p.user.id}
            count={list.length}
            onDropTask={(id) => drop(p.user.id, name, id)}
            title={
              <span className="flex items-center gap-2">
                <Avatar name={p.user.name} className="size-7 text-[10px]" />
                <span className="truncate">{name}</span>
              </span>
            }
            head={
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {p.late > 0 && <span className="rounded-full bg-danger-soft px-2 py-0.5 font-bold text-danger">{p.late} late</span>}
                {p.dueToday > 0 && <span className="rounded-full bg-sun-50 px-2 py-0.5 font-bold text-brand-strong">{p.dueToday} today</span>}
                {p.toCheck > 0 && <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 font-bold text-[#4338CA]">{p.toCheck} to check</span>}
                {p.stuck > 0 && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-bold text-warning">{p.stuck} stuck</span>}
                {p.offToday && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 font-bold text-ink-muted">
                    <CalendarOff className="size-3" /> Off today
                  </span>
                )}
                <span className="text-ink-muted">{p.doneThisWeek} done this week</span>
              </div>
            }
          >
            {list.map((t) => (
              <TaskCard key={t.id} task={t} today={today} onOpen={onOpen} showStatus />
            ))}
            <button
              type="button"
              onClick={() => onAddFor(p.user.id)}
              className="flex h-10 items-center justify-center gap-1 rounded-2xl border border-dashed border-line-strong text-sm font-semibold text-ink-muted hover:bg-surface hover:text-ink"
            >
              <Plus className="size-4" /> Give {name === "You" ? "yourself" : name.split(" ")[0]} a task
            </button>
          </Column>
        );
      })}
      {unassigned.length > 0 && (
        <Column title="Anyone on the event" count={unassigned.length}>
          {unassigned.map((t) => (
            <TaskCard key={t.id} task={t} today={today} onOpen={onOpen} showStatus />
          ))}
        </Column>
      )}
    </div>
  );
}
