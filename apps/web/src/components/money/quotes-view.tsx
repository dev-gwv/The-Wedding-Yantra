"use client";

import { useQuotes } from "@wedding-yantra/api-client/react";
import { QUOTE_STATUS_LABELS, type QuoteStatus } from "@wedding-yantra/types";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteRow } from "@/components/bookings/quote-row";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { Chips } from "./list-kit";

const QUOTE_FILTERS: [QuoteStatus | "all", string][] = [
  ["all", "All quotes"],
  ["sent", QUOTE_STATUS_LABELS.sent],
  ["accepted", QUOTE_STATUS_LABELS.accepted],
  ["draft", QUOTE_STATUS_LABELS.draft],
  ["declined", QUOTE_STATUS_LABELS.declined],
];

/** Every quote, newest first, by where it stands. */
export function QuotesView() {
  const { workspace } = useCurrentWorkspace();
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");
  const quotes = useQuotes(workspace.id, filter === "all" ? {} : { status: filter });
  return (
    <div className="space-y-4">
      <Chips options={QUOTE_FILTERS} value={filter} onChange={setFilter} label="Quote status" />
      {quotes.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
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
    </div>
  );
}
