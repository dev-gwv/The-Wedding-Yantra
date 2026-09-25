const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const rupeesWithPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `120000` -> `₹1,20,000`. Pass `{ paise: true }` to always show two decimals. */
export function formatMoney(amount: number, options: { paise?: boolean } = {}): string {
  return (options.paise ? rupeesWithPaise : rupees).format(amount);
}

/** Short form for tight spaces: `₹1.2L`, `₹3.5Cr`, `₹85K`. */
export function formatMoneyShort(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const trim = (n: number) => (Math.round(n * 10) / 10).toString();
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}K`;
  return `${sign}₹${Math.round(abs)}`;
}
