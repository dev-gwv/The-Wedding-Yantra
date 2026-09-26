"use client";

import { can, eventScope, formatDateRange } from "@wedding-yantra/core";
import {
  useBookInventory,
  useCreateInventoryItem,
  useDeleteInventoryBooking,
  useDeleteInventoryItem,
  useInventory,
  useInventoryBookings,
  useUpdateInventoryBooking,
  useUpdateInventoryItem,
} from "@wedding-yantra/api-client/react";
import {
  INVENTORY_BOOKING_STATUS_LABELS,
  inventoryBookingInput,
  inventoryItemInput,
  type InventoryBooking,
  type InventoryItem,
  type WeddingEvent,
} from "@wedding-yantra/types";
import { AlertTriangle, Boxes, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Card, IconSquare, Notice, Pill } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function ItemSheet({ open, onClose, item, categories = [] }: { open: boolean; onClose: () => void; item?: InventoryItem; categories?: string[] }) {
  return (
    <Sheet open={open} onClose={onClose} title={item ? item.name : "Add to your stock"}>
      {open && <ItemForm item={item} categories={categories} onDone={onClose} />}
    </Sheet>
  );
}

function ItemForm({ item, categories, onDone }: { item?: InventoryItem; categories: string[]; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateInventoryItem(workspace.id);
  const update = useUpdateInventoryItem(workspace.id);
  const remove = useDeleteInventoryItem(workspace.id);
  const bookings = useInventoryBookings(workspace.id, { itemId: item?.id }, !!item);
  const toast = useToast();
  const [values, setValues] = useState({ name: item?.name ?? "", category: item?.category ?? "", quantity: item ? String(item.quantity) : "", notes: item?.notes ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const coming = (bookings.data ?? []).filter((b) => b.status !== "returned");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(inventoryItemInput, values);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (item) await update.mutateAsync({ id: item.id, ...values });
      else await create.mutateAsync(values);
      toast(item ? "Saved" : "Added to your stock");
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Item" value={values.name} onChange={set("name")} error={errors.name} placeholder="Chiavari chairs" autoFocus={!item} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="How many you own" inputMode="numeric" value={values.quantity} onChange={(e) => setValues((v) => ({ ...v, quantity: e.target.value.replace(/\D/g, "") }))} error={errors.quantity} />
        <TextField label="Group" value={values.category} onChange={set("category")} error={errors.category} placeholder="Furniture" list="inventory-groups" />
        <datalist id="inventory-groups">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <TextAreaField label="Notes" value={values.notes} onChange={set("notes")} error={errors.notes} placeholder="Where it's kept, size, colour" />
      {coming.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">Set aside</p>
          <ul className="space-y-1.5 text-sm">
            {coming.map((b) => (
              <li key={b.id} className="flex justify-between gap-3">
                <Link href={`/app/events/${b.eventId}`} className="truncate font-semibold hover:text-brand-strong">
                  {b.eventTitle}
                </Link>
                <span className={cn("shrink-0 tabular text-ink-muted", b.short > 0 && "font-semibold text-danger")}>
                  {b.quantity} · {formatDateRange(b.fromDate, b.toDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {item ? "Save" : "Add"}
      </Button>
      {item && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {confirm ? (
            <>
              <p className="text-sm text-ink-muted">Remove {item.name} from your stock?</p>
              <Button
                variant="destructive"
                size="sm"
                loading={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(item.id);
                    toast("Removed");
                    onDone();
                  } catch (err) {
                    toast(errorMessage(err), "error");
                    setConfirm(false);
                  }
                }}
              >
                Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
              Remove item
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stock for an event
// ---------------------------------------------------------------------------

function BookingSheet({ open, onClose, event }: { open: boolean; onClose: () => void; event: WeddingEvent }) {
  return (
    <Sheet open={open} onClose={onClose} title="Set stock aside" description={event.startDate ? `${event.title} · ${formatDateRange(event.startDate, event.endDate ?? event.startDate)}` : event.title}>
      {open && <BookingForm event={event} onDone={onClose} />}
    </Sheet>
  );
}

function BookingForm({ event, onDone }: { event: WeddingEvent; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const [values, setValues] = useState({ itemId: "", quantity: "", fromDate: event.startDate ?? "", toDate: event.endDate ?? event.startDate ?? "" });
  const dated = !!(values.fromDate && values.toDate && values.toDate >= values.fromDate);
  const items = useInventory(workspace.id, dated ? { from: values.fromDate, to: values.toDate } : {});
  const book = useBookInventory(workspace.id);
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const picked = items.data?.find((i) => i.id === values.itemId);
  const short = picked && picked.available !== null && Number(values.quantity) > picked.available;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { eventId: event.id, ...values };
    const check = validate(inventoryBookingInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const saved = await book.mutateAsync(payload);
      toast(saved.short > 0 ? `Set aside. ${saved.short} short on the busiest day` : "Set aside");
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <SelectField label="Item" value={values.itemId} onChange={set("itemId")} error={errors.itemId}>
        <option value="">Choose</option>
        {items.data?.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
            {i.available !== null ? ` · ${i.available} of ${i.quantity} free` : ` · ${i.quantity}`}
          </option>
        ))}
      </SelectField>
      <TextField label="How many" inputMode="numeric" value={values.quantity} onChange={(e) => setValues((v) => ({ ...v, quantity: e.target.value.replace(/\D/g, "") }))} error={errors.quantity} />
      {short && (
        <div className="flex gap-2 rounded-2xl bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Only {picked.available} free on these days. You can still set them aside and hire the rest.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="From" type="date" value={values.fromDate} onChange={set("fromDate")} error={errors.fromDate} />
        <TextField label="Until" type="date" value={values.toDate} onChange={set("toDate")} error={errors.toDate} />
      </div>
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={book.isPending}>
        Set aside
      </Button>
    </form>
  );
}

/** "Back" asks how many didn't return; they come off the stock. */
function ReturnSheet({ booking, onClose }: { booking: InventoryBooking | null; onClose: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateInventoryBooking(workspace.id);
  const toast = useToast();
  const [missing, setMissing] = useState("0");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={booking !== null} onClose={onClose} title={booking ? `${booking.itemName} back` : "Back"} description={booking ? `${booking.quantity} went out` : undefined}>
      {booking && (
        <form
          className="space-y-5"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await update.mutateAsync({ id: booking.id, status: "returned", missing: Number(missing || 0) });
              toast(Number(missing) > 0 ? `Back. ${missing} missing, taken off your stock` : "All back");
              setMissing("0");
              onClose();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <TextField
            label="How many didn't come back?"
            inputMode="numeric"
            value={missing}
            onChange={(e) => setMissing(e.target.value.replace(/\D/g, ""))}
            hint="Broken or lost ones come off your stock."
            error={error ?? undefined}
          />
          <Button type="submit" size="lg" loading={update.isPending}>
            Mark back
          </Button>
        </form>
      )}
    </Sheet>
  );
}

function BookingRow({ b, crew, manage, onBack }: { b: InventoryBooking; crew: boolean; manage: boolean; onBack: (b: InventoryBooking) => void }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateInventoryBooking(workspace.id);
  const remove = useDeleteInventoryBooking(workspace.id);
  const toast = useToast();
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="min-w-40 flex-1">
        <p className="font-bold">
          {b.quantity} × {b.itemName}
        </p>
        <p className="text-sm text-ink-muted">
          {formatDateRange(b.fromDate, b.toDate)}
          {b.missing > 0 && ` · ${b.missing} missing`}
        </p>
        {b.short > 0 && (
          <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-danger">
            <AlertTriangle className="size-3.5" /> {b.short} short: other events need them too
          </p>
        )}
      </div>
      <Pill tone={b.status === "returned" ? "success" : b.status === "out" ? "brand" : "neutral"}>{INVENTORY_BOOKING_STATUS_LABELS[b.status]}</Pill>
      {crew && b.status === "booked" && (
        <Button size="sm" variant="secondary" loading={update.isPending} onClick={() => run(() => update.mutateAsync({ id: b.id, status: "out" }), "Marked out")}>
          Out
        </Button>
      )}
      {crew && b.status === "out" && (
        <Button size="sm" variant="secondary" onClick={() => onBack(b)}>
          Back
        </Button>
      )}
      {manage && b.status !== "out" && (
        <button type="button" className="text-sm font-semibold text-ink-muted hover:text-danger" onClick={() => run(() => remove.mutateAsync(b.id), "Freed")}>
          Free
        </button>
      )}
    </li>
  );
}

/** Stock this event needs: set aside, out, back. Shown once the business keeps stock. */
export function EventStock({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  const sees = eventScope(workspace.role) === "all";
  const manage = can(workspace.role, "events.manage");
  const crew = can(workspace.role, "tasks.work");
  const items = useInventory(workspace.id, {}, sees);
  const list = useInventoryBookings(workspace.id, { eventId: event.id }, sees);
  const [adding, setAdding] = useState(false);
  const [returning, setReturning] = useState<InventoryBooking | null>(null);
  if (!sees || !items.data || items.data.length === 0) return null;
  const bookings = list.data ?? [];
  if (bookings.length === 0 && (!manage || event.status === "cancelled")) return null;

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-extrabold">Stock</h2>
      {bookings.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {bookings.map((b) => (
              <BookingRow key={b.id} b={b} crew={crew} manage={manage} onBack={setReturning} />
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="flex items-start gap-4 p-5">
          <IconSquare icon={Boxes} />
          <p className="text-sm text-ink-muted">Set aside what this event needs from your stock. You&apos;ll be warned if another event needs the same on these days.</p>
        </Card>
      )}
      {manage && event.status !== "cancelled" && (
        <Button variant="secondary" className="mt-3" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Set stock aside
        </Button>
      )}
      <BookingSheet open={adding} onClose={() => setAdding(false)} event={event} />
      <ReturnSheet booking={returning} onClose={() => setReturning(null)} />
    </section>
  );
}

