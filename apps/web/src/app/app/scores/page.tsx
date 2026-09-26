"use client";

import { can, formatMoney, percentOf, ROLE_INFO, SCORE_INFO, SCORE_KEYS, scoreBand } from "@wedding-yantra/core";
import { useScores } from "@wedding-yantra/api-client/react";
import type { PersonScore, TeamScores } from "@wedding-yantra/types";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PointsView } from "@/components/scores/points-view";
import { Avatar, Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

const monthLabel = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shift = (m: string, by: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Points and the month's board first; the four measures, worked out from the work itself, second. */
export default function ScoresPage() {
  const { workspace } = useCurrentWorkspace();
  const everyone = can(workspace.role, "team.review");
  const thisMonth = useBusinessDay()().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [tab, setTab] = useState<"points" | "measures">("points");

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title={everyone ? "Team scores" : "My score"}
        subtitle={
          tab === "points"
            ? "Points for every task finished, more for on time and first time. Ranked each month."
            : "Worked out from the work itself: tasks, follow-ups, bookings and expenses. Nobody fills anything in."
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Scores">
          {(
            [
              ["points", "Points"],
              ["measures", "Measures"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn("h-10 rounded-xl px-5 text-sm font-bold transition sm:px-7", tab === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonth((m) => shift(m, -1))} className="rounded-xl p-2 hover:bg-cream" aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="whitespace-nowrap px-2 font-display text-lg font-extrabold">{monthLabel(month)}</h2>
          <button
            type="button"
            onClick={() => setMonth((m) => shift(m, 1))}
            disabled={month >= thisMonth}
            className="rounded-xl p-2 hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Next month"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
      {tab === "points" ? <PointsView month={month} current={month === thisMonth} /> : <Measures month={month} current={month === thisMonth} />}
    </>
  );
}

function Measures({ month, current }: { month: string; current: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const scores = useScores(workspace.id, month);
  return (
    <>
      {scores.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {scores.isError && <Notice tone="danger">{errorMessage(scores.error)}</Notice>}
      {scores.data && <Scores data={scores.data} current={current} />}
    </>
  );
}

function Scores({ data, current }: { data: TeamScores; current: boolean }) {
  const scored = data.people.filter((p) => p.measures.length > 0 || p.lateNow > 0);
  const quiet = data.people.filter((p) => p.measures.length === 0 && p.lateNow === 0);
  return (
    <div className="space-y-6">
      {data.business && <BusinessCard business={data.business} />}
      {scored.length === 0 ? (
        <Card>
          <EmptyState icon={Trophy} title="Nothing to score yet">
            {current
              ? "Scores fill in as tasks come due, follow-ups are kept, enquiries close and expenses are added."
              : "Nothing was due or closed this month."}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {scored.map((p) => (
            <PersonCard key={p.user.id} person={p} />
          ))}
        </div>
      )}
      {quiet.length > 0 && data.people.length > 1 && (
        <p className="text-sm text-ink-muted">Nothing to score this month for {quiet.map((p) => p.user.name ?? "a team member").join(", ")}.</p>
      )}
      <HowItWorks />
    </div>
  );
}

const BAND_STYLES = {
  great: "bg-success-soft text-success",
  good: "bg-cream text-brand-strong",
  low: "bg-danger-soft text-danger",
} as const;

function PersonCard({ person }: { person: PersonScore }) {
  const band = person.score === null ? null : scoreBand(person.score);
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <Avatar name={person.user.name} className="size-10 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{person.user.name ?? "Team member"}</p>
          <p className="text-xs text-ink-muted">{ROLE_INFO[person.role].label}</p>
        </div>
        {person.score !== null && band && (
          <span className={cn("grid size-14 shrink-0 place-items-center rounded-2xl font-display text-2xl font-extrabold tabular", BAND_STYLES[band])}>
            {person.score}
          </span>
        )}
      </div>
      {person.measures.length > 0 && (
        <ul className="mt-4 space-y-3">
          {person.measures.map((m) => {
            const pct = percentOf(m.done, m.total) ?? 0;
            return (
              <li key={m.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{SCORE_INFO[m.key].label}</span>
                  <span className="shrink-0 tabular text-ink-muted">
                    {m.done} of {m.total} · <span className="font-bold text-ink">{pct}%</span>
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                  <div className={cn("h-full rounded-full", pct >= 60 ? "bg-gradient-primary" : "bg-danger")} style={{ width: `${Math.max(pct, 3)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {person.lateNow > 0 && (
        <Link href="/app/tasks?view=team" className="mt-4 inline-flex rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger">
          {person.lateNow} task{person.lateNow === 1 ? "" : "s"} late right now
        </Link>
      )}
    </Card>
  );
}

function BusinessCard({ business }: { business: NonNullable<TeamScores["business"]> }) {
  const money = percentOf(business.moneyBeforeEvents.collected, business.moneyBeforeEvents.due);
  const steps = percentOf(business.eventsOnTime.done, business.eventsOnTime.total);
  if (money === null && steps === null) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-bold text-ink-muted">The business</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Once events begin this month, you&apos;ll see how much money came in before each event and whether every step was done on time.
        </p>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-ink-muted">The business, for events that began this month</h3>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-ink-muted">Money collected before the event</dt>
          <dd className="mt-1 font-display text-2xl font-extrabold tabular">{money === null ? "–" : `${money}%`}</dd>
          {business.moneyBeforeEvents.due > 0 && (
            <dd className="text-sm text-ink-muted tabular">
              {formatMoney(business.moneyBeforeEvents.collected)} of {formatMoney(business.moneyBeforeEvents.due)}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Events with every step on time</dt>
          <dd className="mt-1 font-display text-2xl font-extrabold tabular">{steps === null ? "–" : `${steps}%`}</dd>
          {business.eventsOnTime.total > 0 && (
            <dd className="text-sm text-ink-muted tabular">
              {business.eventsOnTime.done} of {business.eventsOnTime.total} event{business.eventsOnTime.total === 1 ? "" : "s"}
            </dd>
          )}
        </div>
      </dl>
    </Card>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-sm font-bold text-brand-strong hover:text-brand-deep">
        {open ? "Hide how scores work" : "How scores work"}
      </button>
      {open && (
        <Card className="mt-3 p-5 text-sm">
          <ul className="space-y-2">
            {SCORE_KEYS.map((key) => (
              <li key={key}>
                <span className="font-bold">{SCORE_INFO[key].label}:</span> <span className="text-ink-muted">{SCORE_INFO[key].hint}.</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-ink-muted">
            The score is the average of the measures that had something to measure. 85 and above is great; under 60 needs a word.
          </p>
        </Card>
      )}
    </section>
  );
}
