"use client";

import { useBusinessTypes, useCreateWorkspace, useMe } from "@wedding-yantra/api-client/react";
import { createWorkspaceInput } from "@wedding-yantra/types";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthScreen } from "@/components/app/auth-screen";
import { RequireAuth } from "@/components/app/require-auth";
import { TradePicker } from "@/components/app/trade-picker";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Eyebrow, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { setWorkspaceId } from "@/lib/session";

function Onboarding() {
  const router = useRouter();
  const me = useMe();
  const types = useBusinessTypes();
  const create = useCreateWorkspace();

  const [step, setStep] = useState<1 | 2>(1);
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasBusiness = (me.data?.workspaces.length ?? 0) > 0;
  const chosen = typeIds.map((id) => types.data?.find((t) => t.id === id)?.name).filter(Boolean).join(" · ");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const values = { name, city, businessTypeIds: typeIds };
    const check = validate(createWorkspaceInput, values);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const workspace = await create.mutateAsync(values);
      setWorkspaceId(workspace.id);
      router.replace("/app");
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <AuthScreen wide>
      <div className="flex items-center justify-between gap-4">
        <Eyebrow>Step {step} of 2</Eyebrow>
        {hasBusiness && (
          <Link href="/app" className="text-sm font-semibold text-ink-muted hover:text-ink">
            Cancel
          </Link>
        )}
      </div>

      {step === 1 && (
        <section className="mt-4">
          <h1 className="font-display text-3xl font-extrabold">What does your business do?</h1>
          <p className="mt-1 text-[15px] text-ink-muted">
            Tick all that apply, for example a wedding planner who also does photography. We&apos;ll set up services and checklists for each. You can
            change it later.
          </p>

          {types.isPending && (
            <div className="mt-10 flex justify-center text-brand">
              <Spinner />
            </div>
          )}
          {types.isError && (
            <div className="mt-8">
              <Notice tone="danger">{errorMessage(types.error)}</Notice>
            </div>
          )}

          {types.data && (
            <div className="mt-6">
              <TradePicker types={types.data} value={typeIds} onChange={setTypeIds} />
            </div>
          )}

          <Button size="lg" disabled={!typeIds.length} onClick={() => setStep(2)} className="mt-6">
            Continue
          </Button>
        </section>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="mt-4 space-y-6" noValidate>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Name your business</h1>
            {chosen && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="size-4" />
                {chosen}
              </button>
            )}
          </div>
          <TextField
            label="Business name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            placeholder="Riya Makeup Studio"
            hint="As your clients know it. It appears on quotes and bills."
            autoFocus
          />
          <TextField
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            error={errors.city}
            placeholder="Jaipur"
            autoComplete="address-level2"
          />
          {(errors._ || errors.businessTypeIds) && <Notice tone="danger">{errors._ ?? errors.businessTypeIds}</Notice>}
          <Button type="submit" size="lg" loading={create.isPending}>
            Create my business
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}
