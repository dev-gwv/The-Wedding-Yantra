"use client";

import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, formatMoney, upiLink, type PaymentMethod } from "@wedding-yantra/core";
import {
  useCreatePayout,
  useCreateVendor,
  useDeletePayout,
  useEvents,
  usePayPayout,
  useUnpayPayout,
  useUpdatePayout,
  useUpdateVendor,
  useVendors,
} from "@wedding-yantra/api-client/react";
import { payoutInput, payPayoutInput, updatePayoutInput, vendorInput, type Payout, type Vendor } from "@wedding-yantra/types";
import { Smartphone } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

const national = (e164: string | null) => (e164?.startsWith("+91") ? e164.slice(3) : (e164 ?? ""));
const NEW = "__new__";

/** Add a vendor, or change one. */
export function VendorSheet({ open, onClose, vendor, onSaved }: { open: boolean; onClose: () => void; vendor?: Vendor; onSaved?: (v: Vendor) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={vendor ? "Edit vendor" : "Add a vendor"}>
      {open && <VendorForm vendor={vendor} onDone={(v) => (onSaved ? onSaved(v) : onClose())} />}
    </Sheet>
  );
}

function VendorForm({ vendor, onDone }: { vendor?: Vendor; onDone: (v: Vendor) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateVendor(workspace.id);
  const update = useUpdateVendor(workspace.id);
  const toast = useToast();
  const [values, setValues] = useState({
    name: vendor?.name ?? "",
    service: vendor?.service ?? "",
    phone: national(vendor?.phone ?? null),
    upiId: vendor?.upiId ?? "",
    notes: vendor?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(vendorInput, values);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const saved = vendor ? await update.mutateAsync({ id: vendor.id, ...values }) : await create.mutateAsync(values);
      toast(vendor ? "Vendor saved" : "Vendor added");
      onDone(saved);
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Name" value={values.name} onChange={set("name")} error={errors.name} placeholder="Ramesh Florist" autoFocus={!vendor} />
      <TextField label="What they do" value={values.service} onChange={set("service")} error={errors.service} placeholder="Flowers, generator, helper, second shooter" />
      <PhoneField label="Mobile number" value={values.phone} onChange={set("phone")} error={errors.phone} />
      <TextField
        label="UPI ID"
        value={values.upiId}
        onChange={set("upiId")}
        error={errors.upiId}
        placeholder="ramesh@okaxis"
        autoCapitalize="none"
        hint="Pay them from your UPI app in one tap, with the amount filled in."
      />
      <TextAreaField label="Notes" value={values.notes} onChange={set("notes")} error={errors.notes} placeholder="Rates, bank details, anything to remember" />
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {vendor ? "Save" : "Add vendor"}
      </Button>
    </form>
  );
}

/** Note what an event owes a vendor; pick the vendor, or add a new one on the spot. */
export function PayoutSheet({
  open,
  onClose,
  payout,
  eventId,
  vendorId,
}: {
  open: boolean;
  onClose: () => void;
  payout?: Payout;
  /** Opened from an event: it's for that event */
  eventId?: string;
  /** Opened from a vendor: it's for them */
  vendorId?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={payout ? "Payout" : "Add what you owe"} description={payout ? `${payout.vendorName} · ${formatMoney(payout.amount)}` : undefined}>
      {open && <PayoutForm payout={payout} eventId={eventId} vendorId={vendorId} onDone={onClose} />}
    </Sheet>
  );
}

function PayoutForm({ payout, eventId, vendorId, onDone }: { payout?: Payout; eventId?: string; vendorId?: string; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const day = useBusinessDay();
  const vendors = useVendors(workspace.id);
  const events = useEvents(workspace.id, { from: day(-120) }, !eventId);
  const createVendor = useCreateVendor(workspace.id);
  const create = useCreatePayout(workspace.id);
  const update = useUpdatePayout(workspace.id);
  const remove = useDeletePayout(workspace.id);
  const unpay = useUnpayPayout(workspace.id);
  const toast = useToast();
  const [values, setValues] = useState({
    vendorId: payout?.vendorId ?? vendorId ?? "",
    eventId: payout?.eventId ?? eventId ?? "",
    description: payout?.description ?? "",
    amount: payout ? String(payout.amount) : "",
    dueDate: payout?.dueDate ?? "",
  });
  const [newVendor, setNewVendor] = useState({ name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"delete" | "unpay" | null>(null);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const adding = values.vendorId === NEW;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const base = { ...values, eventId: values.eventId || null };
    const check = validate(payout ? updatePayoutInput : payoutInput, adding ? { ...base, vendorId: crypto.randomUUID() } : base);
    const vendorCheck = adding ? validate(vendorInput, newVendor) : { errors: undefined };
    if (check.errors || vendorCheck.errors) {
      return setErrors({ ...check.errors, ...(vendorCheck.errors && { newName: vendorCheck.errors.name ?? "", newPhone: vendorCheck.errors.phone ?? "" }) });
    }
    setErrors({});
    try {
      const vId = adding ? (await createVendor.mutateAsync(newVendor)).id : values.vendorId;
      const body = { ...base, vendorId: vId };
      if (payout) await update.mutateAsync({ id: payout.id, ...body });
      else await create.mutateAsync(body);
      toast(payout ? "Saved" : "Added");
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  async function act(kind: "delete" | "unpay") {
    try {
      if (kind === "delete") await remove.mutateAsync(payout!.id);
      else await unpay.mutateAsync(payout!.id);
      toast(kind === "delete" ? "Removed" : "Marked as not paid");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <SelectField label="Who" value={values.vendorId} onChange={set("vendorId")} error={errors.vendorId}>
        <option value="">Choose</option>
        {vendors.data?.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.service ? ` · ${v.service}` : ""}
          </option>
        ))}
        <option value={NEW}>+ Someone new</option>
      </SelectField>
      {adding && (
        <div className="grid gap-3 rounded-2xl bg-cream/60 p-4 sm:grid-cols-2">
          <TextField label="Their name" value={newVendor.name} onChange={(e) => setNewVendor((v) => ({ ...v, name: e.target.value }))} error={errors.newName} />
          <PhoneField label="Mobile number" value={newVendor.phone} onChange={(e) => setNewVendor((v) => ({ ...v, phone: e.target.value }))} error={errors.newPhone} />
        </div>
      )}
      <TextField label="For" value={values.description} onChange={set("description")} error={errors.description} placeholder="Mandap flowers" />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Amount (₹)"
          inputMode="decimal"
          value={values.amount}
          onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") }))}
          error={errors.amount}
        />
        <TextField label="Pay by" type="date" value={values.dueDate} onChange={set("dueDate")} error={errors.dueDate} />
      </div>
      {!eventId && (
        <SelectField label="Event" value={values.eventId} onChange={set("eventId")} error={errors.eventId}>
          <option value="">Not for an event</option>
          {events.data?.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </SelectField>
      )}
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending || createVendor.isPending}>
        {payout ? "Save" : "Add"}
      </Button>

      {payout && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {confirm ? (
            <>
              <p className="text-sm text-ink-muted">
                {confirm === "delete" ? "Remove this payout?" : "Mark as not paid? Its expense is removed from the event."}
              </p>
              <Button variant="destructive" size="sm" loading={remove.isPending || unpay.isPending} onClick={() => act(confirm)}>
                {confirm === "delete" ? "Remove" : "Not paid"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                Keep it
              </Button>
            </>
          ) : (
            <>
              {payout.status === "paid" && (
                <Button variant="ghost" size="sm" onClick={() => setConfirm("unpay")}>
                  Mark as not paid
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setConfirm("delete")}>
                Remove
              </Button>
            </>
          )}
        </div>
      )}
    </form>
  );
}

/** Pay a vendor: by UPI straight from here, or note cash or a transfer. It becomes an expense on the event. */
export function PaySheet({ payout, onClose }: { payout: Payout | null; onClose: () => void }) {
  return (
    <Sheet open={payout !== null} onClose={onClose} title={payout ? `Pay ${payout.vendorName}` : "Pay"} description={payout ? `${payout.description} · ${formatMoney(payout.amount)}` : undefined}>
      {payout && <PayForm payout={payout} onDone={onClose} />}
    </Sheet>
  );
}

function PayForm({ payout, onDone }: { payout: Payout; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const pay = usePayPayout(workspace.id);
  const toast = useToast();
  const today = useBusinessDay()();
  const [values, setValues] = useState({ paidOn: today, method: (payout.vendorUpiId ? "upi" : "cash") as PaymentMethod, reference: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(payPayoutInput, values);
    if (check.errors) return setErrors(check.errors);
    try {
      await pay.mutateAsync({ id: payout.id, ...values });
      toast(`Paid ${payout.vendorName.split(" ")[0]} ${formatMoney(payout.amount)}`);
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {payout.vendorUpiId && values.method === "upi" && (
        <div className="rounded-2xl bg-cream/60 p-4">
          <a
            href={upiLink({ upiId: payout.vendorUpiId, payee: payout.vendorName, amount: payout.amount, note: payout.description })}
            className={buttonClass({ variant: "secondary" })}
          >
            <Smartphone className="size-4" /> Open UPI app for {formatMoney(payout.amount)}
          </a>
          <p className="mt-2 text-sm text-ink-muted">To {payout.vendorUpiId}. Come back and save once it&apos;s paid.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Paid on" type="date" value={values.paidOn} onChange={(e) => setValues((v) => ({ ...v, paidOn: e.target.value }))} error={errors.paidOn} />
        <SelectField label="How" value={values.method} onChange={(e) => setValues((v) => ({ ...v, method: e.target.value as PaymentMethod }))} error={errors.method}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField label="Reference" value={values.reference} onChange={(e) => setValues((v) => ({ ...v, reference: e.target.value }))} error={errors.reference} placeholder="UPI or bank reference (optional)" />
      <p className="text-sm text-ink-muted">It&apos;s added to the event&apos;s expenses, so its profit stays right.</p>
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={pay.isPending}>
        Mark {formatMoney(payout.amount)} paid
      </Button>
    </form>
  );
}
