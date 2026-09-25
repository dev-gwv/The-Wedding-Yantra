"use client";

import { can, dailySummaryMessage, daysBetween, formatClock, formatDate, formatMoney, whatsappLink } from "@wedding-yantra/core";
import { useDailySummary } from "@wedding-yantra/api-client/react";
import type { DailySummary } from "@wedding-yantra/types";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Lock, MessageCircle } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { markSummarySent } from "@/lib/summary-sent";
import { useBusinessDay } from "@/lib/today";

const moveDay = (iso: string, by: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + by)).toISOString().slice(0, 10);
};

/** The day in a few lines, ready to send on WhatsApp to yourself or the team group. */
export default function SummaryPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "team.review");
  const today = useBusinessDay()();
  const [date, setDate] = useState(today);
  const summary = useDailySummary(workspace.id, date, allowed);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Daily summary" />
        <Card>
          <EmptyState icon={Lock} title="The daily summary is for the owner and managers">
            Your own day is on Home, under &ldquo;Your day&rdquo;.
          </EmptyState>
        </Card>
      </>
    );
  }

  const label = daysBetween(date, today) === 0 ? "Today" : daysBetween(date, today) === 1 ? "Yesterday" : formatDate(date);
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Daily summary" subtitle="The day in a few lines. Send it to yourself or your team group at closing time." />
      <div className="mb-5 flex items-center justify-between gap-1 sm:justify-start">
        <button type="button" onClick={() => setDate((d) => moveDay(d, -1))} className="rounded-xl p-2 hover:bg-cream" aria-label="Day before">
          <ChevronLeft className="size-5" />
        </button>
        <h2 className="whitespace-nowrap px-2 font-display text-xl font-extrabold">{label}</h2>
        <button
          type="button"
          onClick={() => setDate((d) => moveDay(d, 1))}
          disabled={date >= today}
          className="rounded-xl p-2 hover:bg-cream disabled:opacity-30 disabled:hover:bg-transparent"
          aria-label="Next day"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      {summary.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {summary.isError && <Notice tone="danger">{errorMessage(summary.error)}</Notice>}
      {summary.data && <Summary s={summary.data} businessName={workspace.name} onSent={() => markSummarySent(workspace.id, summary.data.date)} />}
    </>
  );
}

function Summary({ s, businessName, onSent }: { s: DailySummary; businessName: string; onSent: () => void }) {
  const toast = useToast();
  const message = dailySummaryMessage(s, businessName);
  const lateTotal = s.lateTasks.reduce((a, l) => a + l.count, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      onSent();
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select the text and copy it.", "error");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {s.received && <Stat label="Money received" value={formatMoney(s.received.total)} note={`${s.received.count} payment${s.received.count === 1 ? "" : "s"}`} />}
        <Stat label="New enquiries" value={String(s.newLeads)} note={s.booked ? `${s.booked} booked` : undefined} />
        <Stat label="Tasks done" value={String(s.tasksDone)} />
        <Stat label="Tasks late" value={String(lateTotal)} tone={lateTotal > 0 ? "danger" : undefined} />
      </div>

      {(s.lateTasks.length > 0 || (s.expensesWaiting ?? 0) > 0) && (
        <Card className="p-5 text-sm">
          {s.lateTasks.length > 0 && (
            <p>
              <span className="font-bold text-danger">Late: </span>
              {s.lateTasks.map((l) => `${l.name ?? "Anyone on the event"} ${l.count}`).join(", ")}
            </p>
          )}
          {(s.expensesWaiting ?? 0) > 0 && (
            <p className={s.lateTasks.length > 0 ? "mt-2" : undefined}>
              {s.expensesWaiting} expense{s.expensesWaiting === 1 ? "" : "s"} waiting for your approval
            </p>
          )}
        </Card>
      )}

      <section>
        <h3 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">Tomorrow, {formatDate(s.tomorrow.date, { year: false })}</h3>
        <Card className="divide-y divide-line overflow-hidden">
          {s.tomorrow.events.length === 0 && <p className="px-5 py-4 text-sm text-ink-muted">No events.</p>}
          {s.tomorrow.events.map((e) => (
            <div key={e.title} className="flex items-start gap-3 px-5 py-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                <CalendarDays className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold">{e.title}</p>
                <p className="text-sm text-ink-muted">
                  {e.functions.map((f) => (f.time ? `${f.name} ${formatClock(f.time)}` : f.name)).join(" · ")}
                </p>
                {e.team.length > 0 && <p className="text-sm text-ink-muted">Team: {e.team.join(", ")}</p>}
              </div>
            </div>
          ))}
          {s.tomorrow.tasksDue > 0 && (
            <p className="px-5 py-3 text-sm text-ink-muted">
              {s.tomorrow.tasksDue} task{s.tomorrow.tasksDue === 1 ? "" : "s"} due
            </p>
          )}
        </Card>
      </section>

      <section>
        <h3 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">The message</h3>
        <Card className="p-5">
          {/* As WhatsApp shows it: *these lines* in bold. */}
          <div className="space-y-0.5 break-words text-sm leading-relaxed">
            {message.split("\n").map((line, i) =>
              line === "" ? (
                <div key={i} className="h-3" aria-hidden="true" />
              ) : /^\*.+\*$/.test(line) ? (
                <p key={i} className="font-bold">
                  {line.slice(1, -1)}
                </p>
              ) : (
                <p key={i}>{line}</p>
              ),
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={whatsappLink(message)} target="_blank" rel="noopener noreferrer" onClick={onSent} className={buttonClass()}>
              <MessageCircle className="size-4" /> Send on WhatsApp
            </a>
            <Button variant="secondary" onClick={copy}>
              <Copy className="size-4" /> Copy
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "danger" }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-extrabold tabular", tone === "danger" && "text-danger")}>{value}</p>
      {note && <p className="text-xs text-ink-muted">{note}</p>}
    </Card>
  );
}
