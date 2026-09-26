/**
 * Repeating tasks: "post 3 reels every week", "follow up all leads daily". A rule makes
 * one ordinary task per occurrence; these helpers say which days it falls on.
 */

export const REPEAT_FREQUENCIES = ["daily", "weekly", "monthly"] as const;
export type RepeatFrequency = (typeof REPEAT_FREQUENCIES)[number];

export interface RepeatRule {
  frequency: RepeatFrequency;
  /** Weekly: 1 = Monday … 7 = Sunday */
  weekdays: number[];
  /** Monthly: 1–31; short months use their last day */
  monthDay: number | null;
  /** YYYY-MM-DD: nothing before this */
  startDate: string;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** 1 = Monday … 7 = Sunday */
export const weekdayOf = (s: string) => ((parse(s).getUTCDay() + 6) % 7) + 1;

/** The rule's day in a given month, pulled back to the month's last day when needed. */
function dayInMonth(year: number, month: number, monthDay: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(year, month, Math.min(monthDay, last))));
}

function falls(rule: RepeatRule, day: string): boolean {
  if (day < rule.startDate) return false;
  if (rule.frequency === "daily") return true;
  if (rule.frequency === "weekly") return rule.weekdays.includes(weekdayOf(day));
  const d = parse(day);
  return rule.monthDay !== null && dayInMonth(d.getUTCFullYear(), d.getUTCMonth(), rule.monthDay) === day;
}

/** The latest day on or before `today` the rule falls on, or null when it hasn't started. */
export function latestOccurrence(rule: RepeatRule, today: string): string | null {
  // Any rule falls at least once in a 31-day window.
  for (let i = 0; i <= 31; i++) {
    const day = addDays(today, -i);
    if (day < rule.startDate) return null;
    if (falls(rule, day)) return day;
  }
  return null;
}

/** The first day on or after `from` the rule falls on. */
export function nextOccurrence(rule: RepeatRule, from: string): string | null {
  const start = from < rule.startDate ? rule.startDate : from;
  for (let i = 0; i <= 62; i++) {
    const day = addDays(start, i);
    if (falls(rule, day)) return day;
  }
  return null;
}

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

/** "Every day", "Every Mon, Wed and Fri", "Every weekday", "Every month on the 5th". */
export function describeRepeat(rule: Pick<RepeatRule, "frequency" | "weekdays" | "monthDay">): string {
  if (rule.frequency === "daily") return "Every day";
  if (rule.frequency === "monthly") return rule.monthDay ? `Every month on the ${ordinal(rule.monthDay)}` : "Every month";
  const days = [...new Set(rule.weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === 7) return "Every day";
  if (days.join() === "1,2,3,4,5") return "Every weekday";
  if (days.join() === "1,2,3,4,5,6") return "Every day but Sunday";
  const names = days.map((d) => WEEKDAY_NAMES[d - 1]!);
  if (names.length <= 1) return `Every ${names[0] ?? "week"}`;
  return `Every ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export { WEEKDAY_NAMES };
