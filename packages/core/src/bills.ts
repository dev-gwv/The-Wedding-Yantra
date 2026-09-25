/**
 * Bills (GST tax invoices) for India. Shared by the API, which saves the numbers, and
 * the apps, which show them live while someone edits a bill.
 *
 * - Lines, discount and GST follow the quote maths exactly (see quotes.ts).
 * - Inside the business's own state, each line's GST is split into CGST and SGST.
 *   For an event in another state, it is IGST.
 * - A business without a GST number can't charge GST, so its bills carry none.
 * - The grand total is rounded to the nearest rupee, shown as a "round off" line.
 */
import { formatDate } from "./dates.js";
import { formatMoney } from "./money.js";
import { computeLines, round2, type QuoteLineInput } from "./quotes.js";

export interface BillLine {
  amount: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

export interface BillTaxRow {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface BillTotals {
  lines: BillLine[];
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  /** Rupees and paise, before rounding */
  exactTotal: number;
  /** Added to reach a whole-rupee total, e.g. -0.29 */
  roundOff: number;
  total: number;
  /** GST summary, one row per rate that was charged */
  byRate: BillTaxRow[];
}

const sum = (list: number[]) => round2(list.reduce((a, b) => a + b, 0));

export function computeBillTotals(
  lines: QuoteLineInput[],
  discount: number,
  options: { chargesGst: boolean; interState: boolean },
): BillTotals {
  const taxed = options.chargesGst ? lines : lines.map((l) => ({ ...l, taxRate: 0 }));
  const base = computeLines(taxed, discount);
  const billLines: BillLine[] = base.lines.map((l) => {
    if (options.interState) return { ...l, cgst: 0, sgst: 0, igst: l.tax };
    const cgst = round2(l.tax / 2);
    return { ...l, cgst, sgst: round2(l.tax - cgst), igst: 0 };
  });

  const rates = new Map<number, BillTaxRow>();
  billLines.forEach((l, i) => {
    const rate = taxed[i]?.taxRate ?? 0;
    if (rate === 0) return;
    const row = rates.get(rate) ?? { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    rates.set(rate, {
      rate,
      taxable: round2(row.taxable + l.taxable),
      cgst: round2(row.cgst + l.cgst),
      sgst: round2(row.sgst + l.sgst),
      igst: round2(row.igst + l.igst),
    });
  });

  const tax = sum(billLines.map((l) => l.tax));
  const exactTotal = round2(base.subtotal - base.discount + tax);
  const total = Math.round(exactTotal);
  return {
    lines: billLines,
    subtotal: base.subtotal,
    discount: base.discount,
    taxable: sum(billLines.map((l) => l.taxable)),
    cgst: sum(billLines.map((l) => l.cgst)),
    sgst: sum(billLines.map((l) => l.sgst)),
    igst: sum(billLines.map((l) => l.igst)),
    tax,
    exactTotal,
    roundOff: round2(total - exactTotal),
    total,
    byRate: [...rates.values()].sort((a, b) => a.rate - b.rate),
  };
}

/** The Indian financial year (April to March) that a `YYYY-MM-DD` date falls in: `2026-27`. */
export function financialYear(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** INV/26-27/0007: at most 16 characters, as GST rules require. */
export function billNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy.slice(2)}/${String(seq).padStart(4, "0")}`;
}

/** GST state codes, as the first two digits of a GST number. */
export const INDIAN_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
] as const;
export type StateCode = (typeof INDIAN_STATES)[number]["code"];
export const STATE_CODES = INDIAN_STATES.map((s) => s.code) as [StateCode, ...StateCode[]];

export function stateName(code: string | null | undefined): string | null {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? null;
}

/** The state a GST number is registered in: its first two digits. */
export function stateFromGstin(gstin: string | null | undefined): string | null {
  const code = gstin?.slice(0, 2) ?? "";
  return INDIAN_STATES.some((s) => s.code === code) ? code : null;
}

/**
 * A `upi://` link that opens any UPI app (GPay, PhonePe, Paytm, BHIM) with the amount
 * filled in. The same text in a QR code works from a computer screen.
 */
export function upiLink(options: { upiId: string; payee: string; amount: number; note?: string }): string {
  const parts = [
    `pa=${options.upiId}`,
    `pn=${encodeURIComponent(options.payee.slice(0, 40))}`,
    `am=${options.amount.toFixed(2)}`,
    "cu=INR",
  ];
  if (options.note) parts.push(`tn=${encodeURIComponent(options.note.slice(0, 50))}`);
  return `upi://pay?${parts.join("&")}`;
}

export const PAYMENT_METHODS = ["upi", "cash", "bank", "cheque", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  cash: "Cash",
  bank: "Bank transfer",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

/** R-0007: receipt number for money received */
export const receiptNumber = (n: number) => `R-${String(n).padStart(4, "0")}`;

// ---------------------------------------------------------------------------
// WhatsApp messages. Plain and polite, in the business's voice.
// ---------------------------------------------------------------------------

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function billMessage(o: {
  clientName: string;
  business: string;
  number: string;
  total: number;
  due: number;
  dueDate: string | null;
  link: string;
  /** The business takes UPI, so the link has a Pay button */
  payOnline: boolean;
}): string {
  const due =
    o.due <= 0 ? "It is fully paid. Thank you!" : `Balance due: ${formatMoney(o.due)}${o.dueDate ? ` by ${formatDate(o.dueDate, { year: false })}` : ""}.`;
  const see = o.due > 0 && o.payOnline ? "See it and pay by UPI here" : "See it here";
  return `Hi ${first(o.clientName)}, here is your bill ${o.number} from ${o.business} for ${formatMoney(o.total)}. ${due} ${see}: ${o.link}`;
}

export function receiptMessage(o: { clientName: string; business: string; amount: number; method: PaymentMethod; paidOn: string; due: number; link: string | null }): string {
  const how = o.method === "other" ? "" : ` by ${PAYMENT_METHOD_LABELS[o.method]}`;
  const rest = o.due > 0 ? `Balance due: ${formatMoney(o.due)}.` : "Everything is paid. Thank you!";
  return `Hi ${first(o.clientName)}, ${o.business} received ${formatMoney(o.amount)}${how} on ${formatDate(o.paidOn, { year: false })}. ${rest}${o.link ? ` Your bill: ${o.link}` : ""}`;
}

export function reminderMessage(o: {
  clientName: string;
  business: string;
  due: number;
  forWhat: string;
  dueDate: string | null;
  link: string | null;
  payOnline: boolean;
}): string {
  const when = o.dueDate ? `, due by ${formatDate(o.dueDate, { year: false })}` : "";
  const see = o.link ? ` ${o.payOnline ? "See the bill and pay by UPI" : "See the bill"} here: ${o.link}` : "";
  return `Hi ${first(o.clientName)}, a gentle reminder from ${o.business}: ${formatMoney(o.due)} is due for ${o.forWhat}${when}.${see} Thank you!`;
}
