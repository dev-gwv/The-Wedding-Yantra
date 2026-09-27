"use client";

import { useCreateVenue, useUpdateVenue } from "@wedding-yantra/api-client/react";
import { venueInput, type Venue } from "@wedding-yantra/types";
import { useState, type FormEvent, type ReactNode } from "react";
import { OptionSelect } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export function VenueFormSheet({ open, onClose, venue, onSaved }: { open: boolean; onClose: () => void; venue?: Venue; onSaved: (venue: Venue) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={venue ? "Edit venue" : "Add a venue"}>
      {open && <VenueForm venue={venue} onSaved={onSaved} />}
    </Sheet>
  );
}

const local = (phone: string | null | undefined) => (phone?.startsWith("+91") ? phone.slice(3) : (phone ?? ""));

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-line p-4">
      <legend className="px-1 font-bold">{title}</legend>
      {children}
    </fieldset>
  );
}

function VenueForm({ venue, onSaved }: { venue?: Venue; onSaved: (venue: Venue) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateVenue(workspace.id);
  const update = useUpdateVenue(workspace.id);
  const [venueType, setVenueType] = useState<string | null>(venue?.venueType ?? null);
  const [catering, setCatering] = useState(venue?.outsideCatering == null ? "" : venue.outsideCatering ? "yes" : "no");
  const [v, setV] = useState({
    name: venue?.name ?? "",
    address: venue?.address ?? "",
    city: venue?.city ?? "",
    mapsUrl: venue?.mapsUrl ?? "",
    contactPerson: venue?.contactPerson ?? "",
    phone: local(venue?.phone),
    capacity: venue?.capacity != null ? String(venue.capacity) : "",
    musicCutoff: venue?.musicCutoff ?? "",
    loadIn: venue?.loadIn ?? "",
    notes: venue?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...v,
      venueType,
      capacity: v.capacity === "" ? null : Number(v.capacity),
      outsideCatering: catering === "" ? null : catering === "yes",
    };
    const check = validate(venueInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      onSaved(venue ? await update.mutateAsync({ id: venue.id, ...payload }) : await create.mutateAsync(payload));
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField
        label="Venue name"
        value={v.name}
        onChange={set("name")}
        error={errors.name}
        autoFocus={!venue}
        placeholder="Rambagh Palace"
        hint={venue ? "Events at this venue change to the new name too" : "Type this same name on an event to show its address and Maps link"}
      />
      <div className="grid grid-cols-2 gap-3">
        <OptionSelect list="venue_type" label="Type" value={venueType} onChange={setVenueType} error={errors.venueType} />
        <TextField label="City" value={v.city} onChange={set("city")} error={errors.city} />
      </div>
      <TextAreaField label="Address" value={v.address} onChange={set("address")} error={errors.address} rows={2} />
      <TextField
        label="Google Maps link"
        type="url"
        inputMode="url"
        value={v.mapsUrl}
        onChange={set("mapsUrl")}
        error={errors.mapsUrl}
        placeholder="https://maps.app.goo.gl/…"
        hint="In Google Maps: Share, then Copy link"
        autoCapitalize="none"
      />
      <TextField
        label="Guests it holds"
        inputMode="numeric"
        value={v.capacity}
        onChange={(e) => setV((x) => ({ ...x, capacity: e.target.value.replace(/\D/g, "") }))}
        error={errors.capacity}
      />

      <Group title="Venue contact">
        <TextField label="Contact person" value={v.contactPerson} onChange={set("contactPerson")} error={errors.contactPerson} placeholder="Banquet manager" />
        <PhoneField label="Mobile" value={v.phone} onChange={set("phone")} error={errors.phone} />
      </Group>

      <Group title="Rules">
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Music stops by" type="time" value={v.musicCutoff} onChange={set("musicCutoff")} error={errors.musicCutoff} />
          <SelectField label="Outside caterers" value={catering} onChange={(e) => setCatering(e.target.value)} error={errors.outsideCatering}>
            <option value="">Not known</option>
            <option value="yes">Allowed</option>
            <option value="no">Not allowed</option>
          </SelectField>
        </div>
        <TextField label="Setup and load-in" value={v.loadIn} onChange={set("loadIn")} error={errors.loadIn} placeholder="From 10 am, back gate, goods lift" />
        <TextAreaField label="Notes" value={v.notes} onChange={set("notes")} error={errors.notes} placeholder="Parking, power backup, fire rules, anything to remember" />
      </Group>

      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      {Object.keys(errors).length > 0 && !errors._ && <Notice tone="danger">Please check the highlighted fields.</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {venue ? "Save" : "Add venue"}
      </Button>
    </form>
  );
}
