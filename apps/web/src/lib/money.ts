/**
 * Amounts the Indian way, for typing them in. For showing an amount with the ₹ sign use
 * `formatMoney` / `formatMoneyShort` from @wedding-yantra/core; for bills, `rupeesInWords`.
 */

const grouped = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** `150000` -> `1,50,000`, `1234.5` -> `1,234.5`. Digits only, no ₹ sign. */
export function formatINR(amount: number): string {
  return Number.isFinite(amount) ? grouped.format(amount) : "";
}

const UNITS: [value: number, word: string][] = [
  [1_00_00_000, "crore"],
  [1_00_000, "lakh"],
  [1_000, "thousand"],
];

/** Up to two decimals, the trailing zeros dropped: 1.50 -> "1.5". */
const short = (n: number) => grouped.format(Math.round(n * 100) / 100);

/**
 * The amount as people say it: `150000` -> `1.5 lakh`, `22500000` -> `2.25 crore`,
 * `45000` -> `45 thousand`, `149999` -> `about 1.5 lakh`. Empty under a thousand, where the
 * figure already reads fine.
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return "";
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "minus " : "";
  for (let i = 0; i < UNITS.length; i++) {
    const [unit, word] = UNITS[i]!;
    if (abs < unit) continue;
    const rounded = Math.round((abs / unit) * 100) / 100;
    // 99,99,999 rounds to "100 lakh": say "about 1 crore" instead.
    const bigger = UNITS[i - 1];
    if (bigger && rounded * unit >= bigger[0]) return `about ${sign}1 ${bigger[1]}`;
    const exact = Math.abs(rounded * unit - abs) < 0.005;
    return `${exact ? "" : "about "}${sign}${short(abs / unit)} ${word}`;
  }
  return "";
}
