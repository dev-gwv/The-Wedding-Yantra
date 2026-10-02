"use client";

import { formatDate, formatMoneyShort } from "@wedding-yantra/core";
import { EVENT_LABELS, type LeadSummary } from "@wedding-yantra/types";
import { CalendarDays, Handshake, MapPin, MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { cn } from "@/lib/cn";
import { FollowUpBadge } from "./follow-up-badge";

/** Keeps a tap on Call or WhatsApp from also opening the lead. */
const keepCardShut = (e: MouseEvent) => e.stopPropagation();

/** One lead in a list or a pipeline column. Call and WhatsApp sit on the card when there's a number. */
export function LeadCard({ lead, showStage = false, className }: { lead: LeadSummary; showStage?: boolean; className?: string }) {
  const event = [lead.eventType ? EVENT_LABELS[lead.eventType] : null, lead.eventDate ? formatDate(lead.eventDate) : null]
    .filter(Boolean)
    .join(" · ");
  const digits = lead.phone?.replace(/\D/g, "") ?? "";
  const first = lead.name.split(" ")[0];
  return (
    // The name's link covers the whole card; the buttons sit above it, so links never nest.
    <div
      className={cn(
        "relative rounded-2xl border border-line bg-surface p-4 transition focus-within:border-sun-300 hover:border-sun-300 motion-safe:hover:-translate-y-0.5 hover:shadow-soft",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Link href={`/app/leads/${lead.id}`} className="min-w-0 truncate font-bold after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
          {lead.name}
        </Link>
        {lead.budget !== null && <span className="shrink-0 text-sm font-bold tabular">{formatMoneyShort(lead.budget)}</span>}
      </div>
      {(event || lead.city || lead.partner) && (
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
          {lead.partner && (
            <span className="inline-flex items-center gap-1 text-brand-strong">
              <Handshake className="size-3.5" /> via {lead.partner.name}
            </span>
          )}
        </p>
      )}
      {(showStage || lead.followUpState !== "none" || digits) && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {showStage && (
              <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold text-ink">{lead.stageName}</span>
            )}
            <FollowUpBadge at={lead.nextFollowUpAt} state={lead.followUpState} />
          </div>
          {digits && (
            <div className="relative z-10 -my-1 flex shrink-0 gap-2">
              <a
                href={`tel:${lead.phone}`}
                onClick={keepCardShut}
                aria-label={`Call ${first}`}
                className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-ink transition hover:border-sun-300 hover:bg-cream"
              >
                <Phone className="size-5" />
              </a>
              <a
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={keepCardShut}
                aria-label={`WhatsApp ${first}`}
                className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-success transition hover:border-sun-300 hover:bg-cream"
              >
                <MessageCircle className="size-5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
