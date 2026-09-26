import { localISODate } from "@wedding-yantra/core";

/** Time ranges for the money lists. Years are Indian financial years, April to March. */
export const PERIODS = [
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
