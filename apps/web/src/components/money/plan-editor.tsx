"use client";

import { formatMoney, instalmentAmounts, PLAN_PRESETS, round2 } from "@wedding-yantra/core";
import type { Bill, InstalmentInput } from "@wedding-yantra/types";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EditablePart {
  label: string;
  value: string;
  dueDate: string;
}
export interface EditablePlan {
  on: boolean;
  mode: "percent" | "amount";
  parts: EditablePart[];
}

/** A saved invoice's plan, ready to edit: in percentages if it was set that way, else in rupees. */
export function toEditablePlan(bill: Pick<Bill, "plan"> | undefined): EditablePlan {
  const plan = bill?.plan ?? [];
  if (!plan.length) return { on: false, mode: "percent", parts: [] };
  const percent = plan.every((p) => p.percent !== null);
  return {
    on: true,
    mode: percent ? "percent" : "amount",
    parts: plan.map((p) => ({ label: p.label, value: String(percent ? p.percent : p.amount), dueDate: p.dueDate ?? "" })),
  };
}

/** What the API takes: an empty list when the invoice is one payment. */
export function planPayload(plan: EditablePlan): InstalmentInput[] {
  if (!plan.on) return [];
  return plan.parts.map((p) => ({
    label: p.label,
    ...(plan.mode === "percent" ? { percent: p.value } : { amount: p.value }),
    dueDate: p.dueDate,
  }));
}

const input =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none";

/**
 * "Paid in parts": pick a common split or make your own, in percentages or rupees, each
 * with a date if it has one. Shows the rupees and whether the parts add up as you type.
 */
export function PlanEditor({ plan, onChange, total, error }: { plan: EditablePlan; onChange: (p: EditablePlan) => void; total: number; error?: string }) {
  const amounts = instalmentAmounts(
    plan.parts.map((p) => ({ label: p.label, ...(plan.mode === "percent" ? { percent: Number(p.value) || 0 } : { amount: Number(p.value) || 0 }) })),
    total,
  );
  const planned = round2(amounts.reduce((a, b) => a + b, 0));
  const gap = round2(total - planned);
  const set = (i: number, patch: Partial<EditablePart>) => onChange({ ...plan, parts: plan.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  function preset(key: string) {
    const p = PLAN_PRESETS.find((x) => x.key === key)!;
    // Keep dates already typed, part by part.
    onChange({ on: true, mode: "percent", parts: p.parts.map((x, i) => ({ label: x.label, value: String(x.percent), dueDate: plan.parts[i]?.dueDate ?? "" })) });
  }

  function switchMode(mode: "percent" | "amount") {
    if (mode === plan.mode) return;
    // Convert what's there, so switching never loses the split.
    const parts = plan.parts.map((p, i) => ({
      ...p,
      value: mode === "amount" ? String(amounts[i] ?? "") : total > 0 ? String(round2(((amounts[i] ?? 0) / total) * 100)) : "",
    }));
    onChange({ ...plan, mode, parts });
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={plan.on}
          onChange={(e) => (e.target.checked && !plan.parts.length ? preset("half") : onChange({ ...plan, on: e.target.checked }))}
          className="mt-0.5 size-5 accent-brand"
        />
        <span>
          <span className="block font-bold">Paid in parts</span>
          <span className="block text-sm text-ink-muted">
            {plan.on ? "The plan prints on the invoice. Money received pays the parts in order." : "Advance, before the event, on the day: split the total into instalments."}
          </span>
        </span>
      </label>
      {plan.on && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {PLAN_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => preset(p.key)} className="h-9 rounded-full border border-line bg-surface px-3.5 text-sm font-bold hover:bg-cream">
                {p.name}
              </button>
            ))}
            <span className="ml-auto inline-flex rounded-xl bg-cream p-1" role="group" aria-label="Parts in">
              {(["percent", "amount"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={plan.mode === m}
                  onClick={() => switchMode(m)}
                  className={cn("h-8 rounded-lg px-3 text-sm font-bold", plan.mode === m ? "bg-surface shadow-soft" : "text-ink-muted")}
                >
                  {m === "percent" ? "%" : "₹"}
                </button>
              ))}
            </span>
          </div>
          <ol className="space-y-3">
            {plan.parts.map((p, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2 rounded-2xl border border-line p-3 sm:grid-cols-[minmax(0,1fr)_7rem_10rem_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-muted">Part {i + 1}</span>
                  <input className={input} value={p.label} maxLength={60} onChange={(e) => set(i, { label: e.target.value })} aria-label={`Part ${i + 1} name`} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-muted">{plan.mode === "percent" ? "%" : "₹"}</span>
                  <input
                    className={cn(input, "tabular")}
                    inputMode="decimal"
                    value={p.value}
                    onChange={(e) => set(i, { value: e.target.value.replace(/[^\d.]/g, "") })}
                    aria-label={`Part ${i + 1} ${plan.mode === "percent" ? "percent" : "amount"}`}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-muted">Due by (optional)</span>
                  <input type="date" className={input} value={p.dueDate} onChange={(e) => set(i, { dueDate: e.target.value })} aria-label={`Part ${i + 1} due date`} />
                </label>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="text-sm font-bold tabular">{formatMoney(amounts[i] ?? 0, { paise: (amounts[i] ?? 0) % 1 !== 0 })}</span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...plan, parts: plan.parts.filter((_, j) => j !== i) })}
                    disabled={plan.parts.length <= 2}
                    className="rounded-lg p-2 text-ink-muted hover:bg-cream disabled:opacity-30"
                    aria-label={`Remove part ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {plan.parts.length < 12 && (
              <button
                type="button"
                onClick={() => onChange({ ...plan, parts: [...plan.parts, { label: "", value: plan.mode === "amount" && gap > 0 ? String(gap) : "", dueDate: "" }] })}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong"
              >
                <Plus className="size-4" /> Add a part
              </button>
            )}
            <p className={cn("text-sm font-semibold tabular", Math.abs(gap) > 0.5 ? "text-danger" : "text-success")}>
              {Math.abs(gap) <= 0.5
                ? `Adds up to ${formatMoney(total)}`
                : gap > 0
                  ? `${formatMoney(gap)} short of ${formatMoney(total)}`
                  : `${formatMoney(-gap)} more than ${formatMoney(total)}`}
            </p>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </>
      )}
    </div>
  );
}
