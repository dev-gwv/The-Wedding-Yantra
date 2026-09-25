"use client";

import { can, formatDate, todayIn } from "@wedding-yantra/core";
import { useDeliverables } from "@wedding-yantra/api-client/react";
import { DELIVERABLE_STATUS_LABELS, type Deliverable, type WeddingEvent } from "@wedding-yantra/types";
import { ChevronRight, Package, Plus } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, IconSquare, Notice, Pill } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { DeliverableSheet, type DeliverableEvent } from "./deliverable-sheet";

/** One line: what, when, who, and where it is. */
export function DeliverableRow({ d, showEvent, onOpen }: { d: Deliverable; showEvent?: boolean; onOpen: (d: Deliverable) => void }) {
  const { workspace } = useCurrentWorkspace();
  const when =
    d.status === "delivered"
      ? `Delivered ${d.deliveredAt ? formatDate(todayIn(workspace.timezone, new Date(d.deliveredAt)), { year: false }) : ""}`
      : d.dueDate
        ? `${d.late ? "Late: due" : "Due"} ${formatDate(d.dueDate, { year: false })}`
        : "No due date";
  return (
    <li>
      <button type="button" onClick={() => onOpen(d)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-cream">
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold", d.status === "delivered" && "text-ink-muted")}>{d.title}</p>
          <p className="truncate text-sm text-ink-muted">
            <span className={cn(d.late && "font-semibold text-danger")}>{when}</span>
            {showEvent && ` · ${d.eventTitle}`}
            {d.assignee && ` · ${d.assignee.name ?? "Team member"}`}
          </p>
        </div>
        {d.status === "delivered" ? <Pill tone="success">Delivered</Pill> : d.status === "in_progress" ? <Pill tone="brand">{DELIVERABLE_STATUS_LABELS.in_progress}</Pill> : null}
        <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
      </button>
    </li>
  );
}

/** What this event owes the client: photos, the film, the album, a song mix. */
export function EventDeliverables({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  const manage = can(workspace.role, "events.manage");
  const list = useDeliverables(workspace.id, { eventId: event.id });
  const [sheet, setSheet] = useState<{ d?: Deliverable } | null>(null);
  const items = list.data ?? [];
  if (list.isSuccess && items.length === 0 && (!manage || event.status === "cancelled")) return null;

  const forSheet: DeliverableEvent = {
    id: event.id,
    startDate: event.startDate,
    endDate: event.endDate,
    clientName: event.clientName,
    clientPhone: event.clientPhone,
  };
  const delivered = items.filter((d) => d.status === "delivered").length;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">For the client</h2>
        {items.length > 0 && (
          <span className="text-sm font-semibold text-ink-muted tabular">
            {delivered} of {items.length} delivered
          </span>
        )}
      </div>
      {list.isPending && (
        <div className="flex justify-center py-6 text-brand">
          <Spinner />
        </div>
      )}
      {list.isError && <Notice tone="danger">{errorMessage(list.error)}</Notice>}
      {items.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((d) => (
              <DeliverableRow key={d.id} d={d} onOpen={(x) => setSheet({ d: x })} />
            ))}
          </ul>
        </Card>
      ) : (
        list.isSuccess && (
          <Card className="flex items-start gap-4 p-5">
            <IconSquare icon={Package} />
            <p className="text-sm text-ink-muted">
              Plan what you&apos;ll hand over, like the edited photos, the film or the album, with a date for each. The client sees them on their page.
            </p>
          </Card>
        )
      )}
      {manage && event.status !== "cancelled" && (
        <Button variant="secondary" className="mt-3" onClick={() => setSheet({})}>
          <Plus className="size-4" /> Add a deliverable
        </Button>
      )}
      <DeliverableSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        deliverable={sheet?.d}
        event={forSheet}
        existing={items.map((d) => d.title)}
      />
    </section>
  );
}
