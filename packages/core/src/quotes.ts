/**
 * Quote maths, shared by the API (which is the source of truth), the web app and the
 * mobile app (which show live totals while someone edits a quote).
 *
 * Amounts are in rupees with paise. The discount is taken off before tax, spread over
 * the lines in proportion to their amount, so GST is charged on what the client pays.
 * Each line's GST is worked out on its own and rounded to paise, the way a printed
 * bill shows it, so a bill made from a quote has exactly the same numbers.
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

export interface LineBreakdown {
  /** Quantity × rate */
  amount: number;
  /** This line's part of the discount */
  discount: number;
  /** What GST is charged on: amount minus discount */
  taxable: number;
  tax: number;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (list: number[]) => round2(list.reduce((a, b) => a + b, 0));

/** Every line's amount, share of the discount, taxable value and GST. */
export function computeLines(lines: QuoteLineInput[], discount = 0): { lines: LineBreakdown[]; subtotal: number; discount: number } {
  const amounts = lines.map((l) => round2(l.quantity * l.rate));
  const subtotal = sum(amounts);
  const safeDiscount = round2(Math.min(Math.max(discount, 0), subtotal));
  // The last line with an amount takes whatever paise are left, so the shares add up exactly.
  let last = -1;
  amounts.forEach((a, i) => {
    if (a > 0) last = i;
  });
  let given = 0;
  const breakdown = lines.map((line, i) => {
    const amount = amounts[i] ?? 0;
    let share = 0;
    if (subtotal > 0 && amount > 0) {
      share = i === last ? round2(safeDiscount - given) : round2((safeDiscount * amount) / subtotal);
      given = round2(given + share);
    }
    const taxable = Math.max(round2(amount - share), 0);
    return { amount, discount: share, taxable, tax: round2((taxable * line.taxRate) / 100) };
  });
  return { lines: breakdown, subtotal, discount: safeDiscount };
}

export function computeQuoteTotals(lines: QuoteLineInput[], discount = 0): QuoteTotals {
  const result = computeLines(lines, discount);
  const tax = sum(result.lines.map((l) => l.tax));
  return {
    lineAmounts: result.lines.map((l) => l.amount),
    subtotal: result.subtotal,
    discount: result.discount,
    tax,
    total: round2(result.subtotal - result.discount + tax),
  };
}

/** Q-0007 */
export const quoteNumber = (n: number) => `Q-${String(n).padStart(4, "0")}`;
