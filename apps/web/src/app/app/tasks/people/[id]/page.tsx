"use client";

import { can, ROLE_INFO, timeAgo, type Role } from "@wedding-yantra/core";
import { usePersonTasks } from "@wedding-yantra/api-client/react";
import type { TaskItem, TaskUpdate } from "@wedding-yantra/types";
import { ChevronDown, History, Send } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Stat } from "@/components/tasks/daily-report";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { UpdatesTimeline } from "@/components/tasks/updates";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader, Pill } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/**
 * One person's work: what they're doing now, what's stuck or late, what's waiting for your
 * check, and their recent updates. Owners and managers open anyone; others only themselves.
 */
export default function PersonTasksPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace, me } = useCurrentWorkspace();
  const manages = can(workspace.role, "tasks.manage");
  const query = usePersonTasks(workspace.id, id);
  const [open, setOpen] = useState<{ task?: TaskItem; taskId?: string } | null>(
    null,
  );
  const [giving, setGiving] = useState(false);
  const back = manages ? (
    <BackLink href="/app/tasks/team" label="Team board" />
  ) : (
    <BackLink href="/app/my-day" label="My day" />
  );

  if (query.isPending) return <Splash />;
  if (query.isError)
    return (
      <>
        {back}
        <Notice tone="danger">{errorMessage(query.error)}</Notice>
      </>
    );

  const first = query.data.pages[0]!;
  const { person, counts, tasks, today } = first;
  const updates: TaskUpdate[] = query.data.pages.flatMap((p) => p.updates);
  const isMe = person.user.id === me.user.id;
  const firstName = (person.user.name ?? "Team member").split(/\s+/)[0];

  const openTasks = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  const doing = openTasks.filter((t) => t.status === "doing");
  const stuck = openTasks.filter((t) => t.status === "waiting");
  const check = openTasks.filter((t) => t.status === "review");
  const late = openTasks.filter(
    (t) =>
      t.overdue &&
      t.status !== "doing" &&
      t.status !== "waiting" &&
      t.status !== "review",
  );
  const todo = openTasks.filter((t) => t.status === "open" && !t.overdue);
  const done = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));

  // When each task in progress was started, from the updates.
  const startedAt = new Map<string, string>();
  for (const u of updates)
    if (
      u.action === "moved" &&
      u.meta.to === "doing" &&
      !startedAt.has(u.task.id)
    )
      startedAt.set(u.task.id, u.at);
  const handedAt = new Map<string, string>();
  for (const u of updates)
    if (
      (u.action === "submitted" ||
        (u.action === "moved" && u.meta.to === "review")) &&
      !handedAt.has(u.task.id)
    )
      handedAt.set(u.task.id, u.at);

  const row = (t: TaskItem, note?: string | null) => (
    <TaskRow
      key={t.id}
      task={t}
      today={today}
      show={{ event: true }}
      onOpen={(task) => setOpen({ task })}
      note={note}
    />
  );

  return (
    <>
      {back}
      <PageHeader
        title={
          isMe ? "Your tasks" : `${person.user.name ?? "Team member"}'s tasks`
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {[person.designation, ROLE_INFO[person.role as Role]?.label]
              .filter(Boolean)
              .join(" · ")}
            {person.offToday && <Pill>Off today</Pill>}
          </span>
        }
        action={
          manages && !isMe ? (
            <Button onClick={() => setGiving(true)}>
              <Send className="size-4" /> Give {firstName} a task
            </Button>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-3 gap-2 lg:grid-cols-6">
        <Stat label="Pending" value={counts.pending} />
        <Stat label="Doing now" value={counts.doing} tone="success" />
        <Stat label="Stuck" value={counts.stuck} tone="warning" />
        <Stat label="Late" value={counts.late} tone="danger" />
        <Stat
          label={isMe ? "Handed in" : "Waiting for your check"}
          value={counts.toCheck}
        />
        <Stat
          label="Done this week"
          value={counts.doneThisWeek}
          tone="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
        <div className="space-y-5">
          {openTasks.length === 0 && done.length === 0 && (
            <Card className="px-5 py-6 text-center text-ink-muted">
              {isMe
                ? "You have no open tasks."
                : `${firstName} has no open tasks.`}
            </Card>
          )}
          <Group title="Doing now" tasks={doing} tone="success">
            {doing.map((t) =>
              row(
                t,
                startedAt.has(t.id)
                  ? `Started ${timeAgo(startedAt.get(t.id)!)}`
                  : null,
              ),
            )}
          </Group>
          <Group title="Stuck" tasks={stuck} tone="warning">
            {stuck.map((t) =>
              row(t, `Stuck: ${t.waitingReason ?? "no reason given"}`),
            )}
          </Group>
          <Group title="Late" tasks={late} tone="danger">
            {late.map((t) => row(t))}
          </Group>
          <Group
            title={
              isMe ? "Handed in, waiting for a check" : "Waiting for your check"
            }
            tasks={check}
          >
            {check.map((t) =>
              row(
                t,
                handedAt.has(t.id)
                  ? `Handed in ${timeAgo(handedAt.get(t.id)!)}`
                  : "Handed in",
              ),
            )}
          </Group>
          <Group title="To do" tasks={todo}>
            {todo.map((t) => row(t))}
          </Group>
          {done.length > 0 && (
            <DoneGroup tasks={done}>
              {done.map((t) =>
                row(t, t.doneAt ? `Finished ${timeAgo(t.doneAt)}` : null),
              )}
            </DoneGroup>
          )}
        </div>

        <Card className="p-5 lg:sticky lg:top-6">
          <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-extrabold">
            <History className="size-5 text-brand-strong" /> Recent updates
          </h2>
          <p className="mb-4 text-sm text-ink-muted">
            {isMe
              ? "What you did on your tasks"
              : `What ${firstName} did, and what was done on ${firstName}'s tasks`}
            , the last two weeks.
          </p>
          {updates.length === 0 ? (
            <p className="text-sm text-ink-muted">No updates yet.</p>
          ) : (
            <UpdatesTimeline
              updates={updates}
              today={today}
              meId={me.user.id}
              onOpenTask={(taskId) => setOpen({ taskId })}
            />
          )}
          {query.hasNextPage && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Show older
            </Button>
          )}
        </Card>
      </div>

      <TaskSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        task={open?.task}
        taskId={open?.taskId}
      />
      <TaskSheet
        open={giving}
        onClose={() => setGiving(false)}
        assigneeId={person.user.id}
        title={`Give ${firstName} a task`}
      />
    </>
  );
}

function Group({
  title,
  tasks,
  tone,
  children,
}: {
  title: string;
  tasks: TaskItem[];
  tone?: "danger" | "warning" | "success";
  children: ReactNode;
}) {
  if (tasks.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-display text-base font-extrabold">
        {title}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold tabular",
            tone === "danger"
              ? "bg-danger-soft text-danger"
              : tone === "warning"
                ? "bg-sun-100 text-brand-strong"
                : tone === "success"
                  ? "bg-success-soft text-success"
                  : "bg-cream text-ink-muted",
          )}
        >
          {tasks.length}
        </span>
      </h2>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">{children}</ul>
      </Card>
    </section>
  );
}

function DoneGroup({
  tasks,
  children,
}: {
  tasks: TaskItem[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 flex items-center gap-2 font-display text-base font-extrabold"
      >
        Done this week{" "}
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success tabular">
          {tasks.length}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-ink-subtle transition",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">{children}</ul>
        </Card>
      )}
    </section>
  );
}
