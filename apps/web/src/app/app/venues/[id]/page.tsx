"use client";

import { can, formatClock, formatDate, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useUpdateVenue, useVenue } from "@wedding-yantra/api-client/react";
import { EVENT_STATUS_LABELS, venueMapsLink, type Venue } from "@wedding-yantra/types";
import { Archive, ArchiveRestore, ChevronRight, MapPin, MessageCircle, Navigation, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { VenueFormSheet } from "@/components/venues/venue-form-sheet";
import { errorMessage } from "@/lib/errors";

export default function VenuePage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const venue = useVenue(workspace.id, id);
  const manage = can(workspace.role, "events.manage");
  const update = useUpdateVenue(workspace.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  if (venue.isPending) return <Splash />;
  if (venue.isError)
    return (
      <>
        <BackLink href="/app/venues" label="Venues" />
        <Notice tone="danger">{errorMessage(venue.error)}</Notice>
      </>
    );
  const v = venue.data;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const coming = v.events.filter((e) => e.status === "confirmed" && e.date && e.date >= today).reverse();
  const past = v.events.filter((e) => !coming.includes(e));

  return (
    <div className="space-y-6">
      <BackLink href="/app/venues" label="Venues" />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand shadow-soft">
            <MapPin className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-tight">{v.name}</h1>
            <p className="text-ink-muted">{[v.venueTypeLabel, v.city, v.capacity ? `${v.capacity.toLocaleString("en-IN")} guests` : null].filter(Boolean).join(" · ")}</p>
            {v.archived && <span className="mt-1 inline-block rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-ink-subtle">Archived</span>}
          </div>
        </div>
        {v.address && <p className="mt-4 whitespace-pre-line text-[15px]">{v.address}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={venueMapsLink(v)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
            <Navigation className="size-4" /> Open in Maps
          </a>
          {v.phone && (
            <>
              <a href={`tel:${v.phone}`} className={buttonClass({ variant: "secondary" })}>
                <Phone className="size-4" /> Call {v.contactPerson?.split(" ")[0] ?? "venue"}
              </a>
              <a href={whatsappLink(`Hi${v.contactPerson ? ` ${v.contactPerson.split(" ")[0]}` : ""}, `, v.phone)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </>
          )}
          {manage && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
      </Card>

      <DetailsCard v={v} />

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Events here</h2>
        {v.events.length === 0 ? (
          <p className="text-ink-muted">None yet. Type &ldquo;{v.name}&rdquo; as the venue on an event and it shows here.</p>
        ) : (
          <div className="space-y-4">
            {coming.length > 0 && <EventList title="Coming up" events={coming} />}
            {past.length > 0 && <EventList title="Before" events={past} />}
          </div>
        )}
      </section>

      {manage && (
        <div className="border-t border-line pt-6">
          <Button
            variant="ghost"
            size="sm"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { id: v.id, archived: !v.archived },
                { onSuccess: () => toast(v.archived ? "Brought back" : "Archived. Its events keep their venue."), onError: (err) => toast(errorMessage(err), "error") },
              )
            }
          >
            {v.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {v.archived ? "Bring back" : "Archive venue"}
          </Button>
        </div>
      )}

      <VenueFormSheet
        open={editing}
        onClose={() => setEditing(false)}
        venue={v}
        onSaved={() => {
          setEditing(false);
          toast("Venue saved");
        }}
      />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular">{children || <span className="font-normal text-ink-subtle">Not added</span>}</dd>
    </div>
  );
}

function DetailsCard({ v }: { v: Venue }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg font-extrabold">Contact and rules</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] sm:grid-cols-3">
        <Detail label="Contact person">{v.contactPerson}</Detail>
        <Detail label="Mobile">{v.phone && formatPhone(v.phone)}</Detail>
        <Detail label="Guests it holds">{v.capacity?.toLocaleString("en-IN")}</Detail>
        <Detail label="Music stops by">{v.musicCutoff && formatClock(v.musicCutoff)}</Detail>
        <Detail label="Outside caterers">{v.outsideCatering == null ? null : v.outsideCatering ? "Allowed" : "Not allowed"}</Detail>
        <Detail label="Setup and load-in">{v.loadIn}</Detail>
      </dl>
      {v.notes && <p className="mt-4 whitespace-pre-line rounded-2xl bg-cream p-4">{v.notes}</p>}
    </Card>
  );
}

function EventList({ title, events }: { title: string; events: Venue["events"] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-bold text-ink-muted">{title}</h3>
      <Card className="divide-y divide-line overflow-hidden">
        {events.map((e) => (
          <Link key={e.eventId} href={`/app/events/${e.eventId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-cream">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{e.title}</p>
              <p className="truncate text-sm text-ink-muted">
                {[e.date && formatDate(e.date), e.functions.join(", "), e.clientName, e.status !== "confirmed" ? EVENT_STATUS_LABELS[e.status] : null].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
          </Link>
        ))}
      </Card>
    </div>
  );
}
