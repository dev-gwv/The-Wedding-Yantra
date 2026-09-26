"use client";

import { can, formatDate, formatMoney, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useDeleteEvent, useEvent, useUpdateEvent } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS, EVENT_STATUS_LABELS, type WeddingEvent } from "@wedding-yantra/types";
import { AlertTriangle, CircleCheck, Clock, FileText, Inbox, MapPin, MessageCircle, Pencil, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { eventDates } from "@/components/bookings/event-card";
import { EventDeliverables } from "@/components/deliverables/deliverables";
import { ReviewCard } from "@/components/grow/review-card";
import { EventPayouts } from "@/components/vendors/payouts";
import { EventStock } from "@/components/inventory/inventory";
import { EventMoneyCard } from "@/components/money/event-money";
import { EventExpenses } from "@/components/money/expenses-view";
import { EventTasks, EventTeamCard } from "@/components/tasks/event-work";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, Notice, Pill } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";
import { CustomFieldCard } from "@/components/app/custom-fields";

export default function EventPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const event = useEvent(workspace.id, id);
  if (event.isPending) return <Splash />;
  if (event.isError)
    return (
      <>
        <BackLink href="/app/events" label="Events" />
        <Notice tone="danger">{errorMessage(event.error)}</Notice>
      </>
    );
  return <EventView event={event.data} />;
}

