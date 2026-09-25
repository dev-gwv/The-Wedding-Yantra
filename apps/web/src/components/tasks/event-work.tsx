"use client";

import { can, formatClock, ROLE_INFO } from "@wedding-yantra/core";
import { useApplyChecklist, useChecklist, useSaveEventTeam, useTasks, useTeam } from "@wedding-yantra/api-client/react";
import { saveEventTeamInput, type TaskItem, type WeddingEvent } from "@wedding-yantra/types";
import { Check, ListChecks, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Avatar, Card, GradientTile, NextStepCard, Notice, ProgressBar } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage, validate } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";
import { TaskRow } from "./task-row";
import { TaskSheet } from "./task-sheet";

/** Who works the event, what they do there and when they must reach. */
export function EventTeamCard({ event }: { event: WeddingEvent }) {
  const { workspace, me } = useCurrentWorkspace();
  const manage = can(workspace.role, "tasks.manage");
  const [editing, setEditing] = useState(false);
  if (!manage && event.team.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Team</h2>
        {manage && event.team.length > 0 && (
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-bold text-brand-strong hover:text-brand-deep">
            Change
          </button>
        )}
      </div>
      {event.team.length === 0 ? (
        <Card className="p-5">
          <p className="text-ink-muted">Choose who works this event. They see it in their day, with the time to reach.</p>
          <Button variant="secondary" className="mt-3" onClick={() => setEditing(true)}>
            <UsersRound className="size-4" /> Choose the team
          </Button>
        </Card>
      ) : (
        <Card className="divide-y divide-line overflow-hidden">
          {event.team.map((m) => (
            <div key={m.userId} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={m.name} className="size-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.name ?? "Team member"}
                  {m.userId === me.user.id && <span className="font-normal text-ink-muted"> (you)</span>}
                </p>
                {m.roleNote && <p className="truncate text-sm text-ink-muted">{m.roleNote}</p>}
              </div>
              {m.callTime && <span className="shrink-0 text-sm font-semibold tabular">Reach {formatClock(m.callTime)}</span>}
            </div>
          ))}
        </Card>
      )}
      {manage && (
        <Sheet open={editing} onClose={() => setEditing(false)} title="Who works this event" description="Tick the people on it. They'll see the event and its checklist.">
          {editing && <TeamForm event={event} onDone={() => setEditing(false)} />}
        </Sheet>
      )}
    </section>
  );
}

interface Pick {
  on: boolean;
  roleNote: string;
  callTime: string;
}

