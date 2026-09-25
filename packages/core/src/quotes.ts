/**
 * Quote maths, shared by the API (which is the source of truth), the web app and the
 * mobile app (which show live totals while someone edits a quote).
 *
 * Amounts are in rupees with paise. The discount is taken off before tax, spread over
 * the lines in proportion to their amount, so GST is charged on what the client pays.
 */

export interface QuoteLineInput {
  quantity: number;
  rate: number;
  /** GST percent for this line, e.g. 18. Zero when the business doesn't charge GST. */
  taxRate: number;
}

export interface QuoteTotals {
  /** Each line's quantity × rate, rounded to paise */
  lineAmounts: number[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeQuoteTotals(lines: QuoteLineInput[], discount = 0): QuoteTotals {
  const lineAmounts = lines.map((l) => round2(l.quantity * l.rate));
  const subtotal = round2(lineAmounts.reduce((a, b) => a + b, 0));
  const safeDiscount = round2(Math.min(Math.max(discount, 0), subtotal));
  const share = subtotal > 0 ? safeDiscount / subtotal : 0;
  const tax = round2(lines.reduce((sum, l, i) => sum + (lineAmounts[i] ?? 0) * (1 - share) * (l.taxRate / 100), 0));
  return { lineAmounts, subtotal, discount: safeDiscount, tax, total: round2(subtotal - safeDiscount + tax) };
}

/** Q-0007 */
export const quoteNumber = (n: number) => `Q-${String(n).padStart(4, "0")}`;
