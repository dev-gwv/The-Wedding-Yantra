import { formatDate, formatMoney, formatPhone } from "@wedding-yantra/core";
import { UNIT_LABELS, type QuoteItem, type QuoteStatus } from "@wedding-yantra/types";
import { BusinessIcon } from "@/components/app/business-icon";
import { cn } from "@/lib/cn";
import { QuoteStatusPill } from "./quote-status";

export interface QuoteDocumentProps {
  business: {
    name: string;
    typeName: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    gstin: string | null;
  };
  quote: {
    number: string;
    title: string;
    status: QuoteStatus;
    expired: boolean;
    customerName: string;
    issueDate: string;
    validUntil: string | null;
    items: QuoteItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    notes: string | null;
    terms: string | null;
    acceptedBy: string | null;
    acceptedAt: string | null;
  };
  className?: string;
}

/**
 * The quote as the client sees it. Used in the app and on the client's link, and laid
 * out to print cleanly on A4 (the browser's "Save as PDF" gives a proper document).
 */
export function QuoteDocument({ business, quote, className }: QuoteDocumentProps) {
  const hasTax = quote.tax > 0;
  const contact = [business.phone ? formatPhone(business.phone) : null, business.email].filter(Boolean).join(" · ");

  return (
    <article className={cn("rounded-3xl border border-line bg-surface shadow-soft print:rounded-none print:border-0 print:shadow-none", className)}>
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand shadow-soft print:shadow-none">
            <BusinessIcon name={business.icon} className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl font-extrabold leading-tight">{business.name}</p>
            <p className="text-sm text-ink-muted">
              {business.typeName} · {business.city}
            </p>
            {business.address && <p className="mt-1 max-w-xs whitespace-pre-line text-sm text-ink-muted">{business.address}</p>}
            {contact && <p className="mt-1 text-sm text-ink-muted tabular">{contact}</p>}
            {business.gstin && <p className="mt-1 text-sm text-ink-muted">GSTIN {business.gstin}</p>}
          </div>
        </div>
        {/* Sits under the business on a phone, so it lines up left there */}
        <div className="sm:text-right">
          <p className="text-xs font-extrabold uppercase tracking-wider text-brand-strong">Quote</p>
          <p className="font-display text-xl font-extrabold tabular">{quote.number}</p>
          <div className="mt-2 flex sm:justify-end print:hidden">
            <QuoteStatusPill status={quote.status} expired={quote.expired} />
          </div>
        </div>
      </header>

      {/* For, dates */}
      <div className="grid gap-4 border-b border-line p-6 sm:grid-cols-3 sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">For</p>
          <p className="mt-0.5 font-bold">{quote.customerName}</p>
          <p className="text-sm text-ink-muted">{quote.title}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Date</p>
          <p className="mt-0.5 font-bold">{formatDate(quote.issueDate)}</p>
        </div>
        {quote.validUntil && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Valid until</p>
            <p className={cn("mt-0.5 font-bold", quote.expired && "text-danger")}>{formatDate(quote.validUntil)}</p>
          </div>
        )}
      </div>

      {/* Lines */}
      <div className="p-6 sm:p-8">
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr className="border-b border-line text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <th className="pb-3 font-semibold">Service</th>
              <th className="hidden pb-3 text-right font-semibold sm:table-cell">Qty</th>
              <th className="hidden pb-3 text-right font-semibold sm:table-cell">Rate</th>
              <th className="pb-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {quote.items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="py-3 pr-3">
                  <p className="font-semibold">{item.name}</p>
                  {item.description && <p className="text-sm text-ink-muted">{item.description}</p>}
                  <p className="text-sm text-ink-muted tabular sm:hidden">
                    {item.quantity} × {formatMoney(item.rate)} {UNIT_LABELS[item.unit]}
                  </p>
                  {hasTax && item.taxRate > 0 && <p className="text-xs text-ink-muted">GST {item.taxRate}%</p>}
                </td>
                <td className="hidden py-3 text-right tabular sm:table-cell">{item.quantity}</td>
                <td className="hidden py-3 text-right tabular sm:table-cell">
                  {formatMoney(item.rate)}
                  <span className="block text-xs text-ink-muted">{UNIT_LABELS[item.unit]}</span>
                </td>
                <td className="py-3 text-right font-semibold tabular">{formatMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 max-w-xs space-y-1.5 border-t border-line pt-4 text-[15px]">
          <Row label="Subtotal" value={formatMoney(quote.subtotal, { paise: quote.subtotal % 1 !== 0 })} />
          {quote.discount > 0 && <Row label="Discount" value={`− ${formatMoney(quote.discount, { paise: quote.discount % 1 !== 0 })}`} />}
          {hasTax && <Row label="GST" value={formatMoney(quote.tax, { paise: true })} />}
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <dt className="font-bold">Total</dt>
            <dd className="font-display text-2xl font-extrabold tabular">{formatMoney(quote.total, { paise: quote.total % 1 !== 0 })}</dd>
          </div>
        </dl>
      </div>

      {(quote.notes || quote.terms) && (
        <div className="space-y-4 border-t border-line p-6 text-sm sm:p-8">
          {quote.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notes</p>
              <p className="mt-1 whitespace-pre-line">{quote.notes}</p>
            </div>
          )}
          {quote.terms && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Terms</p>
              <p className="mt-1 whitespace-pre-line text-ink-muted">{quote.terms}</p>
            </div>
          )}
        </div>
      )}

      {quote.status === "accepted" && quote.acceptedAt && (
        <p className="border-t border-line p-6 text-sm font-semibold text-success sm:px-8">
          Accepted by {quote.acceptedBy} on {formatDate(quote.acceptedAt)}
        </p>
      )}
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}
