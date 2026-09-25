import { formatDate, formatMoney, formatPhone, PAYMENT_METHOD_LABELS, rupeesInWords, stateName } from "@wedding-yantra/core";
import { UNIT_LABELS, type Bill, type Payment } from "@wedding-yantra/types";
import { BusinessIcon } from "@/components/app/business-icon";
import { cn } from "@/lib/cn";
import { BillStatusPill } from "./bill-status";

export interface BillDocumentProps {
  business: {
    name: string;
    typeName: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  bill: Omit<Bill, "shareToken" | "clientId" | "eventId" | "quoteId" | "payments"> & {
    payments: Pick<Payment, "number" | "amount" | "paidOn" | "method">[];
  };
  className?: string;
}

const money = (n: number) => formatMoney(n, { paise: n % 1 !== 0 });
const exact = (n: number) => formatMoney(n, { paise: true });

/**
 * The bill as the client sees it, laid out as a GST tax invoice: seller and buyer,
 * place of supply, SAC codes, CGST and SGST (or IGST), amount in words. Prints cleanly
 * on A4 with the browser's "Save as PDF".
 */
export function BillDocument({ business, bill, className }: BillDocumentProps) {
  const contact = [business.phone ? formatPhone(business.phone) : null, business.email].filter(Boolean).join(" · ");
  const gst = bill.chargesGst;
  const showSac = bill.items.some((i) => i.sac);
  const cancelled = bill.status === "cancelled";
  const payments = [...bill.payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.number.localeCompare(b.number));

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-3xl border border-line bg-surface shadow-soft print:rounded-none print:border-0 print:shadow-none",
        className,
      )}
    >
      {cancelled && (
        <p className="border-b border-line bg-cream px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-danger sm:px-8">
          Cancelled{bill.cancelReason ? `: ${bill.cancelReason}` : ""}
        </p>
      )}

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
            {bill.sellerGstin && <p className="mt-1 text-sm font-semibold tabular">GSTIN {bill.sellerGstin}</p>}
          </div>
        </div>
        {/* Sits under the business on a phone, so it lines up left there */}
        <div className="sm:text-right">
          <p className="text-xs font-extrabold uppercase tracking-wider text-brand-strong">{gst ? "Tax invoice" : "Bill"}</p>
          <p className="font-display text-xl font-extrabold tabular">{bill.number}</p>
          <div className="mt-2 flex sm:justify-end print:hidden">
            <BillStatusPill bill={bill} />
          </div>
        </div>
      </header>

      <div className="grid gap-5 border-b border-line p-6 sm:grid-cols-3 sm:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Bill to</p>
          <p className="mt-0.5 font-bold">{bill.billTo.name}</p>
          {bill.billTo.address && <p className="whitespace-pre-line text-sm text-ink-muted">{bill.billTo.address}</p>}
          {bill.billTo.phone && <p className="text-sm text-ink-muted tabular">{formatPhone(bill.billTo.phone)}</p>}
          {bill.billTo.gstin && <p className="text-sm font-semibold tabular">GSTIN {bill.billTo.gstin}</p>}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Bill date</p>
            <p className="mt-0.5 font-bold">{formatDate(bill.issueDate)}</p>
          </div>
          {bill.dueDate && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Due by</p>
              <p className={cn("mt-0.5 font-bold", bill.overdue && "text-danger")}>{formatDate(bill.dueDate)}</p>
            </div>
          )}
        </div>
        {gst && bill.placeOfSupply && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Place of supply</p>
            <p className="mt-0.5 font-bold">
              {stateName(bill.placeOfSupply)} ({bill.placeOfSupply})
            </p>
          </div>
        )}
      </div>

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
            {bill.items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="py-3 pr-3">
                  <p className="font-semibold">{item.name}</p>
                  {item.description && <p className="text-sm text-ink-muted">{item.description}</p>}
                  <p className="text-sm text-ink-muted tabular sm:hidden">
                    {item.quantity} × {money(item.rate)} {UNIT_LABELS[item.unit]}
                  </p>
                  {(gst || (showSac && item.sac)) && (
                    <p className="text-xs text-ink-muted tabular">
                      {[item.sac && `SAC ${item.sac}`, gst && (item.taxRate > 0 ? `GST ${item.taxRate}%` : "No GST")].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </td>
                <td className="hidden py-3 text-right tabular sm:table-cell">{item.quantity}</td>
                <td className="hidden py-3 text-right tabular sm:table-cell">
                  {money(item.rate)}
                  <span className="block text-xs text-ink-muted">{UNIT_LABELS[item.unit]}</span>
                </td>
                <td className="py-3 text-right font-semibold tabular">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto mt-4 max-w-sm space-y-1.5 border-t border-line pt-4 text-[15px]">
          <Row label="Subtotal" value={money(bill.subtotal)} />
          {bill.discount > 0 && <Row label="Discount" value={`− ${money(bill.discount)}`} />}
          {gst && bill.discount > 0 && <Row label="Taxable value" value={exact(bill.taxable)} />}
          {gst && !bill.interState && (
            <>
              <Row label="CGST" value={exact(bill.cgst)} />
              <Row label="SGST" value={exact(bill.sgst)} />
            </>
          )}
          {gst && bill.interState && <Row label="IGST" value={exact(bill.igst)} />}
          {bill.roundOff !== 0 && <Row label="Round off" value={`${bill.roundOff > 0 ? "+" : "−"} ${exact(Math.abs(bill.roundOff))}`} />}
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3">
            <dt className="font-bold">Total</dt>
            <dd className="font-display text-2xl font-extrabold tabular">{money(bill.total)}</dd>
          </div>
          <p className="text-right text-xs text-ink-muted">{rupeesInWords(bill.total)}</p>
          {!cancelled && bill.received > 0 && (
            <>
              <Row label="Received" value={`− ${money(bill.received)}`} />
              <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2">
                <dt className="font-bold">Balance due</dt>
                <dd className={cn("text-lg font-extrabold tabular", bill.due > 0 ? "text-danger" : "text-success")}>
                  {bill.due > 0 ? money(bill.due) : "Paid in full"}
                </dd>
              </div>
            </>
          )}
        </dl>

        {gst && bill.byRate.length > 0 && (
          <div className="mt-6 break-inside-avoid">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">GST summary</p>
            <table className="w-full text-right text-xs tabular sm:text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-muted">
                  <th className="py-2 text-left font-semibold">Rate</th>
                  <th className="py-2 font-semibold">Taxable</th>
                  {bill.interState ? (
                    <th className="py-2 font-semibold">IGST</th>
                  ) : (
                    <>
                      <th className="py-2 font-semibold">CGST</th>
                      <th className="py-2 font-semibold">SGST</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {bill.byRate.map((r) => (
                  <tr key={r.rate} className="border-b border-line last:border-0">
                    <td className="py-2 text-left">{r.rate}%</td>
                    <td className="py-2">{exact(r.taxable)}</td>
                    {bill.interState ? (
                      <td className="py-2">{exact(r.igst)}</td>
                    ) : (
                      <>
                        <td className="py-2">{exact(r.cgst)}</td>
                        <td className="py-2">{exact(r.sgst)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payments.length > 0 && !cancelled && (
        <div className="break-inside-avoid border-t border-line p-6 text-sm sm:p-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Payments received</p>
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.number} className="flex items-baseline justify-between gap-4">
                <span>
                  {formatDate(p.paidOn)} · {PAYMENT_METHOD_LABELS[p.method]} <span className="text-ink-muted">({p.number})</span>
                </span>
                <span className="font-semibold tabular">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(bill.notes || bill.terms) && (
        <div className="break-inside-avoid space-y-4 border-t border-line p-6 text-sm sm:p-8">
          {bill.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notes</p>
              <p className="mt-1 whitespace-pre-line">{bill.notes}</p>
            </div>
          )}
          {bill.terms && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Terms and payment details</p>
              <p className="mt-1 whitespace-pre-line text-ink-muted">{bill.terms}</p>
            </div>
          )}
        </div>
      )}

      <footer className="flex break-inside-avoid justify-end border-t border-line p-6 text-sm sm:px-8">
        <div className="text-center">
          <p className="font-semibold">For {business.name}</p>
          <p className="mt-10 border-t border-line-strong pt-1 text-xs text-ink-muted">Authorised signatory</p>
        </div>
      </footer>
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
