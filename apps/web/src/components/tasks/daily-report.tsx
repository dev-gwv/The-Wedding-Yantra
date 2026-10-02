"use client";

import { can, formatDate, localISODate } from "@wedding-yantra/core";
import {
  useMyDay,
  usePeopleBoard,
  useTasks,
} from "@wedding-yantra/api-client/react";
import type { TaskItem } from "@wedding-yantra/types";
import { ChevronRight, MessageSquareText, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { TaskRow } from "./task-row";
import { TaskSheet } from "./task-sheet";

type Tone = "danger" | "warning" | "success" | undefined;

/** One count in a report: red when something is late, amber when stuck. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: Tone;
}) {
  const on = value !== null && value > 0;
  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-2.5",
        on && tone === "danger"
          ? "bg-danger-soft"
          : on && tone === "warning"
            ? "bg-sun-100"
            : on && tone === "success"
              ? "bg-success-soft"
              : "bg-cream",
      )}
    >
      <p
        className={cn(
          "font-display text-2xl font-extrabold leading-none tabular",
          on && tone === "danger" && "text-danger",
          on && tone === "warning" && "text-brand-strong",
          on && tone === "success" && "text-success",
        )}
      >
        {value ?? "…"}
      </p>
      <p className="mt-1 text-xs font-semibold text-ink-muted">{label}</p>
    </div>
  );
}

function Panel({
  title,
  about,
  children,
  footer,
}: {
  title: string;
  about: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="px-5 pb-3 pt-4">
        <h3 className="font-display text-base font-extrabold">{title}</h3>
        <p className="text-sm text-ink-muted">{about}</p>
      </div>
      <div className="flex-1">{children}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        {footer}
      </div>
    </Card>
  );
}

const SHOWN = 6;
const byId = (list: TaskItem[]) => [
  ...new Map(list.map((t) => [t.id, t])).values(),
];

/**
 * Today on one card, for anyone who works on tasks: your own tasks first; then, for owners and
 * managers, the tasks you've given and where each person on the team stands. Late and stuck
 * work is at the top, so nothing waits without you knowing.
 */
export function DailyReport() {
  const { workspace } = useCurrentWorkspace();
  const role = workspace.role;
  const manages = can(role, "tasks.manage");
  const day = useMyDay(workspace.id, can(role, "tasks.work"));
  const given = useTasks(
    workspace.id,
    { scope: "given", status: "open" },
    manages,
  );
  const givenDone = useTasks(
    workspace.id,
    { scope: "given", status: "done" },
    manages,
  );
  const board = usePeopleBoard(workspace.id, manages);
  const [open, setOpen] = useState<TaskItem | null>(null);
  const [adding, setAdding] = useState<"mine" | "give" | null>(null);
  const today = day.data?.today ?? board.data?.today ?? localISODate();

  // Mine: anything sent back to fix, then late, then due today.
  const d = day.data;
  const mineNow = d ? byId([...d.sentBack, ...d.overdue, ...d.dueToday]) : [];
  const mineStuck = d
    ? byId([...d.overdue, ...d.dueToday, ...d.upcoming, ...d.noDate]).filter(
        (t) => t.status === "waiting",
      ).length
    : null;

  // Given: what needs you first. Stuck (with why), then late, then work handed in for your check.
  const g = given.data;
  const attention = useMemo(() => {
    if (!g) return [];
    const stuck = g.filter((t) => t.status === "waiting");
    const late = g.filter((t) => t.overdue && t.status !== "waiting");
    const check = g.filter((t) => t.status === "review" && !t.overdue);
    return [...stuck, ...late, ...check];
  }, [g]);
  const doneToday = givenDone.data
    ? givenDone.data.filter(
        (t) => t.doneAt && localISODate(new Date(t.doneAt)) === today,
      ).length
    : null;

  const people = board.data?.people ?? [];

  return (
    <section aria-labelledby="daily-report">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="daily-report" className="font-display text-lg font-extrabold">
          Today&apos;s report{" "}
          <span className="text-base font-bold text-ink-muted">
            · {formatDate(today)}
          </span>
        </h2>
        {can(role, "team.review") && (
          <Link
            href="/app/summary"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong hover:text-brand-deep"
          >
            <MessageSquareText className="size-4" /> Day&apos;s summary
          </Link>
        )}
      </div>

      <div className={cn("grid gap-4", manages && "lg:grid-cols-2")}>
        <Panel
          title="My tasks"
          about="What you have to do today"
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAdding("mine")}
              >
                <Plus className="size-4" strokeWidth={2.5} /> Add task
              </Button>
              <Link
                href="/app/my-day"
                className="inline-flex items-center gap-1 text-sm font-bold text-brand-strong hover:text-brand-deep"
              >
                Open my day <ChevronRight className="size-4" />
              </Link>
            </>
          }
        >
          <div className="grid grid-cols-4 gap-2 px-5 pb-3">
            <Stat
              label="Late"
              value={d ? d.overdue.length : null}
              tone="danger"
            />
            <Stat label="Due today" value={d ? d.dueToday.length : null} />
            <Stat label="Stuck" value={mineStuck} tone="warning" />
            <Stat
              label="Done today"
              value={d ? d.doneToday.length : null}
              tone="success"
            />
          </div>
          {day.isPending ? (
            <Loading />
          ) : mineNow.length > 0 ? (
            <ul className="divide-y divide-line border-t border-line">
              {mineNow.slice(0, SHOWN).map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  today={today}
                  show={{ event: true }}
                  onOpen={setOpen}
                  note={
                    t.status === "waiting" && t.waitingReason
                      ? `Stuck: ${t.waitingReason}`
                      : null
                  }
                />
              ))}
              {mineNow.length > SHOWN && (
                <More href="/app/my-day" n={mineNow.length - SHOWN} />
              )}
            </ul>
          ) : (
            <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
              Nothing late or due today.
              {d &&
                d.upcoming.length > 0 &&
                ` ${d.upcoming.length} task${d.upcoming.length === 1 ? "" : "s"} coming up this week.`}
            </p>
          )}
        </Panel>

        {manages && (
          <Panel
            title="Tasks I've given"
            about="Work you handed to your team, and what needs you"
            footer={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAdding("give")}
                >
                  <Send className="size-4" /> Give a task
                </Button>
                <Link
                  href="/app/tasks/given"
                  className="inline-flex items-center gap-1 text-sm font-bold text-brand-strong hover:text-brand-deep"
                >
                  See all <ChevronRight className="size-4" />
                </Link>
              </>
            }
          >
            <div className="grid grid-cols-4 gap-2 px-5 pb-3">
              <Stat label="Pending" value={g ? g.length : null} />
              <Stat
                label="Late"
                value={g ? g.filter((t) => t.overdue).length : null}
                tone="danger"
              />
              <Stat
                label="Stuck"
                value={
                  g ? g.filter((t) => t.status === "waiting").length : null
                }
                tone="warning"
              />
              <Stat label="Done today" value={doneToday} tone="success" />
            </div>
            {given.isPending ? (
              <Loading />
            ) : attention.length > 0 ? (
              <ul className="divide-y divide-line border-t border-line">
                {attention.slice(0, SHOWN).map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    today={today}
                    show={{ assignee: true }}
                    onOpen={setOpen}
                    note={
                      t.status === "waiting"
                        ? `Stuck: ${t.waitingReason ?? "no reason given"}`
                        : t.status === "review"
                          ? "Handed in, waiting for your check"
                          : null
                    }
                  />
                ))}
                {attention.length > SHOWN && (
                  <More
                    href="/app/tasks/given"
                    n={attention.length - SHOWN}
                  />
                )}
              </ul>
            ) : (
              <p className="border-t border-line px-5 py-4 text-sm text-ink-muted">
                {g && g.length > 0
                  ? `All on track: ${g.length} pending, none late or stuck.`
                  : "No open tasks given to the team."}
              </p>
            )}
          </Panel>
        )}
      </div>

      {manages && (
        <Card className="mt-4 overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-2 pt-4">
            <div>
              <h3 className="font-display text-base font-extrabold">
                Team today
              </h3>
              <p className="text-sm text-ink-muted">
                Where each person stands right now
              </p>
            </div>
            <Link
              href="/app/tasks/team"
              className="inline-flex items-center gap-1 text-sm font-bold text-brand-strong hover:text-brand-deep"
            >
              Team board <ChevronRight className="size-4" />
            </Link>
          </div>
          {board.isPending ? (
            <Loading />
          ) : people.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-ink-muted">
              Invite your team to give them tasks.
            </p>
          ) : (
            <>
              {/* Phone: one line per person, only what's not zero. */}
              <ul
                className="divide-y divide-line border-t border-line md:hidden"
                aria-label="Team today"
              >
                {people.map((p) => {
                  const bits = [
                    p.late > 0 && (
                      <span key="late" className="font-bold text-danger">
                        {p.late} late
                      </span>
                    ),
                    p.stuck > 0 && (
                      <span key="stuck" className="font-bold text-brand-strong">
                        {p.stuck} stuck
                      </span>
                    ),
                    p.toCheck > 0 && (
                      <span key="check">{p.toCheck} to check</span>
                    ),
                    p.dueToday > 0 && (
                      <span key="today">{p.dueToday} due today</span>
                    ),
                    <span key="open">{p.open} pending</span>,
                  ].filter(Boolean);
                  return (
                    <li key={p.user.id} className="px-5 py-3">
                      <p className="font-semibold">
                        <Link
                          href={`/app/tasks/people/${p.user.id}`}
                          className="hover:text-brand-strong hover:underline"
                        >
                          {p.user.name ?? "Team member"}
                        </Link>
                        {p.offToday && (
                          <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                            Off today
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-ink-muted tabular">
                        {bits}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table
                  className="w-full text-left text-sm"
                  aria-label="Team today"
                >
                  <thead className="border-y border-line bg-cream/60 text-xs font-bold uppercase tracking-wide text-ink-muted">
                    <tr>
                      <th scope="col" className="py-2.5 pl-5 pr-3">
                        Person
                      </th>
                      {[
                        "Pending",
                        "Due today",
                        "Late",
                        "Stuck",
                        "To check",
                        "Done this week",
                      ].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="whitespace-nowrap px-3 py-2.5 text-right last:pr-5"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {people.map((p) => (
                      <tr key={p.user.id}>
                        <td className="py-2.5 pl-5 pr-3">
                          <Link
                            href={`/app/tasks/people/${p.user.id}`}
                            className="font-semibold hover:text-brand-strong hover:underline"
                          >
                            {p.user.name ?? "Team member"}
                          </Link>
                          {p.offToday && (
                            <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-ink-muted">
                              Off today
                            </span>
                          )}
                        </td>
                        <Num n={p.open} />
                        <Num n={p.dueToday} />
                        <Num n={p.late} tone="danger" />
                        <Num n={p.stuck} tone="warning" />
                        <Num n={p.toCheck} />
                        <Num n={p.doneThisWeek} tone="success" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      <TaskSheet
        open={open !== null}
        onClose={() => setOpen(null)}
        task={open ?? undefined}
      />
      <TaskSheet
        open={adding !== null}
        onClose={() => setAdding(null)}
        title={adding === "give" ? "Give a task" : "Add a task for yourself"}
        pickAssignee={adding === "give"}
      />
    </section>
  );
}

function Num({ n, tone }: { n: number; tone?: Tone }) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 text-right tabular last:pr-5",
        n === 0
          ? "text-ink-subtle"
          : tone === "danger"
            ? "font-bold text-danger"
            : tone === "warning"
              ? "font-bold text-brand-strong"
              : tone === "success"
                ? "font-semibold text-success"
                : "font-semibold",
      )}
    >
      {n}
    </td>
  );
}

function More({ href, n }: { href: string; n: number }) {
  return (
    <li>
      <Link
        href={href}
        className="block px-5 py-3 text-sm font-bold text-brand-strong hover:bg-cream"
      >
        {n} more
      </Link>
    </li>
  );
}

function Loading() {
  return (
    <div className="flex justify-center border-t border-line py-6 text-brand">
      <Spinner />
    </div>
  );
}
