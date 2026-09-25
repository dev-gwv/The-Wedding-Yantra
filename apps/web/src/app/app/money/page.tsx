"use client";

import { can, formatMoneyShort } from "@wedding-yantra/core";
import { useBills, useMoneyOverview, useQuotes } from "@wedding-yantra/api-client/react";
import { QUOTE_STATUS_LABELS, type DueItem, type QuoteStatus } from "@wedding-yantra/types";
import { BarChart3, FileText, Lock, PartyPopper, ReceiptIndianRupee } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteRow } from "@/components/bookings/quote-row";
import { ExpensesView } from "@/components/money/expenses-view";
import { PaymentSheet } from "@/components/money/payment-sheet";
import { BillRow, DueRow } from "@/components/money/rows";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";

type View = "due" | "bills" | "quotes" | "expenses";
const VIEWS: [View, string][] = [
  ["due", "To collect"],
  ["bills", "Bills"],
  ["quotes", "Quotes"],
  ["expenses", "Expenses"],
];

function MoneyScreen() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = can(workspace.role, "finance.view");
  const overview = useMoneyOverview(workspace.id, allowed);
  const view = (VIEWS.some(([v]) => v === params.get("view")) ? params.get("view") : "due") as View;

  if (!allowed) {
    return (
      <>
        <PageHeader title="Money" />
        <Card>
          <EmptyState icon={Lock} title="Money isn't part of your role">
            The owner, managers and the accountant see quotes, bills and payments.
          </EmptyState>
        </Card>
      </>
    );
  }

  const setView = (v: View) => router.replace(v === "due" ? pathname : `${pathname}?view=${v}`, { scroll: false });
  const o = overview.data;

  return (
    <>
      <PageHeader
        title="Money"
        action={
          <ButtonLink href="/app/reports" variant="secondary">
            <BarChart3 className="size-4" /> Monthly report
          </ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs font-semibold text-ink-muted">To collect</p>
          <p className="mt-1 font-display text-2xl font-extrabold tabular">{o ? formatMoneyShort(o.toCollect) : "…"}</p>
          {o && o.overdue > 0 && <p className="mt-0.5 text-xs font-semibold text-danger">{formatMoneyShort(o.overdue)} overdue</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-ink-muted">Received this month</p>
          <p className="mt-1 font-display text-2xl font-extrabold tabular text-success">{o ? formatMoneyShort(o.receivedThisMonth) : "…"}</p>
          {o && o.billedThisMonth > 0 && <p className="mt-0.5 text-xs text-ink-muted">{formatMoneyShort(o.billedThisMonth)} billed</p>}
        </Card>
      </div>

      <div className="mb-5 flex w-full rounded-2xl border border-line bg-cream p-1 sm:inline-flex sm:w-auto" role="tablist" aria-label="Money view">
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              "h-10 flex-1 whitespace-nowrap rounded-xl px-2 text-sm font-bold transition sm:flex-none sm:px-5",
              view === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "due" && <DuesView dues={o?.dues} pending={overview.isPending} error={overview.error} />}
      {view === "bills" && <BillsView />}
      {view === "quotes" && <QuotesView />}
      {view === "expenses" && <ExpensesView />}
    </>
  );
}

function DuesView({ dues, pending, error }: { dues: DueItem[] | undefined; pending: boolean; error: Error | null }) {
  const [receiving, setReceiving] = useState<DueItem | null>(null);
  if (pending) return <Loading />;
  if (error) return <Notice tone="danger">{errorMessage(error)}</Notice>;
  if (!dues || dues.length === 0) {
    return (
      <Card>
        <EmptyState icon={PartyPopper} title="Nothing to collect">
          Bills with a balance, and bookings not billed yet, show here with their due dates.
        </EmptyState>
      </Card>
    );
  }
  return (
    <>
      <Card className="divide-y divide-line overflow-hidden">
        {dues.map((d) => (
          <DueRow key={`${d.kind}-${d.billId ?? d.eventId}`} item={d} onReceived={setReceiving} />
        ))}
      </Card>
      <PaymentSheet
        open={!!receiving}
        onClose={() => setReceiving(null)}
        target={receiving?.billId ? { billId: receiving.billId } : { eventId: receiving?.eventId ?? undefined }}
        due={receiving?.due ?? 0}
        who={{
          clientName: receiving?.clientName ?? "",
          clientPhone: receiving?.clientPhone ?? null,
          billLink: receiving?.shareToken ? billUrl(receiving.shareToken) : null,
        }}
      />
    </>
  );
}

const BILL_FILTERS: ["all" | "open" | "paid" | "cancelled", string][] = [
  ["all", "All bills"],
  ["open", "Unpaid"],
  ["paid", "Paid"],
  ["cancelled", "Cancelled"],
];

function BillsView() {
  const { workspace } = useCurrentWorkspace();
  const [filter, setFilter] = useState<"all" | "open" | "paid" | "cancelled">("all");
  const bills = useBills(workspace.id, filter === "all" ? {} : { status: filter });
  return (
    <>
      <Chips options={BILL_FILTERS} value={filter} onChange={setFilter} label="Bill status" />
      {bills.isPending && <Loading />}
      {bills.isError && <Notice tone="danger">{errorMessage(bills.error)}</Notice>}
      {bills.data && bills.data.length === 0 && (
        <Card>
          <EmptyState icon={ReceiptIndianRupee} title={filter === "all" ? "No bills yet" : "No bills here"}>
            Open a booked event and tap &ldquo;Make bill&rdquo;. It starts from the accepted quote.
          </EmptyState>
        </Card>
      )}
      {bills.data && bills.data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {bills.data.map((b) => (
            <BillRow key={b.id} bill={b} />
          ))}
        </Card>
      )}
    </>
  );
}

const QUOTE_FILTERS: [QuoteStatus | "all", string][] = [
  ["all", "All quotes"],
  ["sent", QUOTE_STATUS_LABELS.sent],
  ["accepted", QUOTE_STATUS_LABELS.accepted],
  ["draft", QUOTE_STATUS_LABELS.draft],
  ["declined", QUOTE_STATUS_LABELS.declined],
];

function QuotesView() {
  const { workspace } = useCurrentWorkspace();
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");
  const quotes = useQuotes(workspace.id, filter === "all" ? {} : { status: filter });
  return (
    <>
      <Chips options={QUOTE_FILTERS} value={filter} onChange={setFilter} label="Quote status" />
      {quotes.isPending && <Loading />}
      {quotes.isError && <Notice tone="danger">{errorMessage(quotes.error)}</Notice>}
      {quotes.data && quotes.data.length === 0 && (
        <Card>
          <EmptyState icon={FileText} title={filter === "all" ? "No quotes yet" : `No ${QUOTE_STATUS_LABELS[filter as QuoteStatus].toLowerCase()} quotes`}>
            Open a lead and tap &ldquo;Make a quote&rdquo;. Pick services from your price list and send it on WhatsApp.
          </EmptyState>
        </Card>
      )}
      {quotes.data && quotes.data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {quotes.data.map((q) => (
            <QuoteRow key={q.id} quote={q} lead="customer" />
          ))}
        </Card>
      )}
    </>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition",
            value === key ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-16 text-brand">
      <Spinner />
    </div>
  );
}

export default function MoneyPage() {
  return (
    <Suspense fallback={<Splash />}>
      <MoneyScreen />
    </Suspense>
  );
}
