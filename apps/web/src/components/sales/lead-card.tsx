import { formatDate, formatMoneyShort } from "@wedding-yantra/core";
import { EVENT_LABELS, type LeadSummary } from "@wedding-yantra/types";
import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { FollowUpBadge } from "./follow-up-badge";

/** One lead in a list or a pipeline column. */
export function LeadCard({ lead, showStage = false, className }: { lead: LeadSummary; showStage?: boolean; className?: string }) {
  const event = [lead.eventType ? EVENT_LABELS[lead.eventType] : null, lead.eventDate ? formatDate(lead.eventDate) : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={`/app/leads/${lead.id}`}
      className={cn(
        "block rounded-2xl border border-line bg-surface p-4 transition hover:border-sun-300 motion-safe:hover:-translate-y-0.5 hover:shadow-soft",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate font-bold">{lead.name}</p>
        {lead.budget !== null && <span className="shrink-0 text-sm font-bold tabular">{formatMoneyShort(lead.budget)}</span>}
      </div>
      {(event || lead.city) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-muted">
          {event && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {event}
            </span>
          )}
          {lead.city && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" /> {lead.city}
            </span>
          )}
        </p>
      )}
      {(showStage || lead.followUpState !== "none") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showStage && (
            <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink">{lead.stageName}</span>
          )}
          <FollowUpBadge at={lead.nextFollowUpAt} state={lead.followUpState} />
        </div>
      )}
    </Link>
  );
}
