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

/**
 * Gets typed lines ready for the bill maths:
 * - Prices that include GST are turned into prices before GST (₹50,000 with 18% is
 *   ₹42,372.88 + ₹7,627.12 GST), so the bill shows the taxable value, as GST requires.
 * - A discount given as a percentage becomes rupees on the price before GST.
 * - A rupee discount on prices that include GST is taken off the price with GST, so
 *   "₹5,000 off" means the client pays ₹5,000 less.
 */
export function prepareBillLines<L extends QuoteLineInput>(
  lines: L[],
  options: { chargesGst: boolean; pricesIncludeGst: boolean; discount: number; discountPercent?: number | null },
): { lines: L[]; discount: number } {
  const inclusive = options.chargesGst && options.pricesIncludeGst;
  const prepared = inclusive
    ? lines.map((l) => (l.taxRate > 0 ? { ...l, rate: round2(l.rate / (1 + l.taxRate / 100)) } : l))
    : lines;
  const before = sum(prepared.map((l) => l.quantity * l.rate));
  if (options.discountPercent) return { lines: prepared, discount: Math.min(before, round2((before * options.discountPercent) / 100)) };
  if (inclusive && options.discount > 0) {
    const withGst = sum(lines.map((l) => l.quantity * l.rate));
    const ratio = before > 0 ? withGst / before : 1;
    return { lines: prepared, discount: Math.min(before, round2(options.discount / ratio)) };
  }
  return { lines: prepared, discount: options.discount };
}

/** "Net 15" and friends: how many days after the invoice date it's due. Null: pick a date. */
export const PAYMENT_TERMS = [
  { key: "receipt", label: "Due on receipt", days: 0 },
  { key: "net7", label: "Within 7 days", days: 7 },
  { key: "net15", label: "Within 15 days", days: 15 },
  { key: "net30", label: "Within 30 days", days: 30 },
  { key: "event", label: "Before the event", days: null },
  { key: "custom", label: "Pick a date", days: null },
] as const;
export type PaymentTermKey = (typeof PAYMENT_TERMS)[number]["key"];

/** The GST rates on offer today (GST 2.0, from 22 Sep 2025). Older rates stay readable on old records. */
export const GST_RATE_CHOICES = [0, 5, 18, 40] as const;

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
  return `Hi ${first(o.clientName)}, here is your invoice ${o.number} from ${o.business} for ${formatMoney(o.total)}. ${due} ${see}: ${o.link}`;
}

export function receiptMessage(o: { clientName: string; business: string; amount: number; method: string | null; paidOn: string; due: number; link: string | null }): string {
  // `method` is the payment mode's name ("UPI", "Google Pay"); "Other" says nothing useful.
  const how = !o.method || o.method.toLowerCase() === "other" ? "" : ` by ${o.method}`;
  const rest = o.due > 0 ? `Balance due: ${formatMoney(o.due)}.` : "Everything is paid. Thank you!";
  return `Hi ${first(o.clientName)}, ${o.business} received ${formatMoney(o.amount)}${how} on ${formatDate(o.paidOn, { year: false })}. ${rest}${o.link ? ` Your invoice: ${o.link}` : ""}`;
}

export function reminderMessage(o: {
  clientName: string;
  business: string;
  due: number;
  forWhat: string;
  dueDate: string | null;
  link: string | null;
  payOnline: boolean;
  /** Paid in parts: the part being asked for, e.g. "Before the event" */
  part?: string | null;
}): string {
  const when = o.dueDate ? `, due by ${formatDate(o.dueDate, { year: false })}` : "";
  if (o.part) {
    const see = o.link ? ` ${o.payOnline ? "See the invoice and pay by UPI" : "See the invoice and the full plan"} here: ${o.link}` : "";
    return `Hi ${first(o.clientName)}, a gentle reminder from ${o.business}: the "${o.part}" payment of ${formatMoney(o.due)} for ${o.forWhat} is due${when ? when.replace(", due", "") : ""}.${see} Thank you!`;
  }
  const see = o.link ? ` ${o.payOnline ? "See the invoice and pay by UPI" : "See the invoice"} here: ${o.link}` : "";
  return `Hi ${first(o.clientName)}, a gentle reminder from ${o.business}: ${formatMoney(o.due)} is due for ${o.forWhat}${when}.${see} Thank you!`;
}

