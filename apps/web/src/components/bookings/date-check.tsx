"use client";

import { formatDate } from "@wedding-yantra/core";
import { useDateCheck } from "@wedding-yantra/api-client/react";
import type { DateCheck as DateCheckResult } from "@wedding-yantra/types";
import { CalendarCheck, CalendarClock, CalendarX } from "lucide-react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { cn } from "@/lib/cn";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A small note next to an event date: free, partly booked, or full, against how many events
 * the business can do in a day. Says nothing while loading or if the check fails.
 */
export function DateCheck({ dates, excludeEventId, className }: { dates: (string | null | undefined)[]; excludeEventId?: string | null; className?: string }) {
  const { workspace } = useCurrentWorkspace();
  const valid = [...new Set(dates.filter((d): d is string => !!d && ISO_DATE.test(d)))];
  const check = useDateCheck(workspace.id, valid, excludeEventId ?? undefined);
  if (valid.length === 0 || !check.data) return null;
  const shown = check.data.filter((d) => valid.includes(d.date));
  if (shown.length === 0) return null;

  return (
    <div className={cn("space-y-1", className)}>
      {shown.map((d) => (
        <DateLine key={d.date} check={d} />
      ))}
    </div>
  );
}

function DateLine({ check }: { check: DateCheckResult }) {
  const day = formatDate(check.date, { year: check.date.slice(0, 4) !== String(new Date().getFullYear()) });
  const titles = [...new Map(check.events.map((e) => [e.eventId, e.eventTitle])).values()].filter(Boolean);
  const who = titles.length ? `: ${titles.join(", ")}` : "";

  if (check.full) {
    return (
      <p className="flex items-start gap-1.5 text-sm font-semibold text-danger">
        <CalendarX className="mt-0.5 size-4 shrink-0" />
        <span>
          {day} is full{who}
        </span>
      </p>
    );
  }
  if (check.booked > 0) {
    return (
      <p className="flex items-start gap-1.5 text-sm font-semibold text-warning">
        <CalendarClock className="mt-0.5 size-4 shrink-0" />
        <span>
          {check.booked} of {check.capacity} booked on {day}
          {who}
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-sm font-semibold text-success">
      <CalendarCheck className="mt-0.5 size-4 shrink-0" />
      <span>Free on {day}</span>
    </p>
  );
}
