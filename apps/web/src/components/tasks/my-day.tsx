"use client";

import { formatClock, formatDueDay } from "@wedding-yantra/core";
import type { MyDay, TaskItem } from "@wedding-yantra/types";
import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/misc";
import { TaskRow } from "./task-row";
import { TaskSheet } from "./task-sheet";

/** Whether My Day has anything worth a place on Home. */
export function myDayHasContent(day: MyDay) {
  return day.events.length > 0 || day.overdue.length > 0 || day.dueToday.length > 0 || day.upcoming.length > 0;
}

/** Home for the people doing the work: events they're on this week, and what's due today. */
export function MyDayCard({ day }: { day: MyDay }) {
  const [open, setOpen] = useState<TaskItem | null>(null);
  const { today, events, overdue, dueToday, upcoming } = day;
  const now = [...overdue, ...dueToday];

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Your day</h2>
        <Link href="/app/tasks" className="text-sm font-bold text-brand-strong hover:text-brand-deep">
          All my tasks
        </Link>
      </div>
      <Card className="overflow-hidden">
        {events.length > 0 && (
          <ul className="divide-y divide-line border-b border-line">
            {events.map((e) => {
              const on = e.startDate !== null && e.startDate <= today && (e.endDate ?? e.startDate) >= today;
              return (
                <li key={e.id}>
                  <Link href={`/app/events/${e.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                      <CalendarDays className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{e.title}</span>
                      <span className="block truncate text-sm text-ink-muted">
                        {on ? "Today" : formatDueDay(e.startDate!, today)}
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
                </li>
              );
            })}
          </ul>
        )}
        {now.length > 0 ? (
          <ul className="divide-y divide-line">
            {now.map((t) => (
              <TaskRow key={t.id} task={t} today={today} show={{ event: true }} onOpen={setOpen} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-ink-muted">
            Nothing due today.
            {upcoming.length > 0 && ` ${upcoming.length} task${upcoming.length === 1 ? "" : "s"} coming up this week.`}
          </p>
        )}
      </Card>
      <TaskSheet open={open !== null} onClose={() => setOpen(null)} task={open ?? undefined} />
    </section>
  );
}