// ---------------------------------------------------------------------------
// Payment plans: an invoice paid in parts ("30% to book, 40% a week before, 30% on the day")
// ---------------------------------------------------------------------------

export interface PlanPartInput {
  label: string;
  /** A share of the invoice total; or give an amount instead */
  percent?: number | null;
  amount?: number | null;
  dueDate?: string | null;
}

/**
 * Rupees for each part. When every part is a percentage and they add up to 100, the last
 * part takes the rounding, so the parts always add up to the total exactly.
 */
export function instalmentAmounts(parts: readonly PlanPartInput[], total: number): number[] {
  const amounts = parts.map((p) => (p.percent != null ? round2((total * p.percent) / 100) : round2(p.amount ?? 0)));
  const allPercent = parts.length > 0 && parts.every((p) => p.percent != null);
  const pct = parts.reduce((a, p) => a + (p.percent ?? 0), 0);
  if (allPercent && Math.abs(pct - 100) < 0.001) {
    const others = sum(amounts.slice(0, -1));
    amounts[amounts.length - 1] = round2(total - others);
  }
  return amounts;
}

export type InstalmentState = "paid" | "part_paid" | "overdue" | "due" | "upcoming";
export const INSTALMENT_STATE_LABELS: Record<InstalmentState, string> = {
  paid: "Paid",
  part_paid: "Part paid",
  overdue: "Overdue",
  due: "Due next",
  upcoming: "Later",
};

export interface InstalmentStatus {
  label: string;
  percent: number | null;
  amount: number;
  dueDate: string | null;
  received: number;
  remaining: number;
  state: InstalmentState;
}

/**
 * Where each part stands. Money received pays the parts in order, the first rupee going to
 * the first part, the way a business talks about it ("the advance is in, the second part
 * is half paid"). Only one part is "due next": the first one not fully paid.
 */
export function planStatus(
  parts: readonly { label: string; percent: number | null; amount: number; dueDate: string | null }[],
  received: number,
  today: string,
): InstalmentStatus[] {
  let cash = Math.max(0, received);
  let nextMarked = false;
  return parts.map((p) => {
    const got = round2(Math.min(cash, p.amount));
    cash = round2(cash - got);
    const remaining = round2(p.amount - got);
    let state: InstalmentState;
    if (remaining <= 0.5) state = "paid";
    else if (p.dueDate && p.dueDate < today) state = "overdue";
    else if (got > 0) state = "part_paid";
    else if (!nextMarked) state = "due";
    else state = "upcoming";
    if (state !== "paid" && !nextMarked) nextMarked = true;
    return { label: p.label, percent: p.percent, amount: p.amount, dueDate: p.dueDate, received: got, remaining: Math.max(0, remaining), state };
  });
}

/** The part to ask for now: the first one not fully paid. */
export function nextInstalment<T extends { state: InstalmentState }>(plan: readonly T[]): T | null {
  return plan.find((p) => p.state !== "paid") ?? null;
}

/** Common ways wedding businesses split a booking. Labels are only a start; each can be changed. */
export const PLAN_PRESETS: { key: string; name: string; parts: { label: string; percent: number }[] }[] = [
  { key: "half", name: "50 / 50", parts: [{ label: "Advance to book", percent: 50 }, { label: "Balance", percent: 50 }] },
  {
    key: "thirds",
    name: "30 / 40 / 30",
    parts: [
      { label: "Advance to book", percent: 30 },
      { label: "Before the event", percent: 40 },
      { label: "On the day", percent: 30 },
    ],
  },
  {
    key: "delivery",
    name: "30 / 30 / 30 / 10",
    parts: [
      { label: "Advance to book", percent: 30 },
      { label: "Before the event", percent: 30 },
      { label: "On the day", percent: 30 },
      { label: "On delivery", percent: 10 },
    ],
  },
  { key: "token", name: "25% + balance", parts: [{ label: "Token advance", percent: 25 }, { label: "Balance", percent: 75 }] },
];