function TeamForm({ event, onDone }: { event: WeddingEvent; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const team = useTeam(workspace.id);
  const save = useSaveEventTeam(workspace.id, event.id);
  const toast = useToast();
  const [picks, setPicks] = useState<Record<string, Pick>>(() =>
    Object.fromEntries(event.team.map((m) => [m.userId, { on: true, roleNote: m.roleNote ?? "", callTime: m.callTime ?? "" }])),
  );
  const [error, setError] = useState<string | null>(null);

  const set = (userId: string, change: Partial<Pick>) =>
    setPicks((p) => ({ ...p, [userId]: { ...(p[userId] ?? { on: false, roleNote: "", callTime: "" }), ...change } }));

  async function submit() {
    const payload = {
      members: Object.entries(picks)
        .filter(([, p]) => p.on)
        .map(([userId, p]) => ({ userId, roleNote: p.roleNote, callTime: p.callTime })),
    };
    const check = validate(saveEventTeamInput, payload);
    if (check.errors) return setError(Object.values(check.errors)[0] ?? "Check the times");
    setError(null);
    try {
      await save.mutateAsync(payload);
      toast(payload.members.length ? `Team saved: ${payload.members.length} ${payload.members.length === 1 ? "person" : "people"}` : "Team cleared");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (team.isPending)
    return (
      <div className="flex justify-center py-10 text-brand">
        <Spinner />
      </div>
    );
  if (team.isError) return <Notice tone="danger">{errorMessage(team.error)}</Notice>;
  // The accountant keeps the books; everyone else can work an event.
  const members = team.data.members.filter((m) => m.role !== "accountant");

  return (
    <div className="space-y-4">
      <ul className="-mx-2 space-y-1">
        {members.map((m) => {
          const pick = picks[m.userId];
          const on = pick?.on ?? false;
          return (
            <li key={m.userId} className={cn("rounded-2xl px-2 py-1 transition", on && "bg-cream")}>
              <label className="flex cursor-pointer items-center gap-3 py-1.5">
                <input type="checkbox" checked={on} onChange={(e) => set(m.userId, { on: e.target.checked })} className="sr-only" />
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-lg border-2 transition",
                    on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface",
                  )}
                >
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <Avatar name={m.name} muted={!on} className="size-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {m.name ?? m.phone}
                    {m.isYou && <span className="font-normal text-ink-muted"> (you)</span>}
                  </span>
                  <span className="block text-xs text-ink-muted">{ROLE_INFO[m.role].label}</span>
                </span>
              </label>
              {on && (
                <div className="grid grid-cols-[1fr_8.5rem] gap-2 pb-2 pl-9">
                  <label className="min-w-0 text-xs font-semibold text-ink-muted">
                    Role here
                    <input
                      value={pick?.roleNote ?? ""}
                      onChange={(e) => set(m.userId, { roleNote: e.target.value })}
                      placeholder="e.g. Lead artist"
                      aria-label={`${m.name ?? "Their"} role at this event`}
                      maxLength={60}
                      className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm font-normal text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink-muted">
                    Reach by
                    <input
                      type="time"
                      value={pick?.callTime ?? ""}
                      onChange={(e) => set(m.userId, { callTime: e.target.value })}
                      aria-label={`When ${m.name ?? "they"} should reach`}
                      className="mt-1 h-10 w-full rounded-xl border border-line bg-surface px-2 text-sm font-normal text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
                    />
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {members.length <= 1 && (
        <p className="text-sm text-ink-muted">
          Only you so far. <Link href="/app/team" className="font-bold text-brand-strong">Invite your team</Link> to put them on events.
        </p>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" onClick={submit} loading={save.isPending}>
        Save team
      </Button>
    </div>
  );
}

/** The event's checklist and any other tasks for it, with progress. */
export function EventTasks({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  const works = can(workspace.role, "tasks.work");
  const manage = can(workspace.role, "tasks.manage");
  const tasks = useTasks(workspace.id, { eventId: event.id }, works);
  const checklist = useChecklist(workspace.id, manage);
  const apply = useApplyChecklist(workspace.id);
  const toast = useToast();
  const day = useBusinessDay();
  const [sheet, setSheet] = useState<{ task?: TaskItem } | null>(null);
  if (!works) return null;

  const today = day();
  // Keep the order steady while ticking: by due date, undated last.
  const list = [...(tasks.data ?? [])].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const done = list.filter((t) => t.done).length;
  const steps = checklist.data?.length ?? 0;
  const offerChecklist = manage && event.status !== "cancelled" && steps > 0 && !list.some((t) => t.fromChecklist);

  async function addChecklist() {
    try {
      const added = await apply.mutateAsync(event.id);
      toast(`${added.filter((t) => t.fromChecklist).length} steps added`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Checklist</h2>
        {list.length > 0 && (
          <span className="text-sm font-semibold text-ink-muted tabular">
            {done} of {list.length} done
          </span>
        )}
      </div>

      {tasks.isPending && (
        <div className="flex justify-center py-8 text-brand">
          <Spinner />
        </div>
      )}
      {tasks.isError && <Notice tone="danger">{errorMessage(tasks.error)}</Notice>}

      {offerChecklist && (
        <NextStepCard className="mb-3 p-5">
          <div className="flex items-start gap-4">
            <GradientTile icon={ListChecks} />
            <div className="min-w-0">
              <h3 className="font-display text-lg font-extrabold">Add your checklist</h3>
              <p className="mt-0.5 text-sm text-ink-muted">
                {steps} steps, each with a date counted from this event&apos;s functions.{" "}
                <Link href="/app/settings/checklist" className="font-semibold text-brand-strong">
                  Change the steps
                </Link>
              </p>
              <Button className="mt-3" onClick={addChecklist} loading={apply.isPending}>
                Add {steps} steps
              </Button>
            </div>
          </div>
        </NextStepCard>
      )}

      {list.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 pb-1 pt-4">
            <ProgressBar value={(done / list.length) * 100} label="Checklist progress" />
          </div>
          <ul className="divide-y divide-line">
            {list.map((t) => (
              <TaskRow key={t.id} task={t} today={today} show={{ assignee: true }} onOpen={(task) => setSheet({ task })} />
            ))}
          </ul>
        </Card>
      )}
      {tasks.data && list.length === 0 && !offerChecklist && (
        <Card className="p-5">
          <p className="text-ink-muted">Nothing to do for this event yet.</p>
        </Card>
      )}

      {event.status !== "cancelled" && (
        <Button variant="secondary" className="mt-3" onClick={() => setSheet({})}>
          <Plus className="size-4" /> Add a task
        </Button>
      )}
      <TaskSheet open={sheet !== null} onClose={() => setSheet(null)} task={sheet?.task} eventId={event.id} />
    </section>
  );
}
