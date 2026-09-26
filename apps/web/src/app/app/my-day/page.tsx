"use client";

import { dayReportText, formatClock, formatDate, formatDueDay, whatsappLink } from "@wedding-yantra/core";
import { useMoveAnyTask, useMyDay, useSetTaskDone, useSnoozeAnyTask } from "@wedding-yantra/api-client/react";
import type { MyDay, TaskItem } from "@wedding-yantra/types";
import {
  BellRing,
  CalendarDays,
  CalendarClock,
  Check,
  ChevronDown,
  CirclePause,
  Copy,
  Eye,
  ListChecks,
  MessageCircle,
  MessageSquare,
  Play,
  Sparkles,
  Sunset,
  Undo2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PriorityMark, StatusPill } from "@/components/tasks/task-bits";
import { TaskSheet } from "@/components/tasks/task-sheet";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { pushState } from "@/lib/push";

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The team member's day, in the order to work it: events, what's late, what's due,
 * what's waiting on you, then the week. Each task has its next step a tap away.
 */
export default function MyDayPage() {
  const { workspace, me } = useCurrentWorkspace();
  const day = useMyDay(workspace.id);
  const [open, setOpen] = useState<TaskItem | null>(null);
  const [wrap, setWrap] = useState(false);

  if (day.isPending) return <Splash />;
  if (day.isError) return <Notice tone="danger">{errorMessage(day.error)}</Notice>;
  const d = day.data;
  const first = me.user.name?.split(/\s+/)[0];
  const todayCount = d.overdue.length + d.dueToday.length + d.sentBack.length;
  const tomorrow = addDays(d.today, 1);

  return (
    <>
      <PageHeader
        title={`${greeting()}${first ? `, ${first}` : ""}`}
        subtitle={
          <>
            {formatDate(d.today)} ·{" "}
            {todayCount === 0 ? "nothing due today" : `${todayCount} task${todayCount === 1 ? "" : "s"} for today`}
            {d.doneToday.length > 0 && ` · ${d.doneToday.length} done`}
          </>
        }
        action={
          <Button variant="secondary" onClick={() => setWrap(true)}>
            <Sunset className="size-4" /> Done for the day
          </Button>
        }
      />
      <PushNudge />

      <div className="space-y-7">
        {d.events.length > 0 && (
          <Section title="Events" count={d.events.length}>
            <Card className="divide-y divide-line overflow-hidden">
              {d.events.map((e) => {
                const on = e.startDate !== null && e.startDate <= d.today && (e.endDate ?? e.startDate) >= d.today;
                return (
                  <Link key={e.id} href={`/app/events/${e.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-cream sm:px-5">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", on ? "bg-gradient-primary text-on-brand" : "bg-cream text-brand-strong")}>
                      <CalendarDays className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{e.title}</span>
                      <span className="block truncate text-sm text-ink-muted">
                        {on ? "Today" : formatDueDay(e.startDate!, d.today)}
                        {e.roleNote && ` · ${e.roleNote}`}
                      </span>
                    </span>
                    {e.callTime && (
                      <span className="shrink-0 text-right text-sm leading-tight">
                        <span className="block text-xs text-ink-muted">Reach</span>
                        <span className="font-bold tabular">{formatClock(e.callTime)}</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </Card>
          </Section>
        )}

        {d.overdue.length > 0 && (
          <Section title="Late" count={d.overdue.length} tone="danger">
            <TaskList tasks={d.overdue} today={d.today} onOpen={setOpen} snoozeTo={d.today} />
          </Section>
        )}

        <Section title="Today" count={d.dueToday.length}>
          {d.dueToday.length ? (
            <TaskList tasks={d.dueToday} today={d.today} onOpen={setOpen} snoozeTo={tomorrow} />
          ) : (
            <Card className="flex items-center gap-3 px-5 py-4 text-sm text-ink-muted">
              <Sparkles className="size-5 text-brand" />
              {d.overdue.length ? "Nothing else due today: clear the late ones first." : "Nothing due today."}
            </Card>
          )}
        </Section>

        {(d.sentBack.length > 0 || d.toCheck.length > 0) && (
          <Section title="Waiting on you" count={d.sentBack.length + d.toCheck.length}>
            {d.sentBack.length > 0 && <TaskList tasks={d.sentBack} today={d.today} onOpen={setOpen} note={(t) => <SentBackNote task={t} />} />}
            {d.toCheck.length > 0 && (
              <div className={cn(d.sentBack.length > 0 && "mt-3")}>
                <TaskList tasks={d.toCheck} today={d.today} onOpen={setOpen} check />
              </div>
            )}
          </Section>
        )}

        {d.upcoming.length > 0 && (
          <Section title="This week" count={d.upcoming.length}>
            <TaskList tasks={d.upcoming} today={d.today} onOpen={setOpen} />
          </Section>
        )}

        {d.noDate.length > 0 && <Folded title="No date" tasks={d.noDate} today={d.today} onOpen={setOpen} />}
        {d.handedIn.length > 0 && <Folded title="Handed in, waiting for a check" tasks={d.handedIn} today={d.today} onOpen={setOpen} />}

        {todayCount + d.upcoming.length + d.noDate.length + d.events.length + d.toCheck.length === 0 && (
          <EmptyState icon={Sparkles} title="A clear day">
            No tasks on your list. When someone gives you one, it shows up here and on your phone.
          </EmptyState>
        )}
      </div>

      <TaskSheet open={open !== null} onClose={() => setOpen(null)} task={open ?? undefined} />
      <DayWrap open={wrap} onClose={() => setWrap(false)} day={d} tomorrow={tomorrow} name={me.user.name} />
    </>
  );
}

function Section({ title, count, tone, children }: { title: string; count: number; tone?: "danger"; children: ReactNode }) {
  return (
    <section>
      <h2 className={cn("mb-2 flex items-baseline gap-2 px-1 font-display text-lg font-extrabold", tone === "danger" && "text-danger")}>
        {title}
        {count > 0 && <span className="text-sm font-bold text-ink-muted tabular">{count}</span>}
      </h2>
      {children}
    </section>
  );
}

function Folded({ title, tasks, today, onOpen }: { title: string; tasks: TaskItem[]; today: string; onOpen: (t: TaskItem) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setShown(!shown)} aria-expanded={shown} className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-ink-muted hover:text-ink">
        <ChevronDown className={cn("size-4 transition", shown && "rotate-180")} />
        {title} <span className="tabular">{tasks.length}</span>
      </button>
      {shown && <TaskList tasks={tasks} today={today} onOpen={onOpen} />}
    </section>
  );
}

function SentBackNote({ task }: { task: TaskItem }) {
  const reason = task.lastSubmission?.reason;
  return (
    <span className="mt-1.5 flex items-start gap-1.5 text-sm text-warning">
      <Undo2 className="mt-0.5 size-3.5 shrink-0" />
      <span>Sent back{reason ? `: ${reason}` : ""}</span>
    </span>
  );
}

/** Tasks as rows, each with its next step as a button. */
function TaskList({
  tasks,
  today,
  onOpen,
  snoozeTo,
  check,
  note,
}: {
  tasks: TaskItem[];
  today: string;
  onOpen: (t: TaskItem) => void;
  /** Offer "Tomorrow" (or "Today" for late ones), moving the date there */
  snoozeTo?: string;
  /** Work handed in to you: the step is to check it */
  check?: boolean;
  note?: (t: TaskItem) => ReactNode;
}) {
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {tasks.map((t) => (
        <DayRow key={t.id} task={t} today={today} onOpen={onOpen} snoozeTo={snoozeTo} check={check} note={note?.(t)} />
      ))}
    </Card>
  );
}

function DayRow({
  task,
  today,
  onOpen,
  snoozeTo,
  check,
  note,
}: {
  task: TaskItem;
  today: string;
  onOpen: (t: TaskItem) => void;
  snoozeTo?: string;
  check?: boolean;
  note?: ReactNode;
}) {
  const { workspace } = useCurrentWorkspace();
  const move = useMoveAnyTask(workspace.id);
  const done = useSetTaskDone(workspace.id);
  const snooze = useSnoozeAnyTask(workspace.id);
  const toast = useToast();
  const busy = move.isPending || done.isPending || snooze.isPending;
  const fail = (err: unknown) => toast(errorMessage(err), "error");
  const late = task.overdue;
  // "Today" for a late task only makes sense when its date is before today.
  const canSnooze = snoozeTo && (!task.dueDate || snoozeTo > task.dueDate);

  const pill = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition disabled:opacity-60";
  let primary: ReactNode = null;
  if (check) {
    primary = (
      <button type="button" className={cn(pill, "bg-[#EEF2FF] text-[#4338CA] hover:bg-[#E0E7FF]")} onClick={() => onOpen(task)}>
        <Eye className="size-3.5" /> Check it
      </button>
    );
  } else if (task.status === "waiting") {
    primary = (
      <button type="button" disabled={busy} className={cn(pill, "bg-cream text-ink hover:bg-sun-100")} onClick={() => move.mutate({ id: task.id, status: "doing" }, { onError: fail })}>
        <Play className="size-3.5" /> Back to work
      </button>
    );
  } else if (task.needsCheck) {
    primary = (
      <button type="button" className={cn(pill, "bg-gradient-primary text-on-brand")} onClick={() => onOpen(task)}>
        <Upload className="size-3.5" /> Hand in
      </button>
    );
  } else {
    primary = (
      <button
        type="button"
        disabled={busy}
        className={cn(pill, "bg-gradient-primary text-on-brand")}
        onClick={() => done.mutate({ id: task.id, done: true }, { onSuccess: () => toast(`Done: ${task.title}`), onError: fail })}
      >
        <Check className="size-3.5" strokeWidth={3} /> Done
      </button>
    );
  }

  return (
    <div className={cn("px-4 py-3.5 sm:px-5", late && "bg-danger-soft/30")}>
      <button type="button" onClick={() => onOpen(task)} className="block w-full text-left">
        <span className="block font-bold leading-snug">{task.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted">
          {task.status !== "open" && <StatusPill status={task.status} />}
          <PriorityMark priority={task.priority} />
          {task.dueDate && (
            <span className={cn(late && "font-semibold text-danger")}>
              {late ? "Late · " : ""}
              {formatDueDay(task.dueDate, today)}
              {task.dueTime && `, ${formatClock(task.dueTime)}`}
            </span>
          )}
          {check && task.assignee && <span>From {task.assignee.name?.split(/\s+/)[0] ?? "Team member"}</span>}
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
          {(task.eventTitle ?? task.clientName) && <span className="truncate">{task.eventTitle ?? task.clientName}</span>}
        </span>
        {task.status === "waiting" && task.waitingReason && <span className="mt-1 block text-xs text-warning">Stuck: {task.waitingReason}</span>}
        {note}
      </button>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {primary}
        {!check && task.status === "open" && (
          <button type="button" disabled={busy} className={cn(pill, "border border-line bg-surface text-ink hover:bg-cream")} onClick={() => move.mutate({ id: task.id, status: "doing" }, { onError: fail })}>
            <Play className="size-3.5" /> Start
          </button>
        )}
        {!check && canSnooze && (
          <button
            type="button"
            disabled={busy}
            className={cn(pill, "border border-line bg-surface text-ink hover:bg-cream")}
            onClick={() =>
              snooze.mutate(
                { id: task.id, to: snoozeTo!, reason: null },
                { onSuccess: () => toast(`Moved to ${formatDueDay(snoozeTo!, today).toLowerCase()}`), onError: fail },
              )
            }
          >
            <CalendarClock className="size-3.5" /> {snoozeTo === today ? "Do today" : "Tomorrow"}
          </button>
        )}
        {!check && (task.status === "open" || task.status === "doing") && (
          <button
            type="button"
            disabled={busy}
            className={cn(pill, "text-ink-muted hover:bg-cream hover:text-ink")}
            title="I'm stuck"
            onClick={() => {
              const reason = window.prompt(`What is "${task.title}" waiting on?`)?.trim();
              if (reason) move.mutate({ id: task.id, status: "waiting", reason }, { onSuccess: () => toast("Marked as stuck. Whoever gave it will know."), onError: fail });
            }}
          >
            <CirclePause className="size-3.5" />
            <span className="sr-only sm:not-sr-only">Stuck</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Asks once, gently, from My Day: the one place staff open every day. */
function PushNudge() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    let hidden = false;
    try {
      hidden = window.localStorage.getItem("wy.push-nudge") === "hidden";
    } catch {
      // Storage blocked: ask anyway.
    }
    if (!hidden) void pushState().then((s) => live && setShow(s === "off" || s === "needs-install"));
    return () => {
      live = false;
    };
  }, []);
  if (!show) return null;
  return (
    <Card className="mb-6 flex flex-wrap items-center gap-4 p-4 sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sun-50 text-brand-strong">
        <BellRing className="size-5" />
      </span>
      <span className="min-w-[13rem] flex-1">
        <span className="block font-bold">Know the moment a task comes in</span>
        <span className="block text-sm text-ink-muted">Get new tasks, reminders and your 8 am plan on this phone.</span>
      </span>
      <span className="flex w-full gap-2 sm:w-auto">
        <ButtonLink href="/app/notifications?tab=settings" size="sm">
          Turn on alerts
        </ButtonLink>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            try {
              window.localStorage.setItem("wy.push-nudge", "hidden");
            } catch {
              // Storage blocked: hidden for now only.
            }
            setShow(false);
          }}
        >
          Not now
        </Button>
      </span>
    </Card>
  );
}

/** "Done for the day": what you finished, what's left, tomorrow; ready to send to whoever you report to. */
function DayWrap({ open, onClose, day, tomorrow, name }: { open: boolean; onClose: () => void; day: MyDay; tomorrow: string; name: string | null }) {
  const toast = useToast();
  const left = [...day.overdue, ...day.dueToday, ...day.sentBack];
  const next = day.upcoming.filter((t) => t.dueDate === tomorrow);
  const text = dayReportText({
    name,
    date: formatDate(day.today),
    done: day.doneToday.map((t) => (t.status === "review" ? `${t.title} (handed in)` : t.title)),
    left: left.map((t) => t.title),
    tomorrow: next.map((t) => t.title),
  });

  return (
    <Sheet open={open} onClose={onClose} title="Done for the day" description={formatDate(day.today)}>
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat value={day.doneToday.length} label="Done today" tone="text-success" />
          <Stat value={left.length} label="Still open" tone={left.length ? "text-danger" : "text-ink"} />
          <Stat value={next.length} label="Tomorrow" tone="text-ink" />
        </div>
        <WrapList title="Done" empty="Nothing ticked off today" items={day.doneToday.map((t) => (t.status === "review" ? `${t.title} · handed in` : t.title))} done />
        {left.length > 0 && <WrapList title="Still open" items={left.map((t) => t.title)} />}
        {next.length > 0 && <WrapList title="Tomorrow" items={next.map((t) => t.title)} />}
        <div className="flex flex-wrap gap-2 pt-1">
          <ButtonLink href={whatsappLink(text)} target="_blank" rel="noreferrer">
            <MessageCircle className="size-4" /> Send on WhatsApp
          </ButtonLink>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                ?.writeText(text)
                .then(() => toast("Copied"))
                .catch(() => toast("Couldn't copy", "error"))
            }
          >
            <Copy className="size-4" /> Copy
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="rounded-2xl bg-cream px-2 py-3">
      <p className={cn("font-display text-2xl font-extrabold tabular", tone)}>{value}</p>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}

function WrapList({ title, items, empty, done }: { title: string; items: string[]; empty?: string; done?: boolean }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t, i) => (
            <li key={i} className="flex items-start gap-2 text-[15px]">
              {done ? <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} /> : <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-subtle" />}
              {t}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
