"use client";

import { formatMoney, PLAN_INFO, PLANS, TRIAL_DAYS, type BillingPeriod } from "@wedding-yantra/core";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Card, Pill } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

/** The three plans, from the same place the app and the API read them. */
export function Pricing() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Pay">
          {(["monthly", "yearly"] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={period === p}
              onClick={() => setPeriod(p)}
              className={cn("h-10 rounded-xl px-5 text-sm font-bold transition", period === p ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink")}
            >
              {p === "monthly" ? "Monthly" : "Yearly · 2 months free"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const info = PLAN_INFO[plan];
          const recommended = plan === "studio";
          return (
            <Card key={plan} className={cn("flex flex-col p-6", recommended && "border-sun-300 ring-1 ring-sun-300/60 md:-translate-y-2")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl font-extrabold">{info.name}</h3>
                {recommended && <Pill tone="brand">Most chosen</Pill>}
              </div>
              <p className="text-sm text-ink-muted">{info.for}</p>
              <p className="mt-5">
                <span className="font-display text-4xl font-extrabold tabular">{formatMoney(period === "monthly" ? info.monthly : info.yearly)}</span>
                <span className="text-ink-muted"> / {period === "monthly" ? "month" : "year"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                {info.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} />
                    {h}
                  </li>
                ))}
              </ul>
              <Link href="/login" className={buttonClass({ variant: recommended ? "primary" : "secondary", className: "mt-6" })}>
                Start {TRIAL_DAYS} days free
              </Link>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-center text-sm text-ink-muted">Every plan starts with {TRIAL_DAYS} days free, with everything included. No card needed.</p>
    </div>
  );
}
