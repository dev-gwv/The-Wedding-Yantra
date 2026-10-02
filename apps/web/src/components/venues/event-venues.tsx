"use client";

import { can, formatClock, formatPhone } from "@wedding-yantra/core";
import { venueMapsLink, type WeddingEvent } from "@wedding-yantra/types";
import { MapPin, Navigation, Phone } from "lucide-react";
import Link from "next/link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

/** The saved venue behind a venue name on the event, if there is one. */
export const venueFor = (event: WeddingEvent, name: string | null) =>
  name ? event.venues.find((v) => v.name.toLowerCase() === name.trim().toLowerCase()) : undefined;

/** How to reach each of the event's saved venues, and their rules: for the whole crew. */
export function EventVenues({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  if (event.venues.length === 0) return null;
  const opens = can(workspace, "events.view");
  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-extrabold">{event.venues.length === 1 ? "Venue" : "Venues"}</h2>
      <div className="space-y-3">
        {event.venues.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                <MapPin className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                {opens ? (
                  <Link href={`/app/venues/${v.id}`} className="font-bold hover:text-brand-strong">
                    {v.name}
                  </Link>
                ) : (
                  <p className="font-bold">{v.name}</p>
                )}
                {(v.address || v.city) && <p className="text-sm text-ink-muted">{[v.address, v.city].filter(Boolean).join(", ")}</p>}
                {(v.musicCutoff || v.loadIn || v.contactPerson) && (
                  <p className="mt-1 text-sm">
                    {[
                      v.musicCutoff && `Music stops by ${formatClock(v.musicCutoff)}`,
                      v.loadIn && `Setup: ${v.loadIn}`,
                      v.contactPerson && `Contact: ${v.contactPerson}${v.phone ? ` (${formatPhone(v.phone)})` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={venueMapsLink(v)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
                <Navigation className="size-4" /> Open in Maps
              </a>
              {v.phone && (
                <a href={`tel:${v.phone}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                  <Phone className="size-4" /> Call venue
                </a>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
