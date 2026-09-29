import { formatDate, localISODate } from "@wedding-yantra/core";

/** Time ranges for the money lists. Years are Indian financial years, April to March. */
export const PERIODS = [
  ["today", "Today"],
  ["month", "This month"],
  ["last_month", "Last month"],
  ["fy", "This year"],
  ["last_fy", "Last year"],
  ["all", "All time"],
] as const;
export type Period = (typeof PERIODS)[number][0];

const iso = (y: number, m: number, d: number) => localISODate(new Date(y, m, d));

/** From and to (both inclusive) for a period, worked out from today. */
export function periodRange(period: Period, today = new Date()): { from?: string; to?: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  switch (period) {
    case "today":
      return { from: iso(y, m, today.getDate()), to: iso(y, m, today.getDate()) };
    case "month":
      return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case "last_month":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "fy":
      return { from: iso(fyStart, 3, 1), to: iso(fyStart + 1, 2, 31) };
    case "last_fy":
      return { from: iso(fyStart - 1, 3, 1), to: iso(fyStart, 2, 31) };
    default:
      return {};
  }
}

/** A named period, or dates the owner picked. */
export type DateRange = { period: Period } | { period: "custom"; from: string; to: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** From and to for any range. */
export function rangeDates(range: DateRange, today = new Date()): { from?: string; to?: string } {
  return range.period === "custom" ? { from: range.from, to: range.to } : periodRange(range.period, today);
}

/** The button's words: "This month", or "1 Sep – 15 Sep 2026" for picked dates. */
export function rangeName(range: DateRange): string {
  if (range.period !== "custom") return PERIODS.find(([k]) => k === range.period)?.[1] ?? "";
  return range.from === range.to ? formatDate(range.from) : `${formatDate(range.from, { year: range.from.slice(0, 4) !== range.to.slice(0, 4) })} – ${formatDate(range.to)}`;
}

/** "Showing records from 1 Sep 2026 to 30 Sep 2026" */
export function rangeSentence(range: DateRange, today = new Date()): string {
  const { from, to } = rangeDates(range, today);
  if (!from || !to) return "Showing all records";
  if (from === to) return `Showing records for ${formatDate(from)}`;
  return `Showing records from ${formatDate(from)} to ${formatDate(to)}`;
}

/** Read the range from the page address: ?range=month, or ?from=…&to=… */
export function rangeFromParams(params: URLSearchParams, fallback: Period = "month"): DateRange {
  const from = params.get("from");
  const to = params.get("to");
  if (from && to && ISO.test(from) && ISO.test(to)) return from <= to ? { period: "custom", from, to } : { period: "custom", from: to, to: from };
  const asked = params.get("range");
  const period = PERIODS.find(([k]) => k === asked)?.[0];
  return { period: period ?? fallback };
}

/** Put the range into the page address, keeping everything else there. */
export function rangeToParams(range: DateRange, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("range");
  next.delete("from");
  next.delete("to");
  if (range.period === "custom") {
    next.set("from", range.from);
    next.set("to", range.to);
  } else next.set("range", range.period);
  return next;
}

/** "April 2026 to March 2027" style name for the financial year, for hints. */
export function financialYearLabel(today = new Date()): string {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** A spreadsheet download made in the browser, with a byte-order mark so Excel reads ₹ and Hindi. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
