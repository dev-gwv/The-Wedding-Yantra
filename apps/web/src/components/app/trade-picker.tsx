"use client";

import type { BusinessType } from "@wedding-yantra/types";
import { Check } from "lucide-react";
import { BusinessIcon } from "@/components/app/business-icon";
import { cn } from "@/lib/cn";

/**
 * The kinds of work a business does: tick all that apply. The first one ticked is the main
 * one (its icon stands for the business); tapping a ticked one takes it off.
 */
export function TradePicker({ types, value, onChange }: { types: BusinessType[]; value: string[]; onChange: (ids: string[]) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {types.map((t) => {
        const at = value.indexOf(t.id);
        const selected = at >= 0;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onChange(selected ? value.filter((id) => id !== t.id) : [...value, t.id])}
              aria-pressed={selected}
              className={cn(
                "relative flex h-full w-full flex-col items-start gap-3 rounded-2xl border p-4 text-left transition",
                selected ? "border-brand bg-cream text-brand-deep" : "border-line bg-surface text-ink hover:border-sun-300 hover:bg-cream",
              )}
            >
              <span className={cn("grid size-10 place-items-center rounded-xl text-brand-strong", selected ? "bg-surface shadow-soft" : "bg-cream")}>
                <BusinessIcon name={t.icon} className="size-5" />
              </span>
              <span className="text-sm font-bold leading-snug">{t.name}</span>
              {at === 0 && value.length > 1 && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-brand-strong">Main</span>}
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
  );
}
