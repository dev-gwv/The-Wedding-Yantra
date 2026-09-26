import { formatDate, formatMoney, formatPhone, rupeesInWords, stateName } from "@wedding-yantra/core";
import { UNIT_LABELS, type BankDetails, type Bill, type InvoiceDesign, type Payment } from "@wedding-yantra/types";
import type { CSSProperties } from "react";
import { BusinessMark } from "@/components/app/business-mark";
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
    logoUrl?: string | null;
    invoiceDesign?: InvoiceDesign;
    invoiceAccent?: string;
  };
  bill: Omit<Bill, "shareToken" | "clientId" | "eventId" | "quoteId" | "payments"> & {
    payments: Pick<Payment, "number" | "amount" | "paidOn" | "method" | "methodLabel">[];
  };
  className?: string;
}

const money = (n: number) => formatMoney(n, { paise: n % 1 !== 0 });

/** Black or white, whichever reads better on the accent colour. */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return lum > 0.4 ? "#1c1917" : "#ffffff";
}

/** Class names for each design. The accent is --inv; text on it is --inv-on; a pale wash of it is --inv-soft. */
const LOOKS: Record<
  InvoiceDesign,
  { article: string; header: string; sub: string; label: string; number: string; line: string; head: string; total: string; totalValue: string }
> = {
  classic: {
    article: "border-t-4 border-t-(--inv)",
    header: "border-b border-line",
    sub: "text-ink-muted",
    label: "text-(--inv)",
    number: "",
    line: "border-line",
    head: "border-b border-line text-ink-muted",
    total: "border-t border-line pt-3",
    totalValue: "text-(--inv)",
  },
  modern: {
    article: "",
    header: "bg-(--inv) text-(--inv-on)",
    sub: "text-(--inv-on) opacity-85",
    label: "text-(--inv-on) opacity-85",
    number: "",
    line: "border-line",
    head: "bg-(--inv-soft) text-ink [&_th]:py-2.5 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3",
    total: "mt-2 rounded-2xl bg-(--inv-soft) px-4 py-3",
    totalValue: "text-(--inv)",
  },
  minimal: {
    article: "shadow-none",
    header: "",
    sub: "text-ink-muted",
    label: "text-ink-muted",
    number: "text-(--inv)",
    line: "border-transparent",
    head: "border-b border-line text-ink-muted",
    total: "border-t border-line pt-3",
    totalValue: "",
  },
  bold: {
    article: "border-l-[10px] border-l-(--inv)",
    header: "border-b-2 border-(--inv)",
    sub: "text-ink-muted",
    label: "text-(--inv) text-2xl @lg:text-3xl tracking-tight",
    number: "",
    line: "border-line",
    head: "border-b-2 border-(--inv) text-ink",
    total: "mt-2 rounded-2xl bg-(--inv) px-4 py-3 text-(--inv-on) [&_dt]:text-(--inv-on)",
    totalValue: "",
  },
};
const exact = (n: number) => formatMoney(n, { paise: true });

/**
 * The bill as the client sees it, laid out as a GST tax invoice: seller and buyer,
 * place of supply, SAC codes, CGST and SGST (or IGST), amount in words. Prints cleanly
 * on A4 with the browser's "Save as PDF".
 */
