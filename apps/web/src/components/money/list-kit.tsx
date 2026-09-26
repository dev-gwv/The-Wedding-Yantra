"use client";

import { Search, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PERIODS, type Period } from "@/lib/periods";

/** A number that matters; tap it to show just those rows. */
export function MoneyTile({
  label,
  value,
  note,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  icon: LucideIcon;
  tone?: "success" | "danger" | "brand";
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn("font-display text-xl font-extrabold leading-tight tabular sm:text-2xl", tone === "danger" && "text-danger", tone === "success" && "text-success")}>
            {value}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-ink-muted sm:text-sm">{label}</p>
        </div>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg sm:size-9",
            tone === "danger" ? "bg-danger-soft text-danger" : tone === "success" ? "bg-success-soft text-success" : "bg-cream text-brand-strong",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      {note && <p className="mt-1.5 text-xs text-ink-muted">{note}</p>}
    </>
  );
  const box = cn(
    "rounded-3xl border bg-surface p-4 text-left shadow-soft transition sm:p-5",
    active ? "border-brand ring-2 ring-sun-300/60" : "border-line",
    onClick && "hover:border-sun-300",
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={box}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function PeriodPills({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return <Chips options={PERIODS as unknown as [Period, string][]} value={value} onChange={onChange} label="Period" quiet />;
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
  quiet,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** Smaller, cream selected state: for a secondary row of choices */
  quiet?: boolean;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "shrink-0 rounded-full font-bold transition",
            quiet ? "h-8 px-3.5 text-[13px]" : "h-10 px-4 text-sm",
            value === key
              ? quiet
                ? "bg-ink text-surface"
                : "bg-gradient-primary text-on-brand shadow-soft"
              : quiet
                ? "text-ink-muted hover:bg-cream hover:text-ink"
                : "bg-cream text-ink hover:bg-sun-100",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Search as you type, a moment after typing stops. */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== value) onChange(text.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-9 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText("");
            onChange("");
          }}
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-ink-muted hover:bg-cream"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      )}
    </label>
  );
}
