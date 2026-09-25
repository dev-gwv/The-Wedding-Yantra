"use client";

import { can } from "@wedding-yantra/core";
import { useUpdateWorkspace, useWorkspace } from "@wedding-yantra/api-client/react";
import { updateWorkspaceInput, type Workspace } from "@wedding-yantra/types";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export default function BusinessProfilePage() {
  const { workspace } = useCurrentWorkspace();
  const details = useWorkspace(workspace.id);

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Business profile" subtitle="Shown on your quotes and bills." />
      {details.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {details.isError && <Notice tone="danger">{errorMessage(details.error)}</Notice>}
      {details.data && <ProfileForm key={details.data.id} workspace={details.data} />}
    </>
  );
}

function ProfileForm({ workspace }: { workspace: Workspace }) {
  const update = useUpdateWorkspace(workspace.id);
  const toast = useToast();
  const editable = can(workspace.role, "workspace.update");
  const [values, setValues] = useState({
    name: workspace.name,
    city: workspace.city,
    phone: workspace.phone ?? "",
    email: workspace.email ?? "",
    address: workspace.address ?? "",
    gstin: workspace.gstin ?? "",
    quoteTerms: workspace.quoteTerms ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(updateWorkspaceInput, values);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      await update.mutateAsync(values);
      toast("Business profile saved");
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      {!editable && (
        <div className="mb-4">
          <Notice>Only the owner or a manager can change these details.</Notice>
        </div>
      )}
      <fieldset disabled={!editable} className="space-y-6">
        <Card className="space-y-5 p-5">
          <TextField label="Business name" value={values.name} onChange={set("name")} error={errors.name} />
          <TextField label="City" value={values.city} onChange={set("city")} error={errors.city} />
          <TextAreaField
            label="Address"
            value={values.address}
            onChange={set("address")}
            error={errors.address}
            placeholder="Shop 12, MI Road, Jaipur 302001"
          />
        </Card>

        <Card className="space-y-5 p-5">
          <TextField
            label="Business phone"
            value={values.phone}
            onChange={set("phone")}
            error={errors.phone}
            inputMode="tel"
            autoComplete="tel"
          />
          <TextField
            label="Email"
            value={values.email}
            onChange={set("email")}
            error={errors.email}
            type="email"
            autoComplete="email"
            placeholder="Optional"
          />
          <TextField
            label="GST number"
            value={values.gstin}
            onChange={set("gstin")}
            error={errors.gstin}
            placeholder="Optional"
            hint="Needed only if you send GST bills."
            autoCapitalize="characters"
            className="[&_input]:uppercase"
          />
        </Card>

        <Card className="space-y-5 p-5">
          <TextAreaField
            label="Terms on quotes"
            rows={4}
            value={values.quoteTerms}
            onChange={set("quoteTerms")}
            error={errors.quoteTerms}
            hint="Printed at the bottom of every new quote. You can still change them on each quote."
          />
        </Card>

        {errors._ && <Notice tone="danger">{errors._}</Notice>}
        {editable && (
          <Button type="submit" size="lg" loading={update.isPending} className="sm:w-auto sm:px-8">
            Save
          </Button>
        )}
      </fieldset>
    </form>
  );
}
