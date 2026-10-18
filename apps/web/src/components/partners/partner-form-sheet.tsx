"use client";

import { can } from "@wedding-yantra/core";
import { useCreatePartner, useUpdatePartner, useVendors } from "@wedding-yantra/api-client/react";
import { partnerInput, type Partner } from "@wedding-yantra/types";
import { Check, Plus } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

/** Kinds of partners most wedding businesses collaborate with. Any other can be typed. */
const LABELS = ["Boutique", "Jeweller", "Venue", "Salon", "Photographer", "Decorator", "Wedding planner", "Caterer", "Influencer", "Store"];

/**
 * A partner can be several kinds (a wedding planner who also shoots photos): stored as one label,
 * joined with ", ". The usual kinds come back in their usual spelling.
 */
const splitKinds = (label: string | null | undefined) => [
  ...new Set(
    (label ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => LABELS.find((l) => l.toLowerCase() === x.toLowerCase()) ?? x),
  ),
];

export function PartnerFormSheet({ open, onClose, partner, onSaved }: { open: boolean; onClose: () => void; partner?: Partner; onSaved: (p: Partner) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={partner ? "Edit partner" : "Add a partner"} description={partner ? undefined : "They get their own QR code for your enquiry form."}>
      {open && <PartnerForm partner={partner} onSaved={onSaved} />}
    </Sheet>
  );
}

const local = (phone: string | null | undefined) => (phone?.startsWith("+91") ? phone.slice(3) : (phone ?? ""));

function PartnerForm({ partner, onSaved }: { partner?: Partner; onSaved: (p: Partner) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreatePartner(workspace.id);
  const update = useUpdatePartner(workspace.id);
  const vendors = useVendors(workspace.id, can(workspace, "finance.view"));
  const [v, setV] = useState({
    name: partner?.name ?? "",
    phone: local(partner?.phone),
    notes: partner?.notes ?? "",
  });
  const [kinds, setKinds] = useState(() => splitKinds(partner?.label));
  // Kinds typed in, shown as chips next to the usual ones (they stay when unticked).
  const [custom, setCustom] = useState(() => kinds.filter((k) => !LABELS.includes(k)));
  const [other, setOther] = useState("");
  const [vendorId, setVendorId] = useState(partner?.vendorId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [key]: e.target.value }));

  const toggle = (kind: string) => setKinds((list) => (list.includes(kind) ? list.filter((k) => k !== kind) : [...list, kind]));
  // A kind typed in becomes a chip, ticked. One of the usual kinds just gets ticked.
  function addOther() {
    const [kind] = splitKinds(other.replace(/,/g, " "));
    setOther("");
    if (!kind) return;
    if (!LABELS.includes(kind)) setCustom((list) => (list.includes(kind) ? list : [...list, kind]));
    setKinds((list) => (list.includes(kind) ? list : [...list, kind]));
  }
  const onOtherKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addOther();
    }
  };

  // Picking a vendor fills in what's still blank: their name, number and what they do.
  function pickVendor(id: string) {
    setVendorId(id);
    const x = vendors.data?.find((y) => y.id === id);
    if (!x) return;
    setV((cur) => ({ ...cur, name: cur.name || x.name, phone: cur.phone || local(x.phone) }));
    const theirs = splitKinds(x.service);
    if (kinds.length === 0 && theirs.length) {
      setKinds(theirs);
      setCustom((list) => [...list, ...theirs.filter((k) => !LABELS.includes(k) && !list.includes(k))]);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Something typed but not added yet still counts.
    const typed = splitKinds(other.replace(/,/g, " "))[0];
    const label = [...kinds, ...(typed && !kinds.includes(typed) ? [typed] : [])].join(", ");
    const payload = { ...v, label, vendorId: vendorId || null };
    const check = validate(partnerInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      onSaved(partner ? await update.mutateAsync({ id: partner.id, ...payload }) : await create.mutateAsync(payload));
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Partner's name" value={v.name} onChange={set("name")} error={errors.name} autoFocus={!partner} placeholder="Riya Boutique" />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What they are (tick all that apply)</legend>
        <div className="flex flex-wrap gap-2">
          {[...LABELS, ...custom].map((kind) => {
            const on = kinds.includes(kind);
            return (
              <button
                key={kind}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(kind)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition",
                  on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface hover:border-sun-300",
                )}
              >
                {on && <Check className="size-4" />} {kind}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-end gap-2">
          <TextField label="Something else" value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={onOtherKey} maxLength={60} placeholder="Mehendi artist" className="flex-1" />
          <Button type="button" variant="secondary" onClick={addOther} disabled={!other.trim()} aria-label="Add this kind">
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {errors.label && <p className="mt-1.5 text-sm text-danger">{errors.label}</p>}
      </fieldset>
      <PhoneField label="Their mobile" value={v.phone} onChange={set("phone")} error={errors.phone} hint="To send them their page on WhatsApp" />
      {(vendors.data?.length ?? 0) > 0 && (
        <SelectField label="Also one of your vendors?" value={vendorId} onChange={(e) => pickVendor(e.target.value)} error={errors.vendorId}>
          <option value="">No</option>
          {vendors.data!.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} error={errors.notes} placeholder="What you agreed: where the QR is placed, any commission" />
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {partner ? "Save" : "Add partner and make QR"}
      </Button>
    </form>
  );
}
