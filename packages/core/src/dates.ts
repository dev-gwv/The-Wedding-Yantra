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

/**
 * The viewer's local calendar date as `YYYY-MM-DD`, moved by `days` if given.
 * Unlike `toISOString()`, this never slips to yesterday in the early hours in India.
 */
export function localISODate(from: Date = new Date(), days = 0): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * A follow-up time in words, in the viewer's own time zone:
 * "Today, 6 pm", "Tomorrow, 11 am", "Yesterday", "Mon 12 Nov".
 */
export function formatFollowUp(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `Today, ${clock(d)}`;
  if (days === 1) return `Tomorrow, ${clock(d)}`;
  if (days === -1) return "Yesterday";
  const date = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? date : `${date} ${d.getFullYear()}`;
}

/** "3 hours ago", "2 days ago", or a date, for activity timelines. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso, { year: new Date(iso).getFullYear() !== now.getFullYear() });
}

/** Quick follow-up choices, as real times in the viewer's time zone. */
export function followUpPresets(now: Date = new Date()): { label: string; at: Date }[] {
  const at = (addDays: number, hour: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, hour, 0, 0, 0);
    return d;
  };
  const presets = [
    { label: "Tomorrow morning", at: at(1, 11) },
    { label: "In 3 days", at: at(3, 11) },
    { label: "Next week", at: at(7, 11) },
  ];
  if (now.getHours() < 17) presets.unshift({ label: "This evening", at: at(0, 18) });
  return presets;
}
