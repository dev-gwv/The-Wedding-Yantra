import type { PaymentMethod } from "@wedding-yantra/core";
import { z } from "zod";
import type { ExpenseCategory } from "./expenses.js";
import type { LeadSource } from "./sales.js";

export const monthQuery = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-11"),
});

/** One month of the business in numbers, worked out by the server. */
export interface MonthReport {
  month: string;
  /** Money that actually came in and went out this month */
  cash: { received: number; spent: number; net: number };
  /** Bills made this month (cancelled ones left out): what the CA needs for GST */
  sales: { bills: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number; total: number };
  /** Billed before GST, minus approved expenses */
  profit: { earned: number; spent: number; profit: number };
  /** Still to collect today, across all months */
  toCollect: number;
  overdue: number;
  /** Where this month's billed work came from */
  bySource: { source: LeadSource | "direct"; taxable: number; bills: number }[];
  /** What sold, by line on this month's bills */
  byService: { name: string; quantity: number; taxable: number }[];
  /** Whose enquiries turned into this month's bills */
  byMember: { name: string; taxable: number; bills: number }[];
  byCategory: { category: ExpenseCategory; total: number }[];
  receivedByMethod: { method: PaymentMethod; total: number }[];
}

export const EXPORT_KINDS = ["bills", "payments", "expenses"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const exportQuery = monthQuery.extend({ kind: z.enum(EXPORT_KINDS) });

/** A spreadsheet file: the app saves or shares it. Opens in Excel and Google Sheets. */
export interface ExportFile {
  filename: string;
  /** CSV text, with a byte-order mark so Excel reads ₹ and Hindi names correctly */
  content: string;
  rows: number;
}
