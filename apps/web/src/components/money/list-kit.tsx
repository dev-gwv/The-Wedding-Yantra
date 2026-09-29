"use client";

import { formatDate } from "@wedding-yantra/core";
import { CalendarDays, Check, ChevronDown, Download, RefreshCw, Search, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/components/sales/client-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { PERIODS, rangeDates, rangeName, type DateRange, type Period } from "@/lib/periods";

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

/** A panel that opens under its button: for the date range and the filters. */
function Popover({ button, children, open, onOpenChange, align = "left" }: { button: ReactNode; children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void; align?: "left" | "right" }) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => onOpenChange(false));
  return (
    <div ref={box} className="relative">
      {button}
      {open && (
        <div
          role="dialog"
          className={cn(
            "absolute top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-2 shadow-soft",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One button for the dates every number and row on the screen follows. */
export function DateRangeButton({ value, onChange, align }: { value: DateRange; onChange: (r: DateRange) => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const picked = rangeDates(value);
  const [from, setFrom] = useState(picked.from ?? "");
  const [to, setTo] = useState(picked.to ?? "");
  const choose = (r: DateRange) => {
    onChange(r);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align={align}
      button={
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Dates: ${rangeName(value)}`}
          onClick={() => {
            const d = rangeDates(value);
            setFrom(d.from ?? "");
            setTo(d.to ?? "");
            setOpen((o) => !o);
          }}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-sm font-bold text-ink shadow-soft hover:bg-cream"
        >
          <CalendarDays className="size-4 text-brand-strong" />
          <span className="whitespace-nowrap">{rangeName(value)}</span>
          <ChevronDown className={cn("size-4 text-ink-subtle transition", open && "rotate-180")} />
        </button>
      }
    >
      <ul>
        {PERIODS.map(([key, label]) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => choose({ period: key })}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold hover:bg-cream"
            >
              {label}
              {value.period === key && <Check className="size-4 text-brand-strong" />}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 border-t border-line px-1 pb-1 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (from && to) choose(from <= to ? { period: "custom", from, to } : { period: "custom", from: to, to: from });
        }}
      >
        <p className="px-2 text-sm font-bold">Choose dates</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-ink-muted">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
          </label>
          <label className="text-xs font-semibold text-ink-muted">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink" />
          </label>
        </div>
        <Button type="submit" size="sm" className="mt-3 w-full" disabled={!from || !to}>
          Show these dates
        </Button>
      </form>
    </Popover>
  );
}

/** A big number with what it means written under it, so no two cards can be read two ways. */
export function SummaryCard({ label, value, note, icon: Icon, tone }: { label: string; value: string; note?: ReactNode; icon: LucideIcon; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            tone === "danger" ? "bg-danger-soft text-danger" : tone === "success" ? "bg-success-soft text-success" : "bg-cream text-brand-strong",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-muted">{label}</p>
          <p className={cn("font-display text-2xl font-extrabold leading-tight tabular sm:text-[28px]", tone === "danger" && "text-danger", tone === "success" && "text-success")}>{value}</p>
        </div>
      </div>
      {note && <p className="mt-2 text-xs text-ink-muted sm:text-sm">{note}</p>}
    </div>
  );
}

export interface FilterGroup {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}

/** One Filter button instead of rows of chips. The first choice of each group means "any". */
function FilterMenu({ groups }: { groups: FilterGroup[] }) {
  const [open, setOpen] = useState(false);
  const on = groups.filter((g) => g.value !== g.options[0]?.[0]).length;
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="right"
      button={
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Filter" title="Filter">
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">Filter</span>
          {on > 0 && <span className="grid size-5 place-items-center rounded-full bg-ink text-[11px] font-bold text-surface">{on}</span>}
        </Button>
      }
    >
      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-1">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wide text-ink-subtle">{g.label}</p>
            {g.options.map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={g.value === key}
                onClick={() => g.onChange(key)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[15px] font-semibold hover:bg-cream"
              >
                {text}
                {g.value === key && <Check className="size-4 text-brand-strong" />}
              </button>
            ))}
          </div>
        ))}
        {on > 0 && (
          <button
            type="button"
            onClick={() => {
              groups.forEach((g) => g.onChange(g.options[0]![0]));
              setOpen(false);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-brand-strong hover:bg-cream"
          >
            Clear filters
          </button>
        )}
      </div>
    </Popover>
  );
}

/** Search, filter, refresh and download, above a table. */
export function Toolbar({
  search,
  onSearch,
  placeholder,
  filters,
  onRefresh,
  refreshing,
  onExport,
  canExport,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  filters?: FilterGroup[];
  onRefresh?: () => void;
  refreshing?: boolean;
  onExport?: () => void;
  canExport?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <SearchBox value={search} onChange={onSearch} placeholder={placeholder} />
      {filters && filters.length > 0 && <FilterMenu groups={filters} />}
      {onRefresh && (
        <Button variant="secondary" onClick={onRefresh} aria-label="Refresh" title="Refresh" className="hidden px-3 sm:inline-flex">
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
        </Button>
      )}
      {onExport && (
        <Button variant="secondary" onClick={onExport} disabled={!canExport} aria-label="Export CSV" title="Download as a spreadsheet">
          <Download className="size-4" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
      )}
    </div>
  );
}

export interface Column<T> {
  head: string;
  cell: (row: T) => ReactNode;
  align?: "right";
  className?: string;
}

const PAGE = 50;

/**
 * A plain table on a computer; on a phone each row is two lines: who and how much, then
 * when, what for and its status. Tapping a row opens it. 50 rows at a time.
 */
export function MoneyTable<T>({
  rows,
  columns,
  rowKey,
  onOpen,
  mobile,
  label,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  mobile: (row: T) => { title: ReactNode; amount: ReactNode; sub: ReactNode; status?: ReactNode; extra?: ReactNode };
  label: string;
}) {
  // Back to the first 50 whenever the rows change (new dates, search or filter).
  const [more, setMore] = useState({ of: rows.length, shown: PAGE });
  const shown = more.of === rows.length ? more.shown : PAGE;
  const page = rows.slice(0, shown);
  return (
    <Card className="overflow-hidden">
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left text-sm" aria-label={label}>
        <thead className="border-b border-line bg-cream/60 text-xs font-bold uppercase tracking-wide text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.head} scope="col" className={cn("whitespace-nowrap px-3 py-3 font-bold first:pl-5 last:pr-5", c.align === "right" && "text-right", c.className)}>
                {c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {page.map((r) => (
            <tr key={rowKey(r)} onClick={onOpen ? () => onOpen(r) : undefined} className={cn("align-middle", onOpen && "cursor-pointer hover:bg-cream")}>
              {columns.map((c) => (
                <td key={c.head} className={cn("px-3 py-3 first:pl-5 last:pr-5", c.align === "right" && "whitespace-nowrap text-right tabular", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <ul className="divide-y divide-line md:hidden" aria-label={label}>
        {page.map((r) => {
          const m = mobile(r);
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-bold">{m.title}</span>
                <span className="shrink-0 font-bold tabular">{m.amount}</span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-ink-muted">{m.sub}</span>
                {m.status && <span className="shrink-0">{m.status}</span>}
              </span>
            </>
          );
          return (
            <li key={rowKey(r)} className="px-4 py-3">
              {onOpen ? (
                <button type="button" onClick={() => onOpen(r)} className="block w-full text-left">
                  {body}
                </button>
              ) : (
                <div>{body}</div>
              )}
              {m.extra}
            </li>
          );
        })}
      </ul>
      {rows.length > shown && (
        <button type="button" onClick={() => setMore({ of: rows.length, shown: shown + PAGE })} className="w-full border-t border-line px-5 py-3 text-sm font-bold text-brand-strong hover:bg-cream">
          Show more ({rows.length - shown} left)
        </button>
      )}
    </Card>
  );
}

/** A date in a table: the year only when it isn't this year. */
export function tableDate(iso: string): string {
  return formatDate(iso, { year: iso.slice(0, 4) !== String(new Date().getFullYear()) });
}
