"use client";

import { can, formatMoneyShort } from "@wedding-yantra/core";
import { useQuotes } from "@wedding-yantra/api-client/react";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@wedding-yantra/types";
import { FileText, Lock, ReceiptIndianRupee } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteRow } from "@/components/bookings/quote-row";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

const FILTERS: (QuoteStatus | "all")[] = ["all", "sent", "accepted", "draft", "declined"];

export default function MoneyPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "quotes.view");
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");
  const quotes = useQuotes(workspace.id, filter === "all" ? {} : { status: filter }, allowed);

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

  const list = quotes.data ?? [];
  const accepted = list.filter((q) => q.status === "accepted").reduce((sum, q) => sum + q.total, 0);
  const waiting = list.filter((q) => q.status === "sent" && !q.expired).reduce((sum, q) => sum + q.total, 0);

  return (
    <>
      <PageHeader title="Money" subtitle="Quotes today. Bills and payments come next." />

      {filter === "all" && list.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs font-semibold text-ink-muted">Accepted quotes</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular text-success">{formatMoneyShort(accepted)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold text-ink-muted">Waiting for an answer</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular">{formatMoneyShort(waiting)}</p>
          </Card>
        </div>
      )}

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Quote status">
        {FILTERS.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition",
              filter === f ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
            )}
          >
            {f === "all" ? "All quotes" : QUOTE_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {quotes.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {quotes.isError && <Notice tone="danger">{errorMessage(quotes.error)}</Notice>}
      {quotes.data && list.length === 0 && (
        <Card>
          <EmptyState icon={FileText} title={filter === "all" ? "No quotes yet" : `No ${QUOTE_STATUS_LABELS[filter as QuoteStatus].toLowerCase()} quotes`}>
            Open a lead and tap &ldquo;Make a quote&rdquo;. Pick services from your price list and send it on WhatsApp.
          </EmptyState>
        </Card>
      )}
      {list.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((q) => (
            <QuoteRow key={q.id} quote={q} lead="customer" />
          ))}
        </Card>
      )}

      <Card className="mt-6 flex items-center gap-4 p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
          <ReceiptIndianRupee className="size-5" />
        </span>
        <p className="text-sm text-ink-muted">
          <span className="font-bold text-ink">Coming next:</span> GST bills, payments received with UPI links, expenses and profit on every event.
        </p>
      </Card>
    </>
  );
}
