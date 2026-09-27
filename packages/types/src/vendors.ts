import { PAYMENT_METHODS, type PaymentMethod } from "@wedding-yantra/core";
import { z } from "zod";
import { phone } from "./auth.js";
import { optionalText } from "./common.js";
import { GSTIN_PATTERN, UPI_ID_PATTERN } from "./workspaces.js";

// ---------------------------------------------------------------------------
// Vendors: the people a business hires for its events, and what it owes them.
// ---------------------------------------------------------------------------

export interface VendorSummary {
  id: string;
  name: string;
  /** A key from the business's "vendor_category" list */
  category: string | null;
  /** What they do, in words: the category's name */
  service: string | null;
  contactPerson: string | null;
  phone: string | null;
  city: string | null;
  upiId: string | null;
  preferred: boolean;
  archived: boolean;
  /** Still to pay them */
  owed: number;
  /** Paid to them so far */
  paid: number;
}

export interface Vendor extends VendorSummary {
  bankAccount: string | null;
  ifsc: string | null;
  gstin: string | null;
  /** Rates and anything to remember */
  notes: string | null;
  payouts: Payout[];
}

export const PAYOUT_STATUSES = ["owed", "paid"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export interface Payout {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  vendorUpiId: string | null;
  eventId: string | null;
  eventTitle: string | null;
  description: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string | null;
  status: PayoutStatus;
  /** Owed, and its date has passed */
  late: boolean;
  paidOn: string | null;
  method: PaymentMethod | null;
  reference: string | null;
  createdAt: string;
}

const optionalPhone = z
  .union([z.literal(""), phone])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const upiId = z
  .string()
  .trim()
  .refine((v) => v === "" || UPI_ID_PATTERN.test(v), "A UPI ID looks like name@bank")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const date = z
  .union([z.literal(""), z.iso.date("Pick a valid date")])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const optionalUpper = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || pattern.test(v), message)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const vendorInput = z.object({
  name: z.string().trim().min(2, "Enter their name").max(80),
  /** What they do, typed in words (older screens); the category is the list choice */
  service: optionalText(60),
  category: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  contactPerson: optionalText(80),
  phone: optionalPhone,
  city: optionalText(60),
  upiId,
  bankAccount: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^\d{6,20}$/.test(v), "An account number has 6 to 20 digits")
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  ifsc: optionalUpper(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC looks like SBIN0001234"),
  gstin: optionalUpper(GSTIN_PATTERN, "GST number should look like 27ABCDE1234F1Z5"),
  preferred: z.boolean().optional(),
  notes: optionalText(1000),
});
export type VendorInput = z.input<typeof vendorInput>;
export const updateVendorInput = vendorInput.partial().extend({
  /** Archive (true) or bring back (false) */
  archived: z.boolean().optional(),
});
export type UpdateVendorInput = z.input<typeof updateVendorInput>;

const payoutFields = {
  vendorId: z.uuid("Choose who you're paying"),
  eventId: z.uuid().nullable().optional(),
  description: z.string().trim().min(2, "Say what it's for").max(120),
  amount: z.coerce.number().positive("Enter the amount").max(1_000_000_000),
  dueDate: date,
};
export const payoutInput = z.object(payoutFields);
export type PayoutInput = z.input<typeof payoutInput>;
export const updatePayoutInput = z.object(payoutFields).partial();
export type UpdatePayoutInput = z.input<typeof updatePayoutInput>;

/** Marks a payout paid; an expense is recorded on its event. */
export const payPayoutInput = z.object({
  paidOn: z.iso.date("Pick the date"),
  method: z.enum(PAYMENT_METHODS, "How did you pay?"),
  reference: optionalText(60),
});
export type PayPayoutInput = z.input<typeof payPayoutInput>;

export const payoutListQuery = z.object({
  status: z.enum(PAYOUT_STATUSES).optional(),
  eventId: z.uuid().optional(),
  vendorId: z.uuid().optional(),
});
export type PayoutListQuery = z.input<typeof payoutListQuery>;
