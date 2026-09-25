"use client";

import { useBusinessTypes, useCreateWorkspace, useMe } from "@wedding-yantra/api-client/react";
import { createWorkspaceInput } from "@wedding-yantra/types";
import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BusinessIcon } from "@/components/app/business-icon";
import { AuthScreen } from "@/components/app/auth-screen";
import { RequireAuth } from "@/components/app/require-auth";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Eyebrow, Notice } from "@/components/ui/misc";
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

          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {types.data?.map((t) => {
              const selected = t.id === typeId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    aria-pressed={selected}
                    className={cn(
                      "relative flex h-full w-full flex-col items-start gap-3 rounded-2xl border p-4 text-left transition",
                      selected
                        ? "border-brand bg-cream text-brand-deep"
                        : "border-line bg-surface text-ink hover:border-sun-300 hover:bg-cream",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-xl text-brand-strong",
                        selected ? "bg-surface shadow-soft" : "bg-cream",
                      )}
                    >
                      <BusinessIcon name={t.icon} className="size-5" />
                    </span>
                    <span className="text-sm font-bold leading-snug">{t.name}</span>
                    {selected && (
                      <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-gradient-primary text-on-brand">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <Button size="lg" disabled={!typeId} onClick={() => setStep(2)} className="mt-6">
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
