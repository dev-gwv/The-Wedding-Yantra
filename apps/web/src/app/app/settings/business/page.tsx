"use client";

import { can } from "@wedding-yantra/core";
import { useUpdateWorkspace, useUploadFile, useWorkspace } from "@wedding-yantra/api-client/react";
import { updateWorkspaceInput, type Workspace } from "@wedding-yantra/types";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { BusinessMark } from "@/components/app/business-mark";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { prepareLogo } from "@/lib/images";

export default function BusinessProfilePage() {
  return (
    <Suspense>
      <BusinessProfile />
    </Suspense>
  );
}

function BusinessProfile() {
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
  const router = useRouter();
  // Opened from the setup list on Home: go back there once the step is done.
  const fromSetup = useSearchParams().get("from") === "setup";
  const editable = can(workspace.role, "workspace.update");
  const [values, setValues] = useState({
    name: workspace.name,
    city: workspace.city,
    phone: workspace.phone ?? "",
    email: workspace.email ?? "",
    address: workspace.address ?? "",
    gstin: workspace.gstin ?? "",
    quoteTerms: workspace.quoteTerms ?? "",
    upiId: workspace.upiId ?? "",
    billPrefix: workspace.billPrefix,
    billTerms: workspace.billTerms ?? "",
    reviewUrl: workspace.reviewUrl ?? "",
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
      const done = values.phone.trim() !== "" && values.address.trim() !== "";
      toast(done && fromSetup ? "Saved. That step is done" : "Business profile saved");
      if (done && fromSetup) router.push("/app");
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
      {editable && (!workspace.phone || !workspace.address) && (
        <div className="mb-4">
          <Notice>Add your business phone and address, then save. They go on every quote and invoice.</Notice>
        </div>
      )}
      <fieldset disabled={!editable} className="space-y-6">
        <LogoCard workspace={workspace} editable={editable} />

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
            hint="Add it to charge GST on your bills. Without it, bills carry no GST."
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

        <Card className="space-y-5 p-5">
          <h2 className="font-display text-lg font-extrabold">Getting paid</h2>
          <TextField
            label="UPI ID"
            value={values.upiId}
            onChange={set("upiId")}
            error={errors.upiId}
            placeholder="riya@okhdfc"
            autoCapitalize="none"
            hint="Clients get a Pay by UPI button on every invoice link. Money goes straight to you."
          />
          <TextField
            label="Invoice numbers start with"
            value={values.billPrefix}
            onChange={set("billPrefix")}
            error={errors.billPrefix}
            autoCapitalize="characters"
            className="[&_input]:uppercase"
            hint={`New invoices look like ${(values.billPrefix || "INV").toUpperCase()}/26-27/0001, counted afresh each financial year.`}
          />
          <TextAreaField
            label="Bank details and terms on invoices"
            rows={4}
            value={values.billTerms}
            onChange={set("billTerms")}
            error={errors.billTerms}
            placeholder={"Bank: HDFC Bank, A/c 50100123456789, IFSC HDFC0001234\nBalance due before the event."}
            hint="Printed at the bottom of every new invoice."
          />
        </Card>

        <Card id="reviews" className="scroll-mt-6 space-y-5 p-5">
          <h2 className="font-display text-lg font-extrabold">Reviews</h2>
          <TextField
            label="Google review link"
            value={values.reviewUrl}
            onChange={set("reviewUrl")}
            error={errors.reviewUrl}
            placeholder="https://g.page/r/…/review"
            inputMode="url"
            autoCapitalize="none"
            hint="In your Google Business Profile, tap “Ask for reviews” and copy the link. After each event, you can ask the client for a review in one tap."
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

/** The logo goes on quotes, bills, the client's page and the enquiry form. Saved as soon as it's picked. */
function LogoCard({ workspace, editable }: { workspace: Workspace; editable: boolean }) {
  const upload = useUploadFile(workspace.id);
  const update = useUpdateWorkspace(workspace.id);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = upload.isPending || update.isPending;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const uploaded = await upload.mutateAsync(await prepareLogo(file));
      await update.mutateAsync({ logoFileId: uploaded.id });
      toast("Logo saved");
    } catch (err) {
      setError(err instanceof Error && !("status" in err) ? err.message : errorMessage(err));
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    try {
      await update.mutateAsync({ logoFileId: null });
      toast("Logo removed");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-5 p-5">
      <BusinessMark logoUrl={workspace.logoUrl} icon={workspace.businessTypeIcon} name={workspace.name} size="xl" tone="cream" />
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="font-display text-lg font-extrabold">Logo</h2>
          <p className="text-sm text-ink-muted">Shown on your quotes, invoices, your clients&apos; page and your enquiry form.</p>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()} loading={busy}>
              {!busy && <ImagePlus className="size-4" />} {workspace.logoUrl ? "Change logo" : "Add your logo"}
            </Button>
            {workspace.logoUrl && !busy && (
              <Button variant="ghost" size="sm" onClick={() => void remove()}>
                <Trash2 className="size-4" /> Remove
              </Button>
            )}
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Card>
  );
}

