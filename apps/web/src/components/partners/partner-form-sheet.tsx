"use client";

import { can } from "@wedding-yantra/core";
import { useCreatePartner, useUpdatePartner, useVendors } from "@wedding-yantra/api-client/react";
import { partnerInput, type Partner } from "@wedding-yantra/types";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

/** Kinds of partners most wedding businesses collaborate with. Any other can be typed. */
const LABELS = ["Boutique", "Jeweller", "Venue", "Salon", "Photographer", "Decorator", "Wedding planner", "Caterer", "Influencer", "Store"];

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
  const vendors = useVendors(workspace.id, can(workspace.role, "finance.view"));
  const [v, setV] = useState({
    name: partner?.name ?? "",
    label: partner?.label ?? "",
    phone: local(partner?.phone),
    notes: partner?.notes ?? "",
  });
  const [vendorId, setVendorId] = useState(partner?.vendorId ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { ...v, vendorId: vendorId || null };
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
      <TextField label="What they are" value={v.label} onChange={set("label")} error={errors.label} list="partner-labels" placeholder="Boutique, jeweller, venue…" />
      <datalist id="partner-labels">
        {LABELS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <PhoneField label="Their mobile" value={v.phone} onChange={set("phone")} error={errors.phone} hint="To send them their page on WhatsApp" />
      {(vendors.data?.length ?? 0) > 0 && (
        <SelectField label="Also one of your vendors?" value={vendorId} onChange={(e) => setVendorId(e.target.value)} error={errors.vendorId}>
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
