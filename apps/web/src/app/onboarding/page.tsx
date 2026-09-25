"use client";

import { useBusinessTypes, useCreateWorkspace, useMe } from "@wedding-yantra/api-client/react";
import { createWorkspaceInput } from "@wedding-yantra/types";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BusinessIcon } from "@/components/app/business-icon";
import { Logo } from "@/components/app/logo";
import { RequireAuth } from "@/components/app/require-auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { setWorkspaceId } from "@/lib/session";

function Onboarding() {
  const router = useRouter();
  const me = useMe();
  const types = useBusinessTypes();
  const create = useCreateWorkspace();

  const [step, setStep] = useState<1 | 2>(1);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasBusiness = (me.data?.workspaces.length ?? 0) > 0;
  const chosen = types.data?.find((t) => t.id === typeId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const values = { name, city, businessTypeId: typeId ?? "" };
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
    <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10 sm:pt-14">
      <div className="flex items-center justify-between">
        <Logo />
        {hasBusiness && (
          <Link href="/app" className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </Link>
        )}
      </div>

      <p className="mt-12 text-sm font-medium text-brand">Step {step} of 2</p>

      {step === 1 && (
        <section className="mt-2">
          <h1 className="font-display text-3xl font-medium tracking-tight">What does your business do?</h1>
          <p className="mt-3 text-ink-muted">
            We&apos;ll set up services, sales stages and checklists that fit. You can change everything later.
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

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.data?.map((t) => {
              const selected = t.id === typeId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    aria-pressed={selected}
                    className={cn(
                      "relative flex h-full w-full flex-col items-start gap-3 rounded-lg border bg-surface p-4 text-left transition-colors",
                      selected ? "border-brand ring-4 ring-brand/10" : "border-line hover:border-line-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-md",
                        selected ? "bg-brand text-on-brand" : "bg-brand-soft text-brand",
                      )}
                    >
                      <BusinessIcon name={t.icon} className="size-5" />
                    </span>
                    <span className="text-sm font-medium leading-snug">{t.name}</span>
                    {selected && <Check className="absolute right-3 top-3 size-4 text-brand" strokeWidth={2.5} />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-0 -mx-5 mt-8 bg-ivory/95 px-5 pb-safe pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:p-0">
            <Button size="lg" disabled={!typeId} onClick={() => setStep(2)} className="sm:w-auto sm:px-8">
              Continue
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <form onSubmit={submit} className="mt-2 max-w-sm space-y-6" noValidate>
          <div>
            <h1 className="font-display text-3xl font-medium tracking-tight">Name your business</h1>
            {chosen && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
              >
                <ArrowLeft className="size-4" />
                {chosen.name}
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
          {(errors._ || errors.businessTypeId) && <Notice tone="danger">{errors._ ?? errors.businessTypeId}</Notice>}
          <Button type="submit" size="lg" loading={create.isPending}>
            Create my business
          </Button>
        </form>
      )}
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}
