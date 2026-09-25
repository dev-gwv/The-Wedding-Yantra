"use client";

import { can, formatDate, localISODate } from "@wedding-yantra/core";
import { useCalendar, useEvents } from "@wedding-yantra/api-client/react";
import type { CalendarEntry, EventSummary } from "@wedding-yantra/types";
import { CalendarDays, ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { EventCard } from "@/components/bookings/event-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

type View = "upcoming" | "calendar" | "past";

function EventsScreen() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = (["calendar", "past"].includes(params.get("view") ?? "") ? params.get("view") : "upcoming") as View;
  const allowed = can(workspace.role, "events.view");

  if (!allowed) {
    return (
      <>
        <PageHeader title="Events" />
        <Card>
          <EmptyState icon={Lock} title="Events you're booked on show here">
            When the owner adds you to an event, you&apos;ll see its dates and venue here.
          </EmptyState>
        </Card>
      </>
    );
  }

  const setView = (v: View) => router.replace(v === "upcoming" ? pathname : `${pathname}?view=${v}`, { scroll: false });

  return (
    <>
      <PageHeader
        title="Events"
        action={
          can(workspace.role, "events.manage") && (
            <ButtonLink href="/app/events/new">
              <Plus className="size-4" strokeWidth={2.5} /> New event
            </ButtonLink>
          )
        }
      />
      <div className="mb-6 inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Events view">
        {(
          [
            ["upcoming", "Upcoming"],
            ["calendar", "Calendar"],
            ["past", "Past"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              "h-10 rounded-xl px-5 text-sm font-bold transition",
              view === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {view === "calendar" ? <CalendarView /> : <ListView past={view === "past"} />}
    </>
  );
}

function ListView({ past }: { past: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const now = new Date();
  const today = localISODate(now);
  const yesterday = localISODate(now, -1);
  const events = useEvents(workspace.id, past ? { to: yesterday } : { from: today });

  const groups = useMemo(() => {
    const list = (events.data ?? []).filter((e) => (past ? e.startDate !== null : true));
    const ordered = past ? [...list].reverse() : list;
    const map = new Map<string, EventSummary[]>();
    for (const e of ordered) {
      const label = e.startDate ? formatDate(e.startDate).split(" ").slice(1).join(" ") : "Dates to be added";
      map.set(label, [...(map.get(label) ?? []), e]);
    }
    return [...map.entries()];
  }, [events.data, past]);

  if (events.isPending)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner />
      </div>
    );
  if (events.isError) return <Notice tone="danger">{errorMessage(events.error)}</Notice>;
  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarDays} title={past ? "No past events yet" : "No upcoming events"}>
          {past
            ? "Events you've finished will be kept here."
            : "When a client accepts a quote, the event appears here by itself. You can also add one yourself."}
        </EmptyState>
      </Card>
    );
  }
  return (
    <div className="space-y-8">
      {groups.map(([label, list]) => (
        <section key={label}>
          <h2 className="mb-3 font-display text-lg font-extrabold">{label}</h2>
          <div className="space-y-3">
            {list.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarView() {
  const { workspace } = useCurrentWorkspace();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const month = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const entries = useCalendar(workspace.id, month);
  const [selected, setSelected] = useState(() => localISODate(now));

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries.data ?? []) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return map;
  }, [entries.data]);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthName = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const move = (by: number) => setCursor((c) => ({ y: c.y + Math.floor((c.m + by) / 12), m: (((c.m + by) % 12) + 12) % 12 }));
  const today = localISODate(now);
  const selectedEntries = byDate.get(selected) ?? [];

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} className="rounded-xl p-2 hover:bg-cream" aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="font-display text-lg font-extrabold">{monthName}</h2>
          <button type="button" onClick={() => move(1)} className="rounded-xl p-2 hover:bg-cream" aria-label="Next month">
            <ChevronRight className="size-5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-ink-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-2">
              {d}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`blank-${i}`} />;
            const list = byDate.get(date) ?? [];
            const busy = list.filter((e) => e.eventStatus !== "cancelled").length;
            const isSelected = date === selected;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelected(date)}
                aria-pressed={isSelected}
                aria-label={`${formatDate(date)}${busy ? `, ${busy} booked` : ""}`}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm font-bold transition",
                  isSelected ? "bg-gradient-primary text-on-brand shadow-soft" : busy ? "bg-cream text-ink hover:bg-sun-100" : "text-ink hover:bg-cream",
                  date === today && !isSelected && "ring-2 ring-sun-300",
                )}
              >
                {Number(date.slice(8))}
                {busy > 0 && (
                  <span className="flex gap-0.5">
                    {Array.from({ length: Math.min(busy, 3) }).map((_, k) => (
                      <span key={k} className={cn("size-1.5 rounded-full", isSelected ? "bg-on-brand" : busy > 1 ? "bg-danger" : "bg-brand")} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {entries.isPending && (
          <div className="mt-3 flex justify-center text-brand">
            <Spinner className="size-4" />
          </div>
        )}
      </Card>

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">{formatDate(selected)}</h2>
        {selectedEntries.length === 0 ? (
          <p className="text-ink-muted">Free. Nothing booked on this day.</p>
        ) : (
          <div className="space-y-2">
            {selectedEntries.length > 1 && (
              <Notice tone="warning">{selectedEntries.length} functions on this day. Check your team can cover them.</Notice>
            )}
            {selectedEntries.map((e) => (
              <Link
                key={`${e.eventId}-${e.functionName}`}
                href={`/app/events/${e.eventId}`}
                className={cn("block rounded-2xl border border-line bg-surface p-4 hover:border-sun-300", e.eventStatus === "cancelled" && "opacity-60")}
              >
                <p className="font-bold">{e.eventTitle}</p>
                <p className="text-sm text-ink-muted">
                  {[e.functionName, e.startTime ?? "Time to be set", e.venue, e.eventStatus === "cancelled" ? "Cancelled" : null].filter(Boolean).join(" · ")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <EventsScreen />
    </Suspense>
  );
}
