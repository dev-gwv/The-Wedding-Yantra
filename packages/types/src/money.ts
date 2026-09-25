import { PAYMENT_METHODS, STATE_CODES, type BillTaxRow, type PaymentMethod } from "@wedding-yantra/core";
import { z } from "zod";
import { personName, phone } from "./auth.js";
import { SERVICE_UNITS, type ServiceUnit } from "./business-types.js";
import { gstRateInput, moneyInput, optionalDateInput } from "./bookings.js";
import { optionalText } from "./common.js";
import type { PersonRef } from "./sales.js";
import { GSTIN_PATTERN } from "./workspaces.js";

// ---------------------------------------------------------------------------
// Bills (GST tax invoices)
// ---------------------------------------------------------------------------

export const BILL_STATUSES = ["issued", "cancelled"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

/** Worked out from the payments against a bill. */
export const PAY_STATES = ["unpaid", "part_paid", "paid"] as const;
export type PayState = (typeof PAY_STATES)[number];
export const PAY_STATE_LABELS: Record<PayState, string> = { unpaid: "Unpaid", part_paid: "Part paid", paid: "Paid" };

export interface BillItem {
  id: string;
  catalogueItemId: string | null;
  name: string;
  description: string | null;
  /** HSN/SAC code for the service */
  sac: string | null;
  unit: ServiceUnit;
  quantity: number;
  rate: number;
  taxRate: number;
  /** Quantity × rate */
  amount: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface BillSummary {
  id: string;
  /** INV/26-27/0001 */
  number: string;
  status: BillStatus;
  payState: PayState;
  /** Money still due and the due date has passed */
  overdue: boolean;
  clientId: string | null;
  clientName: string;
  eventId: string | null;
  eventTitle: string | null;
  issueDate: string;
  dueDate: string | null;
  total: number;
  received: number;
  due: number;
  /** Share this: /b/<token>. Anyone with it can see the bill and pay. */
  shareToken: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  /** R-0001 */
  number: string;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  billId: string | null;
  billNumber: string | null;
  eventId: string | null;
  clientId: string | null;
  clientName: string | null;
  recordedBy: PersonRef | null;
  createdAt: string;
}

export interface Bill extends BillSummary {
  billTo: { name: string; phone: string | null; address: string | null; gstin: string | null };
  /** The business's GST number when the bill was made. Null means no GST was charged. */
  sellerGstin: string | null;
  chargesGst: boolean;
  /** GST state code of the place of supply */
  placeOfSupply: string | null;
  /** IGST instead of CGST + SGST */
  interState: boolean;
  items: BillItem[];
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  roundOff: number;
  byRate: BillTaxRow[];
  notes: string | null;
  terms: string | null;
  quoteId: string | null;
  payments: Payment[];
  cancelledAt: string | null;
  cancelReason: string | null;
}

const sacCode = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4,8}$/.test(v), "SAC codes have 4 to 8 digits")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || GSTIN_PATTERN.test(v), "GST number should look like 27ABCDE1234F1Z5")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const billItemInput = z.object({
  catalogueItemId: z.uuid().nullable().optional(),
  name: z.string().trim().min(1, "Name this line").max(100),
  description: optionalText(300),
  sac: sacCode,
  unit: z.enum(SERVICE_UNITS),
  quantity: z.coerce.number().positive("More than zero").max(100_000),
  rate: moneyInput,
  taxRate: gstRateInput.default(0),
});
export type BillItemInput = z.input<typeof billItemInput>;

export const billToInput = z.object({
  name: personName,
  phone: z
    .union([z.literal(""), phone])
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  address: optionalText(300),
  gstin,
});

const billFields = {
  billTo: billToInput,
  /** GST state code. Leave empty for the business's own state. */
  placeOfSupply: z.enum(STATE_CODES).nullable().optional(),
  issueDate: z.iso.date("Pick the bill date"),
  dueDate: optionalDateInput,
  items: z.array(billItemInput).min(1, "Add at least one service").max(60),
  discount: moneyInput,
  notes: optionalText(2000),
  terms: optionalText(4000),
};

export const billInput = z
  .object({
    eventId: z.uuid().nullable().optional(),
    clientId: z.uuid().nullable().optional(),
    /** The accepted quote this bill was made from */
    quoteId: z.uuid().nullable().optional(),
    ...billFields,
    discount: moneyInput.default(0),
  })
  .refine((b) => !!b.eventId || !!b.clientId, { message: "Choose who the bill is for", path: ["clientId"] });
