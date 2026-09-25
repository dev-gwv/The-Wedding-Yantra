import { formatDate, formatMoney } from "@wedding-yantra/core";
import type { QuoteSummary } from "@wedding-yantra/types";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { QuoteStatusPill } from "./quote-status";

/**
 * One quote in a list. On a lead or client page the person is already known, so the
 * title leads; on the Money list the customer's name does.
 */
export function QuoteRow({ quote, lead = "title" }: { quote: QuoteSummary; lead?: "title" | "customer" }) {
  const headline = lead === "customer" ? quote.customerName : quote.title;
  const detail = [quote.number, lead === "customer" ? quote.title : null, formatDate(quote.issueDate, { year: false })]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href={`/app/quotes/${quote.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-cream">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{headline}</span>
        <span className="block truncate text-sm text-ink-muted">{detail}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-bold tabular">{formatMoney(quote.total)}</span>
        <QuoteStatusPill status={quote.status} expired={quote.expired} />
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
    </Link>
  );
}
