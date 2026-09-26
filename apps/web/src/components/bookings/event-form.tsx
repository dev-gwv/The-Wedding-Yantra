"use client";

import { formatDate, formatPhone } from "@wedding-yantra/core";
import { useClashes, useClients, useCreateEvent, useUpdateEvent } from "@wedding-yantra/api-client/react";
import {
  EVENT_LABELS,
  EVENT_TYPES,
  eventInput,
  updateEventInput,
  type EventType,
  type WeddingEvent,
} from "@wedding-yantra/types";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useDeferredValue, useState, type FormEvent } from "react";
import { checkDraft, CustomFieldInputs, customPayload, toDraft, useEntityFields } from "@/components/app/custom-fields";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

const FUNCTION_NAMES = ["Roka", "Engagement", "Haldi", "Mehendi", "Sangeet", "Wedding", "Reception", "Pre-wedding shoot", "Cocktail"];

interface FnRow {
  key: string;
  name: string;
  date: string;
  startTime: string;
  venue: string;
}

let seq = 0;
const key = () => `fn-${++seq}`;

export function EventForm({ event, onSaved }: { event?: WeddingEvent; onSaved: (event: WeddingEvent) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateEvent(workspace.id);
  const update = useUpdateEvent(workspace.id, event?.id ?? "");
  const [clientMode, setClientMode] = useState<"pick" | "new">("pick");
  const [clientSearch, setClientSearch] = useState("");
  const clients = useClients(workspace.id, useDeferredValue(clientSearch.trim()));
  const [clientId, setClientId] = useState<string | null>(null);
  const [newClient, setNewClient] = useState({ name: "", phone: "" });
  const [title, setTitle] = useState(event?.title ?? "");
  const [eventType, setEventType] = useState<string>(event?.eventType ?? "");
  const [value, setValue] = useState(event?.value != null ? String(event.value) : "");
  const [venue, setVenue] = useState(event?.venue ?? "");
  const [city, setCity] = useState(event?.city ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [fns, setFns] = useState<FnRow[]>(() =>
    event?.functions.length
      ? event.functions.map((f) => ({ key: key(), name: f.name, date: f.date, startTime: f.startTime ?? "", venue: f.venue ?? "" }))
      : [{ key: key(), name: "Wedding", date: "", startTime: "", venue: "" }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = useEntityFields("event");
  const [custom, setCustom] = useState(() => toDraft(event?.custom));

  const dates = fns.map((f) => f.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const clashes = useClashes(workspace.id, dates, event?.id);
  const setFn = (k: string, patch: Partial<FnRow>) => setFns((list) => list.map((f) => (f.key === k ? { ...f, ...patch } : f)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const functions = fns.map((f) => ({ name: f.name, date: f.date, startTime: f.startTime, venue: f.venue }));
    const common = { title, eventType: (eventType || null) as EventType | null, value, venue, city, notes, functions, custom: customPayload(fields, custom) };
    const payload = event
      ? common
      : { ...common, ...(clientMode === "pick" ? { clientId } : { newClient: { name: newClient.name, phone: newClient.phone } }) };
    const check = event ? validate(updateEventInput, payload) : validate(eventInput, payload);
    const customErrors = checkDraft(fields, custom);
    if (check.errors || Object.keys(customErrors).length) return setErrors({ ...check.errors, ...customErrors });
    setErrors({});
    try {
      onSaved(event ? await update.mutateAsync(common) : await create.mutateAsync(payload as Parameters<typeof create.mutateAsync>[0]));
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  const fnError = (i: number) => Object.entries(errors).find(([k]) => k.startsWith(`functions.${i}.`))?.[1];

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {!event && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Client</h2>
            <div className="inline-flex rounded-xl bg-cream p-1 text-sm font-bold">
              {(["pick", "new"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setClientMode(m)}
                  aria-pressed={clientMode === m}
                  className={cn("rounded-lg px-3 py-1.5", clientMode === m ? "bg-surface shadow-soft" : "text-ink-muted")}
                >
                  {m === "pick" ? "Existing" : "New"}
                </button>
              ))}
            </div>
          </div>
          {clientMode === "pick" ? (
            <div className="space-y-2">
              <TextField label="Find a client" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Name or number" error={errors.clientId} />
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {clients.data?.slice(0, 20).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setClientId(c.id);
                        if (!title) setTitle(c.name);
                      }}
                      aria-pressed={clientId === c.id}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left",
                        clientId === c.id ? "border-brand bg-cream" : "border-transparent hover:bg-cream",
                      )}
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-sm text-ink-muted tabular">{c.phone ? formatPhone(c.phone) : ""}</span>
                    </button>
                  </li>
                ))}
                {clients.data?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">No clients found. Switch to New.</li>}
              </ul>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Client name" value={newClient.name} onChange={(e) => setNewClient((c) => ({ ...c, name: e.target.value }))} error={errors["newClient.name"] ?? errors.clientId} />
              <PhoneField label="Mobile number" value={newClient.phone} onChange={(e) => setNewClient((c) => ({ ...c, phone: e.target.value }))} error={errors["newClient.phone"]} />
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Event name" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Sharma wedding" className="sm:col-span-2" />
        <SelectField label="Type" value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">Choose</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Booking value (₹)" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} error={errors.value} />
        <TextField label="Main venue" value={venue} onChange={(e) => setVenue(e.target.value)} error={errors.venue} />
        <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} />
      </div>

      <section>
        <h2 className="mb-1 font-display text-lg font-extrabold">Functions</h2>
        <p className="mb-3 text-sm text-ink-muted">Each day of the celebration you&apos;re working on.</p>
        <div className="space-y-3">
          {fns.map((f, i) => (
            <Card key={f.key} className="p-4">
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold text-ink-muted">
                  Function
                  <input
                    list="function-names"
                    value={f.name}
                    onChange={(e) => setFn(f.key, { name: e.target.value })}
                    className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFns((list) => list.filter((x) => x.key !== f.key))}
                  disabled={fns.length === 1}
                  className="h-11 rounded-xl px-3 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                  aria-label={`Remove ${f.name || "function"}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-ink-muted">
                  Date
                  <input
                    type="date"
                    value={f.date}
                    onChange={(e) => setFn(f.key, { date: e.target.value })}
                    className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-ink-muted">
                  Time
                  <input
                    type="time"
                    value={f.startTime}
                    onChange={(e) => setFn(f.key, { startTime: e.target.value })}
                    className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
                  />
                </label>
              </div>
              <input
                value={f.venue}
                onChange={(e) => setFn(f.key, { venue: e.target.value })}
                placeholder="Venue for this function (if different)"
                aria-label={`Venue for ${f.name || "this function"}`}
                className="mt-3 h-11 w-full rounded-xl border border-line px-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none"
              />
              {fnError(i) && <p className="mt-2 text-sm text-danger">{fnError(i)}</p>}
            </Card>
          ))}
          <datalist id="function-names">
            {FUNCTION_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        {errors.functions && <p className="mt-2 text-sm text-danger">{errors.functions}</p>}
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={fns.length >= 20}
          onClick={() => setFns((list) => [...list, { key: key(), name: "", date: list.at(-1)?.date ?? "", startTime: "", venue: "" }])}
        >
          <Plus className="size-4" strokeWidth={2.5} /> Add a function
        </Button>
      </section>

      {clashes.data && clashes.data.length > 0 && (
        <div className="flex gap-3 rounded-2xl bg-warning-soft p-4 text-warning">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">You already have work on these dates</p>
            <ul className="mt-1 space-y-0.5">
              {clashes.data.map((c) => (
                <li key={`${c.eventId}-${c.date}-${c.functionName}`}>
                  {formatDate(c.date)}: {c.eventTitle} ({c.functionName})
                </li>
              ))}
            </ul>
            <p className="mt-1">You can still save. Just make sure your team can cover both.</p>
          </div>
        </div>
      )}

      <CustomFieldInputs fields={fields} draft={custom} onChange={setCustom} errors={errors} />
      <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} placeholder="Family contacts, special requests, anything the team should know" />
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending} className="sm:w-auto sm:px-10">
        {event ? "Save event" : "Create event"}
      </Button>
    </form>
  );
}
