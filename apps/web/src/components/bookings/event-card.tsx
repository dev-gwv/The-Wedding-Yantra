import { formatDate, formatMoneyShort } from "@wedding-yantra/core";
import { EVENT_STATUS_LABELS, type EventSummary } from "@wedding-yantra/types";
import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function eventDates(e: { startDate: string | null; endDate: string | null }) {
  if (!e.startDate) return "No dates yet";
  if (!e.endDate || e.endDate === e.startDate) return formatDate(e.startDate);
  const sameYear = e.startDate.slice(0, 4) === e.endDate.slice(0, 4);
  return `${formatDate(e.startDate, { year: !sameYear })} – ${formatDate(e.endDate)}`;
}

/** Big date block + title, like a ticket stub. */
export function EventCard({ event, className }: { event: EventSummary; className?: string }) {
  const day = event.startDate ? Number(event.startDate.slice(8, 10)) : null;
  const month = event.startDate ? formatDate(event.startDate).split(" ")[1] : null;
  return (
    <Link
      href={`/app/events/${event.id}`}
      className={cn(
        "flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-sun-300 motion-safe:hover:-translate-y-0.5 hover:shadow-soft",
        event.status === "cancelled" && "opacity-60",
        className,
      )}
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-cream text-center">
        {day ? (
          <span className="leading-none">
            <span className="block font-display text-xl font-extrabold text-brand-strong">{day}</span>
            <span className="block text-[11px] font-bold uppercase text-ink-muted">{month}</span>
          </span>
        ) : (
          <CalendarDays className="size-5 text-ink-subtle" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{event.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-ink-muted">
          <span>
            {eventDates(event)}
            {event.functionCount > 1 && ` · ${event.functionCount} functions`}
          </span>
          {event.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {event.city}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {event.value !== null && <span className="font-bold tabular">{formatMoneyShort(event.value)}</span>}
        {event.status !== "confirmed" && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", event.status === "completed" ? "bg-success-soft text-success" : "bg-cream text-ink-muted")}>
            {EVENT_STATUS_LABELS[event.status]}
          </span>
        )}
      </span>
    </Link>
  );
}
