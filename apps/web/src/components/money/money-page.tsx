"use client";

import { can, formatMoneyShort } from "@wedding-yantra/core";
import { useMoneyOverview } from "@wedding-yantra/api-client/react";
import { ArrowLeftRight, BarChart3, Check, ChevronDown, ChevronRight, FileText, Lock, ReceiptIndianRupee, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { useDismiss } from "@/components/sales/client-picker";
import { Card, EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { rangeFromParams, rangeSentence, rangeToParams, type DateRange } from "@/lib/periods";
import { DateRangeButton } from "./list-kit";

export type MoneySection = "transactions" | "to-collect" | "invoices" | "quotes" | "expenses" | "reports";

/** The parts of Payments and invoices, in the side menu and the phone's title switcher. */
export const MONEY_SECTIONS: { key: MoneySection; label: string; href: string; icon: LucideIcon; also?: string[] }[] = [
  { key: "transactions", label: "Transactions", href: "/app/money", icon: ArrowLeftRight },
  { key: "to-collect", label: "To collect", href: "/app/money/to-collect", icon: Wallet },
  { key: "invoices", label: "Invoices", href: "/app/money/invoices", icon: ReceiptIndianRupee, also: ["/app/bills"] },
  { key: "quotes", label: "Quotes", href: "/app/money/quotes", icon: FileText, also: ["/app/quotes"] },
  { key: "expenses", label: "Expenses", href: "/app/money/expenses", icon: ReceiptText },
  { key: "reports", label: "Reports", href: "/app/reports", icon: BarChart3 },
];

/** Which part of Payments and invoices a page belongs to, if any. */
export function moneySectionOf(pathname: string): MoneySection | null {
  // Longest address first, so /app/money/invoices isn't taken for /app/money.
  const hit = [...MONEY_SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`) || s.also?.some((p) => pathname.startsWith(p)));
  return hit?.key ?? null;
}

const SAVED = "wy.money.range";

function readSaved(): DateRange | null {
  try {
    const raw = window.sessionStorage.getItem(SAVED);
    return raw ? rangeFromParams(new URLSearchParams(raw)) : null;
  } catch {
    return null;
  }
}

/**
 * The dates the money pages show. The page address wins; otherwise the last dates picked in
 * this browser tab, so going from Transactions to Invoices in the menu keeps "Last month".
 */
export function useMoneyRange(): [DateRange, (r: DateRange) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const inAddress = params.has("range") || (params.has("from") && params.has("to"));
  const [saved] = useState<DateRange | null>(() => (typeof window === "undefined" ? null : readSaved()));
  const range = inAddress ? rangeFromParams(params) : (saved ?? { period: "month" });

  const key = rangeToParams(range, new URLSearchParams()).toString();
  useEffect(() => {
    try {
      window.sessionStorage.setItem(SAVED, key);
    } catch {
      // Private windows can block storage; the dates still work from the address.
    }
  }, [key]);

  const setRange = useCallback(
    (r: DateRange) => router.replace(`${pathname}?${rangeToParams(r, new URLSearchParams(params)).toString()}`, { scroll: false }),
    [router, pathname, params],
  );
  return [range, setRange];
}

/** On a phone there's no side menu: the page title opens the list of sections. */
function SectionSwitcher({ current }: { current: MoneySection }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, open, () => setOpen(false));
  const label = MONEY_SECTIONS.find((s) => s.key === current)?.label ?? "";
  return (
    <div ref={box} className="relative lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 font-display text-[clamp(28px,4vw,38px)] font-extrabold leading-tight"
      >
        {label}
        <ChevronDown className={cn("size-6 text-brand-strong transition", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl border border-line bg-surface p-1.5 shadow-soft">
          {MONEY_SECTIONS.map(({ key, label: text, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold", key === current ? "bg-cream text-brand-strong" : "hover:bg-cream")}
            >
              <Icon className="size-[18px] shrink-0" />
              <span className="flex-1">{text}</span>
              {key === current && <Check className="size-4" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The top of every Payments and invoices page: the section's name (a switcher on a phone),
 * what the numbers cover, the date button where dates apply, and the page's main action.
 */
export function MoneyPageHeader({
  section,
  subtitle,
  dates,
  action,
}: {
  section: MoneySection;
  subtitle?: ReactNode;
  dates?: { range: DateRange; onChange: (r: DateRange) => void };
  action?: ReactNode;
}) {
  const label = MONEY_SECTIONS.find((s) => s.key === section)?.label ?? "";
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-1 text-sm font-semibold text-ink-muted">Payments and invoices</p>
        <h1 className="hidden font-display text-[clamp(28px,4vw,38px)] font-extrabold leading-tight lg:block">{label}</h1>
        <SectionSwitcher current={section} />
        {(subtitle ?? dates) && <p className="mt-1 text-[15px] text-ink-muted">{subtitle ?? (dates ? rangeSentence(dates.range) : null)}</p>}
      </div>
      {(dates || action) && (
        <div className="flex flex-wrap items-center gap-2">
          {dates && <DateRangeButton value={dates.range} onChange={dates.onChange} align="right" />}
          {action}
        </div>
      )}
    </header>
  );
}

/** For roles that don't see money: the same message on every section. */
export function MoneyLocked({ section }: { section: MoneySection }) {
  return (
    <>
      <MoneyPageHeader section={section} />
      <Card>
        <EmptyState icon={Lock} title="Payments and invoices aren't part of your role">
          The owner, managers and the accountant see invoices, payments and expenses.
        </EmptyState>
      </Card>
    </>
  );
}

/** What's still owed to vendors and helpers, under the lists it relates to. */
export function ToPayVendorsLink() {
  const { workspace } = useCurrentWorkspace();
  const overview = useMoneyOverview(workspace.id, can(workspace.role, "finance.view"));
  const toPay = overview.data?.toPay ?? 0;
  if (toPay <= 0) return null;
  return (
    <Link href="/app/vendors" className="mt-8 flex items-center justify-between gap-3 rounded-3xl border border-line bg-surface px-4 py-3 shadow-soft hover:bg-cream">
      <span className="text-sm font-semibold text-ink-muted">To pay vendors and helpers</span>
      <span className="flex items-center gap-1 font-display text-lg font-extrabold tabular">
        {formatMoneyShort(toPay)} <ChevronRight className="size-4 text-ink-subtle" />
      </span>
    </Link>
  );
}
