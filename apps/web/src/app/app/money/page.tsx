"use client";

import { can, formatMoneyShort } from "@wedding-yantra/core";
import { useMoneyOverview, useQuotes } from "@wedding-yantra/api-client/react";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@wedding-yantra/types";
import { BarChart3, ChevronRight, FileText, Lock, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteRow } from "@/components/bookings/quote-row";
import { ExpensesView } from "@/components/money/expenses-view";
import { InvoicesView } from "@/components/money/invoices-view";
import { PaymentsView, RecordPaymentSheet } from "@/components/money/payments-view";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

type View = "invoices" | "payments" | "expenses" | "quotes";
const VIEWS: [View, string][] = [
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["expenses", "Expenses"],
  ["quotes", "Quotes"],
];

function MoneyScreen() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = can(workspace.role, "finance.view");
  const overview = useMoneyOverview(workspace.id, allowed);
  const asked = params.get("view");
  // Old links: "bills" and "due" are the invoices now.
  const view = (VIEWS.some(([v]) => v === asked) ? asked : "invoices") as View;
  const [recording, setRecording] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Money" />
        <Card>
          <EmptyState icon={Lock} title="Money isn't part of your role">
            The owner, managers and the accountant see invoices, payments and expenses.
          </EmptyState>
        </Card>
      </>
    );
  }

  const setView = (v: View) => router.replace(v === "invoices" ? pathname : `${pathname}?view=${v}`, { scroll: false });
  const o = overview.data;
  const primary = {
    invoices: can(workspace.role, "bills.manage") ? (
      <ButtonLink href="/app/bills/new">
        <Plus className="size-4" strokeWidth={2.5} /> New invoice
      </ButtonLink>
    ) : null,
    payments: can(workspace.role, "payments.record") ? (
      <Button onClick={() => setRecording(true)}>
        <Plus className="size-4" strokeWidth={2.5} /> Record payment
      </Button>
    ) : null,
    expenses: can(workspace.role, "expenses.submit") ? (
      <Button onClick={() => setAddingExpense(true)}>
        <Plus className="size-4" strokeWidth={2.5} /> Add expense
      </Button>
    ) : null,
    quotes: can(workspace.role, "quotes.manage") ? (
      <ButtonLink href="/app/quotes/new">
        <Plus className="size-4" strokeWidth={2.5} /> New quote
      </ButtonLink>
    ) : null,
  }[view];

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={
          o ? (
            <span>
              {formatMoneyShort(o.toCollect)} to collect{o.overdue > 0 && <span className="font-semibold text-danger"> · {formatMoneyShort(o.overdue)} overdue</span>} ·{" "}
              {formatMoneyShort(o.receivedThisMonth)} received this month
            </span>
          ) : undefined
        }
        action={
          <div className="flex gap-2">
            <ButtonLink href="/app/reports" variant="secondary" aria-label="Monthly report" title="Monthly report">
              <BarChart3 className="size-4" /> <span className="hidden sm:inline">Report</span>
            </ButtonLink>
            {primary}
          </div>
        }
      />

      <div className="mb-6 flex w-full rounded-2xl border border-line bg-cream p-1 sm:inline-flex sm:w-auto" role="tablist" aria-label="Money view">
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

      {view === "invoices" && <InvoicesView dues={o?.dues} />}
      {view === "payments" && <PaymentsView />}
      {view === "expenses" && <ExpensesView adding={addingExpense} onAddingChange={setAddingExpense} />}
      {view === "quotes" && <QuotesView />}

      <RecordPaymentSheet open={recording} onClose={() => setRecording(false)} dues={o?.dues ?? []} />
      {o && o.toPay > 0 && (
        <Link href="/app/vendors" className="mt-8 flex items-center justify-between gap-3 rounded-3xl border border-line bg-surface px-4 py-3 shadow-soft hover:bg-cream">
          <span className="text-sm font-semibold text-ink-muted">To pay vendors and helpers</span>
          <span className="flex items-center gap-1 font-display text-lg font-extrabold tabular">
            {formatMoneyShort(o.toPay)} <ChevronRight className="size-4 text-ink-subtle" />
          </span>
        </Link>
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
