"use client";

import { can, timeAgo } from "@wedding-yantra/core";
import { useTasks } from "@wedding-yantra/api-client/react";
import type { TaskItem } from "@wedding-yantra/types";
import { ListChecks, Lock, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { TaskGroups, TaskRow } from "@/components/tasks/task-row";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

type View = "mine" | "team";

function TasksScreen() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const manage = can(workspace.role, "tasks.manage");
  const view: View = manage && params.get("view") === "team" ? "team" : "mine";
  const [sheet, setSheet] = useState<{ task?: TaskItem } | null>(null);

  if (!can(workspace.role, "tasks.work")) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Tasks" />
        <Card>
          <EmptyState icon={Lock} title="Tasks aren't part of your role">
            The owner, managers, staff and freelancers get tasks here.
          </EmptyState>
        </Card>
      </>
    );
  }

  const setView = (v: View) => router.replace(v === "mine" ? pathname : `${pathname}?view=${v}`, { scroll: false });

  return (
    <>
      <PageHeader
        title="Tasks"
        action={
          <Button onClick={() => setSheet({})}>
            <Plus className="size-4" strokeWidth={2.5} /> {manage ? "New task" : "Add task"}
          </Button>
        }
      />
      {manage && (
        <div className="mb-6 inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Whose tasks">
          {(
            [
              ["mine", "Mine"],
              ["team", "Team"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "h-10 rounded-xl px-6 text-sm font-bold transition",
                view === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <TaskList key={view} scope={view} onOpen={(task) => setSheet({ task })} />
      <TaskSheet open={sheet !== null} onClose={() => setSheet(null)} task={sheet?.task} />
    </>
  );
}

function TaskList({ scope, onOpen }: { scope: View; onOpen: (task: TaskItem) => void }) {
  const { workspace, me } = useCurrentWorkspace();
  const open = useTasks(workspace.id, { scope, status: "open" });
  const [showDone, setShowDone] = useState(false);
  const done = useTasks(workspace.id, { scope, status: "done" }, showDone);
  const [person, setPerson] = useState("all");
  const today = useBusinessDay()();

  if (open.isPending)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner />
      </div>
    );
  if (open.isError) return <Notice tone="danger">{errorMessage(open.error)}</Notice>;

  // The team view filters by person: only people who have open tasks are offered.
  const people = new Map<string, string>();
  for (const t of open.data) people.set(t.assignee?.id ?? "none", t.assignee ? (t.assignee.id === me.user.id ? "You" : (t.assignee.name ?? "Team member")) : "Anyone on the event");
  const chosen = person !== "all" && people.has(person) ? person : "all";
  const list = chosen === "all" ? open.data : open.data.filter((t) => (t.assignee?.id ?? "none") === chosen);
  const late = open.data.filter((t) => t.overdue).length;

  return (
    <div className="space-y-6">
      {scope === "team" && people.size > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Whose tasks">
          {[["all", `Everyone${late ? ` · ${late} late` : ""}`] as const, ...[...people.entries()]].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={chosen === key}
              onClick={() => setPerson(key)}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition",
                chosen === key ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={ListChecks} title={scope === "team" ? "No open tasks in the team" : "Nothing on your list"}>
            {scope === "team"
              ? "Tasks you give the team, and each event's checklist, show up here until they're done."
              : "Tasks given to you, and ones you add for yourself, show up here. Tick them off as you go."}
          </EmptyState>
        </Card>
      ) : (
        <TaskGroups tasks={list} today={today} show={{ event: true, assignee: scope === "team" }} onOpen={onOpen} />
      )}

      <section>
        <button
          type="button"
          onClick={() => setShowDone((s) => !s)}
          aria-expanded={showDone}
          className="text-sm font-bold text-brand-strong hover:text-brand-deep"
        >
          {showDone ? "Hide done tasks" : "Show done tasks"}
        </button>
        {showDone && (
          <div className="mt-3">
            {done.isPending && (
              <div className="flex justify-center py-8 text-brand">
                <Spinner />
              </div>
            )}
            {done.isError && <Notice tone="danger">{errorMessage(done.error)}</Notice>}
            {done.data && done.data.length === 0 && <p className="text-sm text-ink-muted">Nothing ticked off yet.</p>}
            {done.data && done.data.length > 0 && (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {done.data.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      today={today}
                      show={{ event: true, assignee: scope === "team" }}
                      onOpen={onOpen}
                      note={t.doneAt && `Done ${t.doneBy?.name && t.doneBy.id !== me.user.id ? `by ${t.doneBy.name} ` : ""}${timeAgo(t.doneAt)}`}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<Splash />}>
      <TasksScreen />
    </Suspense>
  );
}