export function BillDocument({ business, bill, className }: BillDocumentProps) {
  const design = business.invoiceDesign ?? "classic";
  const accent = business.invoiceAccent ?? "#E85C00";
  const look = LOOKS[design];
  const style = {
    "--inv": accent,
    "--inv-on": textOn(accent),
    "--inv-soft": `color-mix(in srgb, ${accent} 9%, white)`,
  } as CSSProperties;
  const contact = [business.phone ? formatPhone(business.phone) : null, business.email].filter(Boolean).join(" · ");
  const gst = bill.chargesGst;
  const showSac = bill.items.some((i) => i.sac);
  const cancelled = bill.status === "cancelled";
  const payments = [...bill.payments].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.number.localeCompare(b.number));

  return (
    <article
      style={style}
      data-design={design}
      className={cn(
        "@container relative overflow-hidden rounded-3xl border border-line bg-surface shadow-soft [print-color-adjust:exact] print:rounded-none print:border-0 print:shadow-none",
        look.article,
        className,
      )}
    >
      {cancelled && (
        <p className="border-b border-line bg-cream px-6 py-3 text-center text-sm font-bold uppercase tracking-wider text-danger @lg:px-8">
          Cancelled{bill.cancelReason ? `: ${bill.cancelReason}` : ""}
        </p>
      )}

      <header className={cn("flex flex-wrap items-start justify-between gap-6 p-6 @lg:p-8", look.header)}>
        <div className="flex items-start gap-4">
          <BusinessMark logoUrl={business.logoUrl} icon={business.icon} name={business.name} tone={design === "modern" ? "surface" : "gradient"} />
          <div className="min-w-0">
            <p className="font-display text-2xl font-extrabold leading-tight">{business.name}</p>
            <p className={cn("text-sm", look.sub)}>
              {business.typeName} · {business.city}
            </p>
            {business.address && <p className={cn("mt-1 max-w-xs whitespace-pre-line text-sm", look.sub)}>{business.address}</p>}
            {contact && <p className={cn("mt-1 text-sm tabular", look.sub)}>{contact}</p>}
            {bill.sellerGstin && <p className="mt-1 text-sm font-semibold tabular">GSTIN {bill.sellerGstin}</p>}
          </div>
        </div>
        {/* Sits under the business on a phone, so it lines up left there */}
        <div className="@lg:text-right">
          <p className={cn("text-xs font-extrabold uppercase tracking-wider", look.label)}>{gst ? "Tax invoice" : "Invoice"}</p>
          <p className={cn("font-display text-xl font-extrabold tabular", look.number)}>{bill.number}</p>
          <div className="mt-2 flex @lg:justify-end print:hidden">
            <BillStatusPill bill={bill} />
          </div>
        </div>
      </header>

      {bill.subject && (
        <p className={cn("border-b px-6 py-3 text-[15px] font-semibold @lg:px-8", look.line)}>
          <span className="font-normal text-ink-muted">For: </span>
          {bill.subject}
        </p>
      )}

      <div className={cn("grid gap-5 border-b p-6 @lg:grid-cols-3 @lg:p-8", look.line)}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Bill to</p>
          <p className="mt-0.5 font-bold">{bill.billTo.name}</p>
          {bill.billTo.address && <p className="whitespace-pre-line text-sm text-ink-muted">{bill.billTo.address}</p>}
          {bill.billTo.phone && <p className="text-sm text-ink-muted tabular">{formatPhone(bill.billTo.phone)}</p>}
          {bill.billTo.gstin && <p className="text-sm font-semibold tabular">GSTIN {bill.billTo.gstin}</p>}
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Invoice date</p>
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

      <div className="p-6 @lg:p-8">
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr className={cn("text-xs font-semibold uppercase tracking-wider", look.head)}>
              <th className="pb-3 font-semibold">Service</th>
              <th className="hidden pb-3 text-right font-semibold @lg:table-cell">Qty</th>
              <th className="hidden pb-3 text-right font-semibold @lg:table-cell">Rate</th>
              <th className="pb-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bill.items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="py-3 pr-3">
                  <p className="font-semibold">{item.name}</p>
                  {item.description && <p className="text-sm text-ink-muted">{item.description}</p>}
                  <p className="text-sm text-ink-muted tabular @lg:hidden">
                    {item.quantity} × {money(item.rate)} {UNIT_LABELS[item.unit]}
                  </p>
                  {(gst || (showSac && item.sac)) && (
                    <p className="text-xs text-ink-muted tabular">
                      {[item.sac && `SAC ${item.sac}`, gst && (item.taxRate > 0 ? `GST ${item.taxRate}%` : "No GST")].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </td>
                <td className="hidden py-3 text-right tabular @lg:table-cell">{item.quantity}</td>
                <td className="hidden py-3 text-right tabular @lg:table-cell">
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
          <div className={cn("flex items-baseline justify-between gap-4", look.total)}>
            <dt className="font-bold">Total</dt>
            <dd className={cn("font-display text-2xl font-extrabold tabular", look.totalValue)}>{money(bill.total)}</dd>
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
            <table className="w-full text-right text-xs tabular @lg:text-sm">
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

      {bill.bank && !cancelled && bill.due > 0 && <PayTo bank={bill.bank} className={look.line} />}

      {payments.length > 0 && !cancelled && (
        <div className={cn("break-inside-avoid border-t p-6 text-sm @lg:p-8", look.line)}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Payments received</p>
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.number} className="flex items-baseline justify-between gap-4">
                <span>
                  {formatDate(p.paidOn)} · {p.methodLabel} <span className="text-ink-muted">({p.number})</span>
                </span>
                <span className="font-semibold tabular">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(bill.notes || bill.terms) && (
        <div className={cn("break-inside-avoid space-y-4 border-t p-6 text-sm @lg:p-8", look.line)}>
          {bill.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Notes</p>
              <p className="mt-1 whitespace-pre-line">{bill.notes}</p>
            </div>
          )}
          {bill.terms && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Terms</p>
              <p className="mt-1 whitespace-pre-line text-ink-muted">{bill.terms}</p>
            </div>
          )}
        </div>
      )}

      <footer className={cn("flex break-inside-avoid justify-end border-t p-6 text-sm @lg:px-8", look.line)}>
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

/** Where to pay: the account printed on this invoice. */
function PayTo({ bank, className }: { bank: BankDetails; className?: string }) {
  const rows: [string, string | null][] = [
    ["Account name", bank.accountName],
    ["Account number", bank.accountNumber],
    ["IFSC", bank.ifsc],
    ["Bank", [bank.bankName, bank.branch].filter(Boolean).join(", ") || null],
    ["UPI ID", bank.upiId],
  ];
  return (
    <div className={cn("break-inside-avoid border-t p-6 text-sm @lg:p-8", className)}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Pay to</p>
      <dl className="grid gap-x-8 gap-y-1.5 @lg:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 @lg:justify-start">
              <dt className="text-ink-muted @lg:w-32">{k}</dt>
              <dd className="font-semibold tabular">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
