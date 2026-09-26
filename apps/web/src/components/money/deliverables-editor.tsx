"use client";

import { deliverableSuggestions, suggestedDue } from "@wedding-yantra/core";
import { DELIVERABLE_STATUS_LABELS, type BillDeliverableInput, type DeliverableStatus } from "@wedding-yantra/types";
import { PackageCheck, Plus, Trash2 } from "lucide-react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { cn } from "@/lib/cn";

export interface EditableDeliverable {
  title: string;
  dueDate: string;
  deliverableId: string | null;
  status: DeliverableStatus | null;
}

export const toEditableDeliverables = (list: { title: string; dueDate: string | null; deliverableId: string | null; status?: DeliverableStatus | null }[]): EditableDeliverable[] =>
  list.map((d) => ({ title: d.title, dueDate: d.dueDate ?? "", deliverableId: d.deliverableId, status: d.status ?? null }));

export const deliverablesPayload = (list: EditableDeliverable[]): BillDeliverableInput[] =>
  list.filter((d) => d.title.trim()).map((d) => ({ title: d.title, dueDate: d.dueDate, deliverableId: d.deliverableId }));

const input =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none";

/**
 * "What they'll get": the albums, photos, reels or hampers this invoice pays for, each with
 * a date. On an event's invoice, new ones can be tracked with the event's deliverables.
 */
export function DeliverablesEditor({
  list,
  onChange,
  eventDate,
  forEvent,
  track,
  onTrack,
  error,
}: {
  list: EditableDeliverable[];
  onChange: (list: EditableDeliverable[]) => void;
  /** The event's day, to date the suggestions */
  eventDate: string | null;
  forEvent: boolean;
  track: boolean;
  onTrack: (on: boolean) => void;
  error?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const suggestions = deliverableSuggestions(workspace.businessTypeId).filter((s) => !list.some((d) => d.title.toLowerCase() === s.title.toLowerCase()));
  const set = (i: number, patch: Partial<EditableDeliverable>) => onChange(list.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const add = (title = "", dueDate = "") => onChange([...list, { title, dueDate, deliverableId: null, status: null }]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold">
          <PackageCheck className="size-4 text-brand-strong" /> What they&apos;ll get (optional)
        </h2>
        <p className="text-sm text-ink-muted">Albums, edited photos, reels, hampers: printed on the invoice with their dates.</p>
      </div>
      {list.length > 0 && (
        <ul className="space-y-2">
          {list.map((d, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center">
              <input className={input} value={d.title} maxLength={120} placeholder="500 edited photos" onChange={(e) => set(i, { title: e.target.value })} aria-label={`Item ${i + 1}`} />
              <input type="date" className={cn(input, "col-start-1 sm:col-start-auto")} value={d.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} aria-label={`Item ${i + 1} date`} />
              <div className="row-start-1 flex items-center gap-1 col-start-2 sm:row-start-auto sm:col-start-auto">
                {d.status && (
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", d.status === "delivered" ? "bg-success-soft text-success" : "bg-cream text-ink-muted")}>
                    {DELIVERABLE_STATUS_LABELS[d.status]}
                  </span>
                )}
                <button type="button" onClick={() => onChange(list.filter((_, j) => j !== i))} className="rounded-lg p-2 text-ink-muted hover:bg-cream" aria-label={`Remove ${d.title || `item ${i + 1}`}`}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {suggestions.slice(0, 6).map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => add(s.title, suggestedDue(s.days, { startDate: eventDate, endDate: eventDate }) ?? "")}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3.5 text-sm font-bold hover:bg-cream"
          >
            <Plus className="size-3.5" /> {s.title}
          </button>
        ))}
        {list.length < 30 && (
          <button type="button" onClick={() => add()} className="inline-flex h-9 items-center gap-1 px-2 text-sm font-semibold text-brand-strong">
            <Plus className="size-4" /> Something else
          </button>
        )}
      </div>
      {forEvent && list.some((d) => !d.deliverableId) && (
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={track} onChange={(e) => onTrack(e.target.checked)} className="mt-0.5 size-4 accent-brand" />
          <span>
            <span className="font-semibold">Track new ones on the event</span>
            <span className="block text-ink-muted">They join the event&apos;s deliverables, and the invoice shows when each is delivered.</span>
          </span>
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
