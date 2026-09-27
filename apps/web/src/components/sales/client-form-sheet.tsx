"use client";

import { useCreateClient, useUpdateClient } from "@wedding-yantra/api-client/react";
import { clientInput, LEAD_SOURCES, SOURCE_LABELS, type Client, type LeadSource } from "@wedding-yantra/types";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { OptionSelect } from "@/components/app/option-picker";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { checkDraft, CustomFieldInputs, customPayload, toDraft, useEntityFields } from "@/components/app/custom-fields";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export function ClientFormSheet({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client;
  onSaved: (client: Client) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={client ? "Edit client" : "Add a client"}>
      {open && <ClientForm client={client} onSaved={onSaved} />}
    </Sheet>
  );
}

const local = (phone: string | null | undefined) => (phone?.startsWith("+91") ? phone.slice(3) : (phone ?? ""));

interface ContactDraft {
  key: string;
  name: string;
  relation: string | null;
  phone: string;
}

let seq = 0;
const blankContact = (): ContactDraft => ({ key: `n${++seq}`, name: "", relation: null, phone: "" });

/** A part of the form that folds away. It opens when it has something in it, or a mistake. */
function Section({ title, hint, defaultOpen, forceOpen, children }: { title: string; hint: string; defaultOpen?: boolean; forceOpen?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(!!defaultOpen);
  const open = shown || !!forceOpen;
  return (
    <section className="rounded-2xl border border-line">
      <button type="button" onClick={() => setShown(!shown)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {!open && <span className="block truncate text-sm text-ink-muted">{hint}</span>}
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-ink-muted transition", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-4 border-t border-line p-4">{children}</div>}
    </section>
  );
}

function ClientForm({ client, onSaved }: { client?: Client; onSaved: (client: Client) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateClient(workspace.id);
  const update = useUpdateClient(workspace.id, client?.id ?? "");
  const [values, setValues] = useState({
    name: client?.name ?? "",
    phone: local(client?.phone),
    email: client?.email ?? "",
    city: client?.city ?? "",
    notes: client?.notes ?? "",
  });
  const [relation, setRelation] = useState<string | null>(client?.relation ?? null);
  const [source, setSource] = useState<LeadSource | "">(client?.source ?? "");
  const [contacts, setContacts] = useState<ContactDraft[]>((client?.contacts ?? []).map((c) => ({ key: c.id, name: c.name, relation: c.relation, phone: local(c.phone) })));
  const [wedding, setWedding] = useState({
    brideName: client?.wedding.brideName ?? "",
    groomName: client?.wedding.groomName ?? "",
    guestCount: client?.wedding.guestCount != null ? String(client.wedding.guestCount) : "",
  });
  const [noMessages, setNoMessages] = useState(client?.noMessages ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = useEntityFields("client");
  const [custom, setCustom] = useState(() => toDraft(client?.custom));
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const setContact = (key: string, patch: Partial<ContactDraft>) => setContacts((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const hasErrorIn = (prefix: string) => Object.keys(errors).some((k) => k.startsWith(prefix));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...values,
      relation,
      source: source || null,
      contacts: contacts.filter((c) => c.name.trim() || c.phone.trim()).map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
      wedding,
      custom: customPayload(fields, custom),
      ...(client ? { noMessages } : {}),
    };
    const check = validate(clientInput, payload);
    const customErrors = checkDraft(fields, custom);
    if (check.errors || Object.keys(customErrors).length) return setErrors({ ...check.errors, ...customErrors });
    setErrors({});
    try {
      onSaved(client ? await update.mutateAsync(payload) : await create.mutateAsync(payload));
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: errorMessage(err) });
    }
  }

  const weddingHint =
    [wedding.brideName && wedding.groomName ? `${wedding.brideName} & ${wedding.groomName}` : wedding.brideName || wedding.groomName, wedding.guestCount && `${wedding.guestCount} guests`]
      .filter(Boolean)
      .join(" · ") || "Bride, groom, guests";

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <TextField
          label="Client name"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
          autoFocus={!client}
          placeholder="Who booked you"
          hint="The bride, the groom, a parent, or a group"
        />
        <OptionSelect list="relation" label="Relationship" value={relation} onChange={setRelation} error={errors.relation} />
      </div>
      <PhoneField label="Mobile number" value={values.phone} onChange={set("phone")} error={errors.phone} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="City" value={values.city} onChange={set("city")} error={errors.city} />
        <TextField label="Email" type="email" value={values.email} onChange={set("email")} error={errors.email} />
      </div>
      <SelectField label="Came from" value={source} onChange={(e) => setSource(e.target.value as LeadSource | "")} error={errors.source}>
        <option value="">Not set</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABELS[s]}
          </option>
        ))}
      </SelectField>

      <Section
        title="Emergency contacts"
        hint={contacts.map((c) => c.name).filter(Boolean).join(", ") || "Who to call when the client can't be reached"}
        defaultOpen={contacts.length > 0}
        forceOpen={hasErrorIn("contacts")}
      >
        <p className="text-sm text-ink-muted">Who to call for decisions on the wedding day, or whenever the client can&apos;t be reached.</p>
        {contacts.map((c, i) => (
          <div key={c.key} className="space-y-3 rounded-2xl bg-cream/60 p-3">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <TextField label="Name" value={c.name} onChange={(e) => setContact(c.key, { name: e.target.value })} error={errors[`contacts.${i}.name`]} />
              <button
                type="button"
                onClick={() => setContacts((cs) => cs.filter((x) => x.key !== c.key))}
                aria-label={`Remove ${c.name || "contact"}`}
                className="mb-1 grid size-10 place-items-center rounded-xl text-ink-muted hover:bg-surface hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <OptionSelect list="relation" label="Relationship" value={c.relation} onChange={(v) => setContact(c.key, { relation: v })} error={errors[`contacts.${i}.relation`]} />
            <PhoneField label="Mobile" value={c.phone} onChange={(e) => setContact(c.key, { phone: e.target.value })} error={errors[`contacts.${i}.phone`]} />
          </div>
        ))}
        {contacts.length < 10 && (
          <Button variant="secondary" size="sm" onClick={() => setContacts((cs) => [...cs, blankContact()])}>
            <Plus className="size-4" /> Add an emergency contact
          </Button>
        )}
      </Section>

      <Section title="The wedding" hint={weddingHint} defaultOpen={!!(wedding.brideName || wedding.groomName || wedding.guestCount)} forceOpen={hasErrorIn("wedding")}>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Bride's name" value={wedding.brideName} onChange={(e) => setWedding((x) => ({ ...x, brideName: e.target.value }))} error={errors["wedding.brideName"]} />
          <TextField label="Groom's name" value={wedding.groomName} onChange={(e) => setWedding((x) => ({ ...x, groomName: e.target.value }))} error={errors["wedding.groomName"]} />
        </div>
        <TextField
          label="Number of guests"
          inputMode="numeric"
          value={wedding.guestCount}
          onChange={(e) => setWedding((x) => ({ ...x, guestCount: e.target.value.replace(/\D/g, "") }))}
          error={errors["wedding.guestCount"]}
          hint="The wedding date comes from their event."
        />
      </Section>

      <CustomFieldInputs fields={fields} draft={custom} onChange={setCustom} errors={errors} />
      <TextAreaField label="Notes" value={values.notes} onChange={set("notes")} error={errors.notes} placeholder="Preferences, anything to remember" />
      {client && (
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 py-3 has-[:checked]:border-sun-300 has-[:checked]:bg-cream">
          <input type="checkbox" checked={noMessages} onChange={(e) => setNoMessages(e.target.checked)} className="size-5 accent-brand" />
          <span className="font-semibold">No wishes or offers</span>
          <span className="text-sm text-ink-muted">Left out of messages to clients</span>
        </label>
      )}
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      {Object.keys(errors).length > 0 && !errors._ && <Notice tone="danger">Please check the highlighted fields.</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {client ? "Save" : "Add client"}
      </Button>
    </form>
  );
}
