"use client";

import { useCreateClient, useUpdateClient } from "@wedding-yantra/api-client/react";
import { clientInput, type Client } from "@wedding-yantra/types";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, TextAreaField, TextField } from "@/components/ui/field";
import { checkDraft, CustomFieldInputs, customPayload, toDraft, useEntityFields } from "@/components/app/custom-fields";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
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

function ClientForm({ client, onSaved }: { client?: Client; onSaved: (client: Client) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateClient(workspace.id);
  const update = useUpdateClient(workspace.id, client?.id ?? "");
  const [values, setValues] = useState({
    name: client?.name ?? "",
    phone: client?.phone?.startsWith("+91") ? client.phone.slice(3) : (client?.phone ?? ""),
    email: client?.email ?? "",
    city: client?.city ?? "",
    notes: client?.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = useEntityFields("client");
  const [custom, setCustom] = useState(() => toDraft(client?.custom));
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { ...values, custom: customPayload(fields, custom) };
    const check = validate(clientInput, payload);
    const customErrors = checkDraft(fields, custom);
    if (check.errors || Object.keys(customErrors).length) return setErrors({ ...check.errors, ...customErrors });
    setErrors({});
    try {
      onSaved(client ? await update.mutateAsync(payload) : await create.mutateAsync(payload));
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Name" value={values.name} onChange={set("name")} error={errors.name} autoFocus={!client} />
      <PhoneField label="Mobile number" value={values.phone} onChange={set("phone")} error={errors.phone} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="City" value={values.city} onChange={set("city")} error={errors.city} />
        <TextField label="Email" type="email" value={values.email} onChange={set("email")} error={errors.email} />
      </div>
      <CustomFieldInputs fields={fields} draft={custom} onChange={setCustom} errors={errors} />
      <TextAreaField label="Notes" value={values.notes} onChange={set("notes")} error={errors.notes} placeholder="Family contacts, preferences, anything to remember" />
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {client ? "Save" : "Add client"}
      </Button>
    </form>
  );
}
