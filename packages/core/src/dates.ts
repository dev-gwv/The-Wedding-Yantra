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

const utcDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
};

/**
 * Today's date (`YYYY-MM-DD`) in a time zone, such as the business's, moved by `days` if given.
 * Apps use it so their "today" matches the API's, whatever the device's own clock says.
 */
export function todayIn(timeZone: string, now: Date = new Date(), days = 0): string {
  let today: string;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
    today = `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    // An unknown zone: fall back to the device's own date.
    return localISODate(now, days);
  }
  return days ? new Date(utcDay(today) + days * 86_400_000).toISOString().slice(0, 10) : today;
}

/** Whole days from one calendar date (`2026-11-14`) to another. Never shifted by time zones. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

/**
 * When a task is due, next to today (both `YYYY-MM-DD`):
 * "Today", "Tomorrow", "Yesterday", "3 days late", "Mon 16 Nov".
 */
export function formatDueDay(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${-days} days late`;
  const d = new Date(utcDay(dueDate));
  const label = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return dueDate.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${dueDate.slice(0, 4)}`;
}

/** A 24-hour time as people say it: `18:30` -> `6:30 pm`, `09:00` -> `9 am`. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return clock(new Date(2000, 0, 1, h, m));
}

/**
 * Starting days for a trade's checklist, so its steps don't all fall on one day. Steps
 * before the event run in order from a week before to the day before; steps after run
 * from the next day to a week after. Migration 0008 uses the same rule in SQL.
 */
export function checklistDays(items: readonly { when: "before" | "on_day" | "after" }[]): number[] {
  const total = { before: 0, on_day: 0, after: 0 };
  for (const i of items) total[i.when]++;
  const seen = { before: 0, on_day: 0, after: 0 };
  return items.map((i) => {
    const k = seen[i.when]++;
    const n = total[i.when];
    if (i.when === "on_day") return 0;
    if (n === 1) return i.when === "before" ? 3 : 2;
    const step = (6 * k) / (n - 1);
    return Math.round(i.when === "before" ? 7 - step : 1 + step);
  });
}

/** A span of days, short: "3 Oct", "3–5 Oct", "30 Sep – 2 Oct", with the year when it isn't `thisYear`. */
export function formatDateRange(start: string, end: string, thisYear?: string): string {
  const year = (iso: string) => (thisYear && iso.slice(0, 4) !== thisYear ? ` ${iso.slice(0, 4)}` : "");
  if (start === end) return `${formatDate(start, { year: false })}${year(start)}`;
  const [, sm, sd] = start.split("-").map(Number);
  const [, em, ed] = end.split("-").map(Number);
  if (start.slice(0, 7) === end.slice(0, 7)) return `${sd}–${ed} ${MONTHS[em! - 1]}${year(end)}`;
  return `${sd} ${MONTHS[sm! - 1]}${start.slice(0, 4) !== end.slice(0, 4) ? year(start) : ""} – ${ed} ${MONTHS[em! - 1]}${year(end)}`;
}