function EventView({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateEvent(workspace.id, event.id);
  const remove = useDeleteEvent(workspace.id);
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const manage = can(workspace.role, "events.manage");

  async function setStatus(status: WeddingEvent["status"], message: string) {
    try {
      await update.mutateAsync({ status });
      setConfirm(null);
      toast(message);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  // Functions grouped by day, in order.
  const days = [...new Set(event.functions.map((f) => f.date))];

  return (
    <div className="space-y-6">
      <BackLink href="/app/events" label="Events" />

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              {event.eventType && <Pill tone="brand">{EVENT_LABELS[event.eventType]}</Pill>}
              {event.status !== "confirmed" && <Pill tone={event.status === "completed" ? "success" : "neutral"}>{EVENT_STATUS_LABELS[event.status]}</Pill>}
            </div>
            <h1 className="font-display text-[clamp(26px,4vw,34px)] font-extrabold leading-tight">{event.title}</h1>
            <p className="mt-1 text-ink-muted">
              {eventDates(event)}
              {event.venue && ` · ${event.venue}`}
              {event.city && `, ${event.city}`}
            </p>
          </div>
          {event.value !== null && (
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Booking value</p>
              <p className="font-display text-2xl font-extrabold tabular">{formatMoney(event.value)}</p>
            </div>
          )}
        </div>
        {manage && (
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href={`/app/events/${event.id}/edit`}>
              <Pencil className="size-4" /> Edit dates and details
            </ButtonLink>
            {event.status === "confirmed" && (
              <Button variant="secondary" onClick={() => setStatus("completed", "Marked as done")} loading={update.isPending}>
                <CircleCheck className="size-4" /> Mark done
              </Button>
            )}
            {event.status !== "confirmed" && (
              <Button variant="secondary" onClick={() => setStatus("confirmed", "Event is confirmed again")} loading={update.isPending}>
                Back to confirmed
              </Button>
            )}
          </div>
        )}
      </Card>

      <ReviewCard event={event} />

      {event.clashes.length > 0 && event.status === "confirmed" && (
        <div className="flex gap-3 rounded-2xl bg-warning-soft p-4 text-warning">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Date clash</p>
            <ul className="mt-1 space-y-0.5">
              {event.clashes.map((c) => (
                <li key={`${c.eventId}-${c.date}-${c.functionName}`}>
                  {formatDate(c.date)}:{" "}
                  <Link href={`/app/events/${c.eventId}`} className="font-semibold underline">
                    {c.eventTitle}
                  </Link>{" "}
                  ({c.functionName})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Functions</h2>
        {event.functions.length === 0 ? (
          <Card className="p-5">
            <p className="text-ink-muted">No dates yet. {manage && "Add the haldi, mehendi, wedding and other functions with their dates."}</p>
            {manage && (
              <ButtonLink href={`/app/events/${event.id}/edit`} variant="secondary" className="mt-3">
                Add functions
              </ButtonLink>
            )}
          </Card>
        ) : (
          <ol className="space-y-4">
            {days.map((day) => (
              <li key={day}>
                <p className="mb-2 text-sm font-bold text-brand-strong">{formatDate(day)}</p>
                <div className="space-y-2">
                  {event.functions
                    .filter((f) => f.date === day)
                    .map((f) => (
                      <Card key={f.id} className="p-4">
                        <p className="font-bold">{f.name}</p>
                        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" /> {f.startTime ? `${f.startTime}${f.endTime ? `–${f.endTime}` : ""}` : "Time to be set"}
                          </span>
                          {(f.venue ?? event.venue) && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3.5" /> {f.venue ?? event.venue}
                            </span>
                          )}
                        </p>
                        {f.notes && <p className="mt-2 text-sm">{f.notes}</p>}
                      </Card>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <CustomFieldCard entity="event" values={event.custom} />

      <EventTeamCard event={event} />

      <EventTasks event={event} />

      <EventDeliverables event={event} />

      <EventStock event={event} />

      <EventMoneyCard event={event} />

      <EventExpenses eventId={event.id} />

      <EventPayouts eventId={event.id} cancelled={event.status === "cancelled"} />

      <Card className="divide-y divide-line overflow-hidden">
        {event.clientId && (
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            {/* Buttons drop below the name on a phone instead of squeezing it */}
            <div className="flex min-w-48 flex-1 items-center gap-3">
              <UserRound className="size-5 shrink-0 text-ink-muted" />
              {can(workspace.role, "clients.view") ? (
                <Link href={`/app/clients/${event.clientId}`} className="min-w-0 font-bold hover:text-brand-strong">
                  {event.clientName}
                  {event.clientPhone && <span className="block text-sm font-normal text-ink-muted tabular">{formatPhone(event.clientPhone)}</span>}
                </Link>
              ) : (
                <p className="min-w-0 font-bold">
                  {event.clientName}
                  {event.clientPhone && <span className="block text-sm font-normal text-ink-muted tabular">{formatPhone(event.clientPhone)}</span>}
                </p>
              )}
            </div>
            {event.clientPhone && (
              <div className="flex gap-2">
                <a href={whatsappLink(`Hi ${event.clientName?.split(" ")[0] ?? ""}, `, event.clientPhone)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
                <a href={`tel:${event.clientPhone}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                  <Phone className="size-4" /> Call
                </a>
              </div>
            )}
          </div>
        )}
        {event.quoteId && (
          <Link href={`/app/quotes/${event.quoteId}`} className="flex items-center gap-3 px-5 py-4 font-semibold hover:bg-cream">
            <FileText className="size-5 text-ink-muted" /> Accepted quote {event.quoteNumber}
          </Link>
        )}
        {event.leadId && (
          <Link href={`/app/leads/${event.leadId}`} className="flex items-center gap-3 px-5 py-4 font-semibold hover:bg-cream">
            <Inbox className="size-5 text-ink-muted" /> Original enquiry
          </Link>
        )}
      </Card>

      {event.notes && (
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notes</p>
          <p className="mt-1 whitespace-pre-line">{event.notes}</p>
        </Card>
      )}

      {manage && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {confirm === null && event.status !== "cancelled" && (
            <Button variant="ghost" size="sm" onClick={() => setConfirm("cancel")}>
              Cancel event
            </Button>
          )}
          {confirm === null && (
            <Button variant="danger" size="sm" onClick={() => setConfirm("delete")}>
              Delete event
            </Button>
          )}
          {confirm === "cancel" && (
            <>
              <p className="text-sm text-ink-muted">Cancel {event.title}? It stays in your records as cancelled.</p>
              <Button variant="destructive" size="sm" onClick={() => setStatus("cancelled", "Event cancelled")} loading={update.isPending}>
                Cancel event
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                Keep it
              </Button>
            </>
          )}
          {confirm === "delete" && (
            <>
              <p className="text-sm text-ink-muted">Delete {event.title}? You can&apos;t undo this.</p>
              <Button
                variant="destructive"
                size="sm"
                loading={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(event.id);
                    toast("Event deleted");
                    router.replace("/app/events");
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                Keep it
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
