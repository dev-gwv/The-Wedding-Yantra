"use client";

import { can } from "@wedding-yantra/core";
import { useVenues } from "@wedding-yantra/api-client/react";
import { ChevronRight, Lock, MapPin, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useOptionList } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { VenueFormSheet } from "@/components/venues/venue-form-sheet";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** Where your events happen: address, Maps link, contact and rules, kept once. */
export default function VenuesPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace, "events.view");
  const manage = can(workspace, "events.manage");
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);
  const q = useDeferredValue(search.trim().toLowerCase());
  const venues = useVenues(workspace.id, allowed, archived);
  const types = useOptionList("venue_type");
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/masters" label="Master data" />
        <PageHeader title="Venues" />
        <Card>
          <EmptyState icon={Lock} title="The venue list is for the owner, managers and staff">
            Each event you&apos;re on shows its venue&apos;s address and Maps link.
          </EmptyState>
        </Card>
      </>
    );
  }

  const shown = (venues.data ?? []).filter(
    (v) =>
      (!type || v.venueType === type) &&
      (!q ||
        v.name.toLowerCase().includes(q) ||
        (v.city ?? "").toLowerCase().includes(q) ||
        (v.address ?? "").toLowerCase().includes(q) ||
        (v.contactPerson ?? "").toLowerCase().includes(q)),
  );
  // Only the types in use, as filter chips.
  const used = types.active.filter((o) => (venues.data ?? []).some((v) => v.venueType === o.key));

  return (
    <>
      <BackLink href="/app/masters" label="Master data" />
      <PageHeader
        title="Venues"
        subtitle="Banquet halls, hotels, lawns, farmhouses: where your events happen, how to reach them, and their rules."
        action={
          manage && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add venue
            </Button>
          )
        }
      />

      {venues.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {venues.isError && <Notice tone="danger">{errorMessage(venues.error)}</Notice>}

      {venues.data && (
        <section>
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <span className="sr-only">Search venues</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a name, city, area or contact"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
            />
          </label>
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                [false, "Venues"],
                [true, "Archived"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={archived === value}
                onClick={() => {
                  setArchived(value);
                  setType(null);
                }}
                className={cn("h-9 rounded-full px-4 text-sm font-bold", archived === value ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-cream")}
              >
                {label}
              </button>
            ))}
            {used.length > 1 && <span className="mx-1 w-px self-stretch bg-line" aria-hidden />}
            {used.length > 1 &&
              used.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={type === o.key}
                  onClick={() => setType(type === o.key ? null : o.key)}
                  className={cn("h-9 rounded-full px-4 text-sm font-bold", type === o.key ? "bg-gradient-primary text-on-brand" : "border border-line bg-surface text-ink hover:bg-cream")}
                >
                  {o.label}
                </button>
              ))}
          </div>
          {venues.data.length === 0 ? (
            <Card>
              <EmptyState
                icon={MapPin}
                title={archived ? "No archived venues" : "No venues yet"}
                action={manage && !archived && <Button onClick={() => setAdding(true)}>Add your first venue</Button>}
              >
                {archived
                  ? "Venues you archive show here. Their events keep their name."
                  : "Save the places you work at once: address, Maps link, the banquet manager's number, and the rules. Every event there shows them to your team."}
              </EmptyState>
            </Card>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-ink-muted">No venues match.</p>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {shown.map((v) => (
                <Link key={v.id} href={`/app/venues/${v.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                    <MapPin className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{v.name}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {[v.venueTypeLabel, v.city, v.capacity ? `${v.capacity.toLocaleString("en-IN")} guests` : null].filter(Boolean).join(" · ") || "No details yet"}
                    </p>
                  </div>
                  {v.upcoming > 0 && (
                    <span className="shrink-0 rounded-full bg-cream px-2.5 py-1 text-xs font-bold text-brand-strong">
                      {v.upcoming} coming up
                    </span>
                  )}
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          )}
        </section>
      )}

      <VenueFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(v) => {
          setAdding(false);
          router.push(`/app/venues/${v.id}`);
        }}
      />
    </>
  );
}
