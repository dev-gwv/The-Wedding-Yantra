"use client";

import { can } from "@wedding-yantra/core";
import { useCreateLead, useTeam, useUpdateLead } from "@wedding-yantra/api-client/react";
import {
  createLeadInput,
  EVENT_LABELS,
  EVENT_TYPES,
  LEAD_SOURCES,
  SOURCE_LABELS,
  type EventType,
  type Lead,
  type LeadSource,
  type PersonRef,
} from "@wedding-yantra/types";
import { ChevronDown } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { ClientPicker } from "./client-picker";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

interface Values {
  name: string;
  phone: string;
  eventType: string;
  eventDate: string;
  budget: string;
  source: string;
  email: string;
  city: string;
  venue: string;
  guestCount: string;
  referredBy: string;
  requirements: string;
  assignedToUserId: string;
}

const national = (e164: string | null) => (e164?.startsWith("+91") ? e164.slice(3) : (e164 ?? ""));

function initial(lead?: Lead): Values {
  return {
    name: lead?.name ?? "",
    phone: national(lead?.phone ?? null),
    eventType: lead?.eventType ?? "",
    eventDate: lead?.eventDate ?? "",
    budget: lead?.budget != null ? String(lead.budget) : "",
    source: lead?.source ?? "",
    email: lead?.email ?? "",
    city: lead?.city ?? "",
    venue: lead?.venue ?? "",
    guestCount: lead?.guestCount != null ? String(lead.guestCount) : "",
    referredBy: lead?.referredBy ?? "",
    requirements: lead?.requirements ?? "",
    assignedToUserId: lead?.assignedTo?.id ?? "",
  };
}

/** Add a new lead, or edit one. Everyday fields first; the rest folded under "More details". */
export function LeadFormSheet({
  open,
  onClose,
  lead,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  lead?: Lead;
  onSaved: (lead: Lead) => void;
}) {
  // Re-mount the form each time it opens so it starts from the latest values.
  return (
    <Sheet open={open} onClose={onClose} title={lead ? "Edit lead" : "Add a lead"}>
      {open && <LeadForm lead={lead} onSaved={onSaved} />}
    </Sheet>
  );
}

function LeadForm({ lead, onSaved }: { lead?: Lead; onSaved: (lead: Lead) => void }) {
  const { workspace } = useCurrentWorkspace();
  const canAssign = can(workspace.role, "leads.assign");
  // Naming a client as the referrer needs the client list, which staff don't see.
  const canPickClient = can(workspace.role, "clients.view");
  const [referrer, setReferrer] = useState<PersonRef | null>(lead?.referredByClient ?? null);
  const team = useTeam(canAssign ? workspace.id : null);
  const create = useCreateLead(workspace.id);
  const update = useUpdateLead(workspace.id, lead?.id ?? "");
  const [values, setValues] = useState<Values>(() => initial(lead));
  const [more, setMore] = useState(() => !!lead && !!(lead.email || lead.venue || lead.requirements || lead.referredBy));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = create.isPending || update.isPending;

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const referral = values.source === "referral";

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: values.name,
      phone: values.phone,
      email: values.email,
      eventType: (values.eventType || null) as EventType | null,
      eventDate: values.eventDate,
      city: values.city,
      venue: values.venue,
      guestCount: values.guestCount,
      budget: values.budget,
      source: (values.source || undefined) as LeadSource | undefined,
      // A picked client is the referrer; their name goes in "Referred by" too.
      referredBy: referral && referrer ? referrer.name : values.referredBy,
      ...(canPickClient ? { referredByClientId: referral ? (referrer?.id ?? null) : null } : {}),
      requirements: values.requirements,
      ...(canAssign && values.assignedToUserId ? { assignedToUserId: values.assignedToUserId } : {}),
    };
    const check = validate(createLeadInput, payload);
    if (check.errors) {
      setErrors(check.errors);
      if (["email", "venue", "guestCount", "requirements", "city", ...(referral ? [] : ["referredBy"])].some((k) => check.errors[k])) setMore(true);
      return;
    }
    setErrors({});
    try {
      const saved = lead ? await update.mutateAsync(payload) : await create.mutateAsync(payload);
      onSaved(saved);
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Name" value={values.name} onChange={set("name")} error={errors.name} placeholder="Neha Kapoor" autoFocus={!lead} />
      <PhoneField label="Mobile number" value={values.phone} onChange={set("phone")} error={errors.phone} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Event" value={values.eventType} onChange={set("eventType")} error={errors.eventType}>
          <option value="">Not sure yet</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EVENT_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Event date" type="date" value={values.eventDate} onChange={set("eventDate")} error={errors.eventDate} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Budget (₹)"
          inputMode="numeric"
          value={values.budget}
          onChange={(e) => setValues((v) => ({ ...v, budget: e.target.value.replace(/[^\d]/g, "") }))}
          error={errors.budget}
          placeholder="1,50,000"
        />
        <SelectField label="Came from" value={values.source} onChange={set("source")} error={errors.source}>
          <option value="">Choose</option>
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </SelectField>
      </div>

      {referral && (
        <div className="space-y-3 rounded-2xl bg-cream/60 p-4">
          {canPickClient ? (
            <ClientPicker
              label="Which client referred them?"
              value={referrer}
              onChange={setReferrer}
              error={errors.referredByClientId}
              hint="Find them by name or number. Their client page then lists who they sent you."
            />
          ) : (
            referrer && (
              <p className="text-sm">
                <span className="font-semibold">Referred by</span> {referrer.name}
              </p>
            )
          )}
          {!referrer && (
            <TextField
              label={canPickClient ? "Or who referred them" : "Referred by"}
              value={values.referredBy}
              onChange={set("referredBy")}
              error={errors.referredBy}
              placeholder="A friend, a planner, a venue"
            />
          )}
        </div>
      )}

      {canAssign && team.data && team.data.members.length > 1 && (
        <SelectField label="Who handles it" value={values.assignedToUserId} onChange={set("assignedToUserId")} error={errors.assignedToUserId}>
          {!lead && <option value="">Me</option>}
          {team.data.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name ?? m.phone}
              {m.isYou ? " (you)" : ""}
            </option>
          ))}
        </SelectField>
      )}

      {more ? (
        <div className="space-y-5 border-t border-line pt-5">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="City" value={values.city} onChange={set("city")} error={errors.city} />
            <TextField
              label="Guests"
              inputMode="numeric"
              value={values.guestCount}
              onChange={(e) => setValues((v) => ({ ...v, guestCount: e.target.value.replace(/[^\d]/g, "") }))}
              error={errors.guestCount}
            />
          </div>
          <TextField label="Venue" value={values.venue} onChange={set("venue")} error={errors.venue} />
          <TextField label="Email" type="email" value={values.email} onChange={set("email")} error={errors.email} />
          {!referral && <TextField label="Referred by" value={values.referredBy} onChange={set("referredBy")} error={errors.referredBy} />}
          <TextAreaField
            label="What they need"
            value={values.requirements}
            onChange={set("requirements")}
            error={errors.requirements}
            placeholder="Bridal makeup for 3 functions, trial in October"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setMore(true)}
          className="inline-flex items-center gap-1 text-sm font-bold text-brand-strong hover:text-brand-deep"
        >
          More details <ChevronDown className="size-4" />
        </button>
      )}

      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={busy}>
        {lead ? "Save" : "Add lead"}
      </Button>
    </form>
  );
}
