"use client";

import { can, formatDueDay, timeAgo } from "@wedding-yantra/core";
import { usePeopleBoard, useStopTaskRepeat, useTaskRepeats, useTasks } from "@wedding-yantra/api-client/react";
import type { TaskItem, TaskListQuery } from "@wedding-yantra/types";
import { AlarmClock, CalendarDays, CircleCheck, CirclePause, Columns3, ListChecks, Lock, Plus, Repeat, ShieldCheck, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useState } from "react";
import { useOptionList } from "@/components/app/option-picker";
import { Chips, MoneyTile, SearchBox } from "@/components/money/list-kit";
import { PeopleView, StatusBoard } from "@/components/tasks/boards";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { TaskGroups, TaskRow } from "@/components/tasks/task-row";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

type Tab = "mine" | "given" | "team";
type TeamView = "people" | "board" | "list";
type StateFilter = "all" | "doing" | "waiting" | "review";

const VIEW_KEY = "wy.tasks.view";

function TasksScreen() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const manage = can(workspace.role, "tasks.manage");
  const asked = params.get("view");
  const tab: Tab = manage && (asked === "team" || asked === "given") ? asked : "mine";
  const openId = params.get("open");
  const [sheet, setSheet] = useState<{ task?: TaskItem; assigneeId?: string } | null>(null);

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

  /** Changes some search params, keeping the rest. */
  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  const open = (task: TaskItem) => setSheet({ task });
  const closeSheet = () => {
    setSheet(null);
    if (openId) setParams({ open: null });
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        action={
          <Button onClick={() => setSheet({})}>
            <Plus className="size-4" strokeWidth={2.5} /> {manage ? "Give a task" : "Add task"}
          </Button>
        }
      />
      {manage && (
        <div className="mb-6 inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Whose tasks">
          {(
            [
              ["mine", "Mine"],
              ["given", "Given by me"],
              ["team", "Team"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setParams({ view: key === "mine" ? null : key, state: null, who: null, due: null })}
              className={cn(
                "h-10 rounded-xl px-4 text-sm font-bold transition sm:px-6",
                tab === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "team" ? (
        <TeamTasks params={params} setParams={setParams} onOpen={open} onAddFor={(assigneeId) => setSheet({ assigneeId })} />
      ) : (
        <TaskList key={tab} scope={tab} params={params} setParams={setParams} onOpen={open} />
      )}
      <TaskSheet
        open={sheet !== null || !!openId}
        onClose={closeSheet}
        task={sheet?.task}
        taskId={sheet?.task ? undefined : (openId ?? undefined)}
        assigneeId={sheet?.assigneeId}
      />
    </>
  );
}

type Params = ReturnType<typeof useSearchParams>;
type SetParams = (patch: Record<string, string | null>) => void;

const STATE_CHIPS: [StateFilter, string][] = [
  ["all", "All open"],
  ["doing", "Doing"],
  ["waiting", "Stuck"],
  ["review", "To check"],
];

/** Mine, or the ones I gave others: grouped by day, with status chips and search. */
function TaskList({ scope, params, setParams, onOpen }: { scope: "mine" | "given"; params: Params; setParams: SetParams; onOpen: (task: TaskItem) => void }) {
  const { me } = useCurrentWorkspace();
  const { workspace } = useCurrentWorkspace();
  const state = (params.get("state") as StateFilter | null) ?? "all";
  const q = params.get("q") ?? "";
  const onSearch = useCallback((v: string) => setParams({ q: v || null }), [setParams]);
  const query: TaskListQuery = { scope, status: "open", ...(state !== "all" ? { state } : {}), ...(q ? { q } : {}) };
  const open = useTasks(workspace.id, query);
  const [showDone, setShowDone] = useState(false);
  const done = useTasks(workspace.id, { scope, status: "done" }, showDone);
  const today = useBusinessDay()();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Chips options={STATE_CHIPS} value={state} onChange={(v) => setParams({ state: v === "all" ? null : v })} label="Where it stands" quiet />
        <SearchBox value={q} onChange={onSearch} placeholder="Search tasks" />
      </div>
      {open.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {open.isError && <Notice tone="danger">{errorMessage(open.error)}</Notice>}
      {open.data && open.data.length === 0 && (
        <Card>
          <EmptyState icon={ListChecks} title={q || state !== "all" ? "Nothing matches" : scope === "given" ? "Nothing waiting on others" : "Nothing on your list"}>
            {q || state !== "all"
              ? "Try another filter or search."
              : scope === "given"
                ? "Tasks you give the team show here until they're done, so you can follow up."
                : "Tasks given to you, and ones you add for yourself, show up here. Tick them off as you go."}
          </EmptyState>
        </Card>
      )}
      {open.data && open.data.length > 0 && <TaskGroups tasks={open.data} today={today} show={{ event: true, assignee: scope === "given" }} onOpen={onOpen} />}

      {scope === "mine" && <Repeats scope="mine" today={today} />}

      <section>
        <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone} className="text-sm font-bold text-brand-strong hover:text-brand-deep">
          {showDone ? "Hide done tasks" : "Show done tasks"}
        </button>
        {showDone && (
          <div className="mt-3">
            {done.isPending && (
              <div className="flex justify-center py-8 text-brand">
                <Spinner />
              </div>
            )}
            {done.data && done.data.length === 0 && <p className="text-sm text-ink-muted">Nothing ticked off yet.</p>}
            {done.data && done.data.length > 0 && (
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {done.data.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      today={today}
                      show={{ event: true, assignee: scope === "given" }}
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

/** The owner's view of everyone's work: totals, then people, a status board, or a list. */
function TeamTasks({ params, setParams, onOpen, onAddFor }: { params: Params; setParams: SetParams; onOpen: (t: TaskItem) => void; onAddFor: (userId: string) => void }) {
  const { workspace } = useCurrentWorkspace();
  const today = useBusinessDay()();
  const board = usePeopleBoard(workspace.id);
  const [view, setViewState] = useState<TeamView>(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved === "board" || saved === "list" ? saved : "people";
    } catch {
      return "people";
    }
  });
  const setView = (v: TeamView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private window */
    }
  };
  const state = params.get("state") as TaskListQuery["state"] | null;
  const due = params.get("due") as TaskListQuery["due"] | null;
  const who = params.get("who");
  const priority = params.get("priority") as TaskListQuery["priority"] | null;
  const tag = params.get("tag");
  const q = params.get("q") ?? "";
  const onSearch = useCallback((v: string) => setParams({ q: v || null }), [setParams]);
  const { active: tags } = useOptionList("task_tag");

  const query: TaskListQuery = {
    scope: "team",
    status: "open",
    ...(state ? { state } : {}),
    ...(due ? { due } : {}),
    ...(who ? { assigneeId: who } : {}),
    ...(priority ? { priority } : {}),
    ...(tag ? { tag } : {}),
    ...(q ? { q } : {}),
  };
  const tasks = useTasks(workspace.id, query);
  const done = useTasks(workspace.id, { scope: "team", state: "done", ...(who ? { assigneeId: who } : {}) }, view === "board");
  const weekAgo = useBusinessDay()(-7);
  const doneThisWeek = (done.data ?? []).filter((t) => t.doneAt && t.doneAt.slice(0, 10) >= weekAgo);
  const totals = board.data?.totals;
  const filtered = !!(state || due || who || priority || tag || q);
  const toggle = (key: string, value: string, current: string | null) => setParams({ [key]: current === value ? null : value });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MoneyTile label="Late" value={totals ? String(totals.late) : "…"} icon={AlarmClock} tone={totals?.late ? "danger" : undefined} active={due === "overdue"} onClick={() => toggle("due", "overdue", due ?? null)} />
        <MoneyTile label="Due today" value={totals ? String(totals.dueToday) : "…"} icon={CalendarDays} active={due === "today"} onClick={() => toggle("due", "today", due ?? null)} />
        <MoneyTile
          label="Waiting for your check"
          value={totals ? String(totals.toCheck) : "…"}
          icon={ShieldCheck}
          tone={totals?.toCheck ? "brand" : undefined}
          active={state === "review"}
          onClick={() => toggle("state", "review", state ?? null)}
        />
        <MoneyTile label="Stuck" value={totals ? String(totals.stuck) : "…"} icon={CirclePause} active={state === "waiting"} onClick={() => toggle("state", "waiting", state ?? null)} />
        <MoneyTile label="Done this week" value={totals ? String(totals.doneThisWeek) : "…"} icon={CircleCheck} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-cream p-1" role="tablist" aria-label="Show as">
          {(
            [
              ["people", "People", Users],
              ["board", "Board", Columns3],
              ["list", "List", ListChecks],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold", view === key ? "bg-surface shadow-soft" : "text-ink-muted")}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        {board.data && (
          <select
            value={who ?? ""}
            onChange={(e) => setParams({ who: e.target.value || null })}
            aria-label="Whose tasks"
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold"
          >
            <option value="">Everyone</option>
            {board.data.people.map((p) => (
              <option key={p.user.id} value={p.user.id}>
                {p.user.name ?? "Team member"}
              </option>
            ))}
          </select>
        )}
        <select
          value={priority ?? ""}
          onChange={(e) => setParams({ priority: e.target.value || null })}
          aria-label="Priority"
          className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold"
        >
          <option value="">Any priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        {tags.length > 0 && (
          <select value={tag ?? ""} onChange={(e) => setParams({ tag: e.target.value || null })} aria-label="Tag" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-semibold">
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        {filtered && (
          <button type="button" onClick={() => setParams({ state: null, due: null, who: null, priority: null, tag: null, q: null })} className="text-sm font-semibold text-brand-strong">
            Clear filters
          </button>
        )}
      </div>
      <SearchBox value={q} onChange={onSearch} placeholder="Search by task, event or client" />

      {(tasks.isPending || board.isPending) && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {tasks.isError && <Notice tone="danger">{errorMessage(tasks.error)}</Notice>}
      {tasks.data && board.data && (
        <>
          {view === "people" && (
            <PeopleView board={who ? { ...board.data, people: board.data.people.filter((p) => p.user.id === who) } : board.data} tasks={tasks.data} today={today} onOpen={onOpen} onAddFor={onAddFor} />
          )}
          {view === "board" && <StatusBoard tasks={tasks.data} done={doneThisWeek} today={today} onOpen={onOpen} />}
          {view === "list" &&
            (tasks.data.length === 0 ? (
              <Card>
                <EmptyState icon={ListChecks} title={filtered ? "Nothing matches" : "No open tasks in the team"}>
                  {filtered ? "Try another filter or search." : "Tasks you give the team, and each event's checklist, show up here until they're done."}
                </EmptyState>
              </Card>
            ) : (
              <TaskGroups tasks={tasks.data} today={today} show={{ event: true, assignee: true }} onOpen={onOpen} />
            ))}
          {view !== "list" && <p className="text-xs text-ink-muted">Drag a card to another column to {view === "people" ? "give it to someone else" : "move it along"}. Tap a card to open it.</p>}
        </>
      )}
      <Repeats scope="team" today={today} />
    </div>
  );
}

/** Rules that make a task on each of their days. */
function Repeats({ scope, today }: { scope: "mine" | "team"; today: string }) {
  const { workspace, me } = useCurrentWorkspace();
  const manage = can(workspace.role, "tasks.manage");
  const rules = useTaskRepeats(workspace.id, scope);
  const stop = useStopTaskRepeat(workspace.id);
  const toast = useToast();
  if (!rules.data || rules.data.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-extrabold">
        <Repeat className="size-4 text-brand-strong" /> Repeating
      </h2>
      <Card className="divide-y divide-line overflow-hidden">
        {rules.data.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <div className="min-w-48 flex-1">
              <p className="font-semibold">{r.title}</p>
              <p className="text-sm text-ink-muted">
                {r.label}
                {r.nextDate && ` · Next: ${formatDueDay(r.nextDate, today)}`}
                {scope === "team" && ` · ${r.assignee.id === me.user.id ? "You" : (r.assignee.name ?? "Team member")}`}
              </p>
            </div>
            {(manage || r.assignee.id === me.user.id || r.createdBy?.id === me.user.id) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await stop.mutateAsync(r.id);
                    toast(`Stopped: ${r.title}`);
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
              >
                Stop
              </Button>
            )}
          </div>
        ))}
      </Card>
    </section>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={<Splash />}>
      <TasksScreen />
    </Suspense>
  );
}
