"use client";

import { BILLING_PERIODS, can, daysLeft, formatDate, formatMoney, PLAN_INFO, PLANS, TRIAL_DAYS, type BillingPeriod, type Plan } from "@wedding-yantra/core";
import { useBilling, useCheckout } from "@wedding-yantra/api-client/react";
import type { BillingOverview } from "@wedding-yantra/types";
import { Check, Lock, Sparkles } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, GradientTile, NextStepCard, Notice, PageHeader, Pill, ProgressBar } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** The owner's plan: the trial, what's used, and choosing what to pay for. */
export default function BillingPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "billing.manage");
  const billing = useBilling(workspace.id, allowed);

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Plan and billing" />
      {!allowed ? (
        <Card>
          <EmptyState icon={Lock} title="The plan is the owner's to choose">
            Ask the owner of {workspace.name} if you need a bigger plan.
          </EmptyState>
        </Card>
      ) : (
        <>
          {billing.isPending && (
            <div className="flex justify-center py-16 text-brand">
              <Spinner />
            </div>
          )}
          {billing.isError && <Notice tone="danger">{errorMessage(billing.error)}</Notice>}
          {billing.data && <Billing b={billing.data} />}
        </>
      )}
    </>
  );
}

function Billing({ b }: { b: BillingOverview }) {
  const { workspace } = useCurrentWorkspace();
  const [period, setPeriod] = useState<BillingPeriod>(b.period ?? "monthly");
  return (
    <div className="space-y-6">
      <Standing b={b} />
      <Usage b={b} />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Plans</h2>
          <div className="inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Pay">
            {BILLING_PERIODS.map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className={cn("h-9 rounded-xl px-4 text-sm font-bold transition", period === p ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink")}
              >
                {p === "monthly" ? "Monthly" : "Yearly · 2 months free"}
              </button>
            ))}
          </div>
        </div>
        {!b.onlinePayment && (
          <div className="mb-3">
            <Notice>Paying online isn&apos;t switched on yet. Your trial keeps going in the meantime.</Notice>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard key={plan} plan={plan} period={period} b={b} />
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-subtle">
        Business ID <span className="tabular">{workspace.id}</span>: quote it if you pay by UPI or bank transfer.
      </p>
    </div>
  );
}

function Standing({ b }: { b: BillingOverview }) {
  if (b.status === "trial") {
    const left = daysLeft(b.trialEndsAt);
    return (
      <NextStepCard className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <GradientTile icon={Sparkles} />
          <div className="min-w-0 flex-1">
            <Pill tone="brand">Free trial</Pill>
            <h2 className="mt-2 font-display text-2xl font-extrabold">
              {left} day{left === 1 ? "" : "s"} left
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Everything is included while you try it, until {formatDate(b.trialEndsAt)}. Choose a plan any time.
            </p>
            <div className="mt-3">
              <ProgressBar value={((TRIAL_DAYS - left) / TRIAL_DAYS) * 100} label="Trial used" />
            </div>
          </div>
        </div>
      </NextStepCard>
    );
  }
  if (b.status === "expired") {
    return (
      <Card className="border-danger/30 p-5 sm:p-6">
        <h2 className="font-display text-xl font-extrabold text-danger">Your free trial has ended</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {b.enforced
            ? "Everything you've added is safe and you can still see it. Choose a plan to keep adding enquiries, events and bills."
            : "Nothing is locked yet. Choose a plan to keep things running when it is."}
        </p>
      </Card>
    );
  }
  const info = b.plan ? PLAN_INFO[b.plan] : null;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="success">{b.status === "past_due" ? "Payment due" : "Active"}</Pill>
        {b.cancelled && <Pill>Won&apos;t renew</Pill>}
      </div>
      <h2 className="mt-2 font-display text-2xl font-extrabold">
        {info?.name ?? "Your"} plan{b.period ? `, ${b.period === "monthly" ? "monthly" : "yearly"}` : ""}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {b.status === "past_due"
          ? "The last payment didn't go through. Razorpay will try again; check the payment method in the link it sent you."
          : b.currentPeriodEnd
            ? `${b.cancelled ? "Ends" : "Renews"} on ${formatDate(b.currentPeriodEnd)}.`
            : "Paid up."}
      </p>
    </Card>
  );
}

function Usage({ b }: { b: BillingOverview }) {
  const rows = [
    { label: "People", used: b.usage.members, limit: b.usage.membersLimit as number | null },
    { label: "Events this year", used: b.usage.eventsThisYear, limit: b.usage.eventsLimit },
  ];
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-ink-muted">What you use</h3>
      <dl className="mt-3 space-y-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="font-semibold">{r.label}</dt>
              <dd className="tabular text-ink-muted">
                {r.used}
                {r.limit !== null ? ` of ${r.limit}` : " · no limit"}
              </dd>
            </div>
            {r.limit !== null && (
              <div className="mt-1">
                <ProgressBar value={Math.min(100, (r.used / r.limit) * 100)} label={`${r.label} used`} />
              </div>
            )}
          </div>
        ))}
      </dl>
    </Card>
  );
}

function PlanCard({ plan, period, b }: { plan: Plan; period: BillingPeriod; b: BillingOverview }) {
  const { workspace } = useCurrentWorkspace();
  const checkout = useCheckout(workspace.id);
  const toast = useToast();
  const info = PLAN_INFO[plan];
  const current = b.plan === plan && (b.status === "active" || b.status === "past_due");
  const recommended = plan === "studio";
  const price = period === "monthly" ? info.monthly : info.yearly;

  async function choose() {
    try {
      const { url } = await checkout.mutateAsync({ plan, period });
      window.location.assign(url);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Card className={cn("flex flex-col p-5", recommended && "border-sun-300 ring-1 ring-sun-300/60")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xl font-extrabold">{info.name}</h3>
        {current ? <Pill tone="success">Your plan</Pill> : recommended ? <Pill tone="brand">Most chosen</Pill> : null}
      </div>
      <p className="text-sm text-ink-muted">{info.for}</p>
      <p className="mt-4">
        <span className="font-display text-3xl font-extrabold tabular">{formatMoney(price)}</span>
        <span className="text-sm text-ink-muted"> / {period === "monthly" ? "month" : "year"}</span>
      </p>
      <ul className="mt-4 flex-1 space-y-2 text-sm">
        {info.highlights.map((h) => (
          <li key={h} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} />
            {h}
          </li>
        ))}
      </ul>
      <Button
        className="mt-5"
        variant={recommended ? "primary" : "secondary"}
        onClick={choose}
        loading={checkout.isPending}
        disabled={current || !b.onlinePayment}
      >
        {current ? "Your plan" : `Choose ${info.name}`}
      </Button>
    </Card>
  );
}