export type BillInput = z.input<typeof billInput>;

/** Only the fields sent are changed. No defaults here, so a missing field never resets one. */
export const updateBillInput = z.object(billFields).partial();
export type UpdateBillInput = z.input<typeof updateBillInput>;

export const cancelBillInput = z.object({ reason: optionalText(300) });

export const billListQuery = z.object({
  clientId: z.uuid().optional(),
  eventId: z.uuid().optional(),
  status: z.enum(["open", "paid", "cancelled"]).optional(),
});

/** What the client sees at /b/<token>. */
export interface PublicBill {
  business: {
    name: string;
    typeName: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    /** Clients pay the balance to this UPI ID */
    upiId: string | null;
  };
  bill: Omit<Bill, "shareToken" | "clientId" | "eventId" | "quoteId" | "payments"> & {
    payments: Pick<Payment, "number" | "amount" | "paidOn" | "method">[];
  };
}

// ---------------------------------------------------------------------------
// Payments (money received)
// ---------------------------------------------------------------------------

const paymentFields = {
  amount: z.coerce.number().positive("Enter the amount received").max(1_000_000_000),
  paidOn: z.iso.date("Pick the date"),
  method: z.enum(PAYMENT_METHODS),
  reference: optionalText(60),
  note: optionalText(300),
};

export const paymentInput = z
  .object({
    billId: z.uuid().nullable().optional(),
    eventId: z.uuid().nullable().optional(),
    clientId: z.uuid().nullable().optional(),
    ...paymentFields,
  })
  .refine((p) => !!p.billId || !!p.eventId || !!p.clientId, { message: "Choose what the money is for", path: ["billId"] });
export type PaymentInput = z.input<typeof paymentInput>;

export const updatePaymentInput = z.object(paymentFields).partial();
export type UpdatePaymentInput = z.input<typeof updatePaymentInput>;

export const paymentListQuery = z.object({
  billId: z.uuid().optional(),
  eventId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-11")
    .optional(),
});

// ---------------------------------------------------------------------------
// Dues: money still to collect
// ---------------------------------------------------------------------------

export interface DueItem {
  /** A bill with a balance, or a booking that has no bill yet */
  kind: "bill" | "event";
  billId: string | null;
  billNumber: string | null;
  eventId: string | null;
  eventTitle: string | null;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  total: number;
  received: number;
  due: number;
  dueDate: string | null;
  overdue: boolean;
  /** For the bill link in reminders */
  shareToken: string | null;
}

export interface MoneyOverview {
  toCollect: number;
  overdue: number;
  receivedThisMonth: number;
  billedThisMonth: number;
  dues: DueItem[];
}

/** The money side of one event, for the event page. */
export interface EventMoney {
  bookingValue: number | null;
  /** Total of its bills (not cancelled) */
  billed: number;
  /** What the client should pay in all: the bills, or the booking value before any bill */
  expected: number;
  received: number;
  due: number;
  /** What the business earns, before GST: the bills' taxable value, else the accepted quote's */
  revenue: number;
  /** Approved expenses for this event */
  spent: number;
  /** Expenses still waiting for approval */
  pendingSpend: number;
  /** Revenue minus approved expenses */
  profit: number;
  bills: BillSummary[];
  payments: Payment[];
}

/** Starting values for a new bill, worked out by the server from the event, quote or client. */
export interface BillDraft {
  eventId: string | null;
  clientId: string | null;
  quoteId: string | null;
  billTo: { name: string; phone: string | null; address: string | null; gstin: string | null };
  placeOfSupply: string | null;
  issueDate: string;
  dueDate: string | null;
  items: {
    catalogueItemId: string | null;
    name: string;
    sac: string | null;
    unit: ServiceUnit;
    quantity: number;
    rate: number;
    taxRate: number;
  }[];
  discount: number;
  notes: string | null;
  terms: string | null;
  /** The business has a GST number, so GST can be charged */
  chargesGst: boolean;
  /** The business's own GST state */
  homeState: string | null;
  /** Already received for this event, shown as an advance on the new bill */
  advance: number;
}

export const billDraftQuery = z.object({
  eventId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  quoteId: z.uuid().optional(),
});
