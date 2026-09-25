const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `2026-11-14` -> `14 Nov 2026`. Works on calendar dates, so it never shifts a day
 * because of the device's time zone. Also accepts full ISO timestamps (uses the date part).
 */
export function formatDate(isoDate: string, options: { year?: boolean } = {}): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const [, y, mo, d] = m;
  const day = Number(d);
  const month = MONTHS[Number(mo) - 1] ?? mo;
  return options.year === false ? `${day} ${month}` : `${day} ${month} ${y}`;
}

/** Greeting for the Home screen, based on the local hour (0–23). */
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First name from a full name, for friendly headings. */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}
