import { optionKey } from "./lists.js";
import { z } from "zod";
import { optionalText } from "./common.js";
import type { PersonRef } from "./sales.js";

// ---------------------------------------------------------------------------
// Uploaded files (bill photos)
// ---------------------------------------------------------------------------

export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
/** Largest file the API takes. Photos are shrunk on the phone first, so this is plenty. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const uploadFileInput = z.object({
  contentType: z.enum(UPLOAD_TYPES, "Use a photo (JPG, PNG, WebP) or a PDF"),
  /** The file's bytes, base64-encoded */
  data: z.string().min(1).max(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 8, "That file is too big. Try a smaller photo."),
  name: optionalText(120),
});
export type UploadFileInput = z.input<typeof uploadFileInput>;

export interface UploadedFile {
  id: string;
  /** API path with a short-lived signature: prefix it with the API's base URL */
  path: string;
  contentType: UploadType;
  size: number;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = ["materials", "vendor", "staff", "travel", "food", "equipment", "rent", "marketing", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: "Materials",
  vendor: "Vendors & helpers",
  staff: "Staff pay",
  travel: "Travel",
  food: "Food",
  equipment: "Equipment",
  rent: "Rent & bills",
  marketing: "Ads & marketing",
  other: "Other",
};

export const EXPENSE_STATUSES = ["approved", "pending", "rejected"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  approved: "Approved",
  pending: "Waiting for approval",
  rejected: "Not approved",
};

export interface Expense {
  id: string;
  amount: number;
  spentOn: string;
  /** A key from the business's expense categories */
  category: string;
  categoryLabel: string;
  paidTo: string | null;
  /** A key from the business's payment modes */
  method: string | null;
  methodLabel: string | null;
  note: string | null;
  eventId: string | null;
  eventTitle: string | null;
  status: ExpenseStatus;
  rejectReason: string | null;
  /** The bill photo, with a short-lived link */
  receipt: UploadedFile | null;
  submittedBy: PersonRef | null;
  reviewedBy: PersonRef | null;
  /** Paid from a team member's own pocket; null means the business paid */
  paidBy: PersonRef | null;
  /** When the business paid that person back */
  reimbursedAt: string | null;
  vendorId: string | null;
  vendorName: string | null;
  /** GST included in the amount: input tax the CA can claim */
  gstRate: number | null;
  gstAmount: number;
  /** The vendor's bill number */
  vendorInvoiceNo: string | null;
  createdAt: string;
}

const amount = z.coerce.number().positive("Enter the amount spent").max(1_000_000_000);

const expenseFields = {
  eventId: z.uuid().nullable().optional(),
  category: optionKey,
  amount,
  spentOn: z.iso.date("Pick the date"),
  paidTo: optionalText(80),
  method: optionKey.nullable().optional(),
  note: optionalText(300),
  receiptFileId: z.uuid().nullable().optional(),
  /** A team member who paid from their own pocket; null for the business */
  paidBy: z.uuid().nullable().optional(),
  vendorId: z.uuid().nullable().optional(),
  gstRate: z.coerce.number().min(0).max(40).nullable().optional(),
  gstAmount: z.coerce.number().min(0, "Can't be negative").max(1_000_000_000).optional(),
  vendorInvoiceNo: optionalText(40),
};

export const expenseInput = z.object(expenseFields);
export type ExpenseInput = z.input<typeof expenseInput>;

/** Only the fields sent are changed. */
export const updateExpenseInput = z.object(expenseFields).partial();
export type UpdateExpenseInput = z.input<typeof updateExpenseInput>;

export const reviewExpenseInput = z.object({
  approve: z.boolean(),
  reason: optionalText(200),
});
export type ReviewExpenseInput = z.input<typeof reviewExpenseInput>;

export const expenseListQuery = z.object({
  eventId: z.uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-11")
    .optional(),
  status: z.enum(EXPENSE_STATUSES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  category: optionKey.optional(),
  /** "business", "reimburse" (paid from a pocket, not paid back yet), or a person's id */
  paidBy: z.union([z.enum(["business", "reimburse"]), z.uuid()]).optional(),
  /** Paid to, note, vendor or bill number */
  q: z.string().trim().max(80).optional(),
});

/** Totals for exactly what a list shows. */
export interface ExpenseListSummary {
  count: number;
  /** Approved money: what counts in profit */
  spent: number;
  /** Waiting for approval */
  pending: number;
  pendingCount: number;
  /** Paid from someone's pocket and not paid back yet (approved ones) */
  toReimburse: number;
  /** GST on approved expenses */
  gst: number;
  byCategory: { category: string; label: string; total: number }[];
}

export const reimburseExpenseInput = z.object({ reimbursed: z.boolean() });
export type ReimburseExpenseInput = z.input<typeof reimburseExpenseInput>;
export type ExpenseListQuery = z.input<typeof expenseListQuery>;

/** One month of spending: what counts (approved), what's waiting, and where it went. */
export interface ExpenseMonth {
  month: string;
  spent: number;
  pending: number;
  pendingCount: number;
  byCategory: { category: string; label: string; total: number }[];
}
