"use client";

import { can, deliverableMessage, deliverableSuggestions, formatDate, suggestedDue, whatsappLink } from "@wedding-yantra/core";
import { useCreateDeliverable, useDeleteDeliverable, useTeam, useUpdateDeliverable } from "@wedding-yantra/api-client/react";
import {
  DELIVERABLE_STATUS_LABELS,
  DELIVERABLE_STATUSES,
  deliverableInput,
  updateDeliverableInput,
  type Deliverable,
  type DeliverableStatus,
} from "@wedding-yantra/types";
import { CircleCheck, ExternalLink, MessageCircle, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export interface DeliverableEvent {
  id: string;
  startDate: string | null;
  endDate: string | null;
  clientName: string | null;
  clientPhone?: string | null;
}

/** Plan a deliverable, or open one to move it along and hand it over. */
export function DeliverableSheet({
  open,
  onClose,
  deliverable,
  event,
  existing = [],
}: {
  open: boolean;
  onClose: () => void;
  deliverable?: Deliverable;
  /** Adding: the event it's for, to date the suggestions */
  event?: DeliverableEvent;
  /** Titles already on the event, left out of the suggestions */
  existing?: string[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={deliverable ? deliverable.title : "Add a deliverable"} description={deliverable?.eventTitle}>
      {open && <Form deliverable={deliverable} event={event} existing={existing} onDone={onClose} />}
    </Sheet>
  );
}

function Form({ deliverable: d, event, existing, onDone }: { deliverable?: Deliverable; event?: DeliverableEvent; existing: string[]; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const manage = can(workspace.role, "events.manage");
  const team = useTeam(manage ? workspace.id : null);
  const create = useCreateDeliverable(workspace.id);
  const update = useUpdateDeliverable(workspace.id);
  const remove = useDeleteDeliverable(workspace.id);
  const toast = useToast();

  const [title, setTitle] = useState(d?.title ?? "");
  const [dueDate, setDueDate] = useState(d?.dueDate ?? "");
  const [assigneeId, setAssigneeId] = useState(d?.assignee?.id ?? "");
  const [status, setStatus] = useState<DeliverableStatus>(d?.status ?? "pending");
  const [link, setLink] = useState(d?.link ?? "");
  const [note, setNote] = useState(d?.note ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [handedOver, setHandedOver] = useState<Deliverable | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const works = !d || d.canUpdate;
  const suggestions = !d && event ? deliverableSuggestions(workspace.businessTypeId).filter((s) => !existing.includes(s.title)) : [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!d) {
        const payload = { eventId: event!.id, title, dueDate, assigneeId: assigneeId || null, note };
        const check = validate(deliverableInput, payload);
        if (check.errors) return setErrors(check.errors);
        setErrors({});
        await create.mutateAsync(payload);
        toast("Deliverable added");
        return onDone();
      }
      const payload = manage ? { title, dueDate, assigneeId: assigneeId || null, status, link, note } : { status, link, note };
      const check = validate(updateDeliverableInput, payload);
      if (check.errors) return setErrors(check.errors);
      setErrors({});
      const saved = await update.mutateAsync({ id: d.id, ...payload });
      if (saved.status === "delivered" && d.status !== "delivered") {
        // Offer to tell the client straight away.
        setHandedOver(saved);
        return;
      }
      toast("Saved");
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  if (handedOver) {
    const message = deliverableMessage({
      clientName: handedOver.clientName ?? "there",
      business: workspace.name,
      title: handedOver.title,
      link: handedOver.link,
    });
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 font-semibold text-success">
          <CircleCheck className="size-5 shrink-0" /> Marked as delivered
        </div>
        {handedOver.clientName && (
          <a href={whatsappLink(message, event?.clientPhone ?? undefined)} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "lg" })}>
            <MessageCircle className="size-5" /> Tell {handedOver.clientName.split(" ")[0]} on WhatsApp
          </a>
        )}
        <Button variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {suggestions.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Quick add</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => {
                  setTitle(s.title);
                  setDueDate(event ? (suggestedDue(s.days, event) ?? "") : "");
                }}
                aria-pressed={title === s.title}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold",
                  title === s.title ? "bg-gradient-primary text-on-brand" : "bg-cream text-ink hover:bg-sun-100",
                )}
              >
                <Plus className="size-3.5" /> {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {manage ? (
        <>
          <TextField label="What you'll deliver" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Edited photos" />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Due by" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} error={errors.dueDate} />
            <SelectField label="Who's making it" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} error={errors.assigneeId}>
              <option value="">Nobody yet</option>
              {team.data?.members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.phone}
                  {m.isYou ? " (you)" : ""}
                </option>
              ))}
            </SelectField>
          </div>
        </>
      ) : (
        d && (
          <p className="text-sm text-ink-muted">
            {d.dueDate ? `Due by ${formatDate(d.dueDate)}` : "No due date"}
            {d.assignee ? ` · ${d.assignee.name ?? "Team member"} is making it` : ""}
          </p>
        )
      )}

      {d && works && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink">Where it is</p>
          <div className="grid grid-cols-3 gap-2">
            {DELIVERABLE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={cn(
                  "rounded-xl border px-2 py-2.5 text-sm font-bold",
                  status === s ? "border-sun-300 bg-cream text-brand-strong" : "border-line text-ink-muted hover:bg-cream",
                )}
              >
                {DELIVERABLE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      {d && works && (
        <TextField
          label="Link for the client"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          error={errors.link}
          placeholder="https://…"
          inputMode="url"
          autoCapitalize="none"
          hint="A gallery, a Drive folder or a video. The client sees it on their page once it's delivered."
        />
      )}
      {d && !works && d.link && (
        <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-strong">
          <ExternalLink className="size-4" /> Open the link
        </a>
      )}

      {works ? (
        <TextAreaField label="Note" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} placeholder="Optional" />
      ) : (
        d?.note && <p className="whitespace-pre-line rounded-2xl bg-cream p-4">{d.note}</p>
      )}

      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      {works && (
        <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
          {d ? "Save" : "Add"}
        </Button>
      )}

      {d && manage && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {confirmDelete ? (
            <>
              <p className="text-sm text-ink-muted">Remove {d.title}?</p>
              <Button
                variant="destructive"
                size="sm"
                loading={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(d.id);
                    toast("Removed");
                    onDone();
                  } catch (err) {
                    toast(errorMessage(err), "error");
                  }
                }}
              >
                Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
              Remove
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
