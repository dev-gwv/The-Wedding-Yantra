import { z } from "zod";
import { personName, phone } from "./auth.js";
import { SERVICE_UNITS, type ServiceUnit } from "./business-types.js";
import { optionalText } from "./common.js";
import { EVENT_TYPES, type EventType } from "./sales.js";

// ---------------------------------------------------------------------------
// Service catalogue (price list)
// ---------------------------------------------------------------------------

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  price: number;
  /** GST percent */
  taxRate: number;
  active: boolean;
}

const money = z.coerce.number().min(0, "Can't be negative").max(1_000_000_000);
const gst = z.coerce
  .number()
  .refine((n) => (GST_RATES as readonly number[]).includes(n), "Pick a GST rate");

export const catalogueItemInput = z.object({
  name: z.string().trim().min(2, "Name the service").max(100),
  description: optionalText(300),
  unit: z.enum(SERVICE_UNITS),
  price: money,
  taxRate: gst.default(0),
});
export type CatalogueItemInput = z.input<typeof catalogueItemInput>;
export const updateCatalogueItemInput = catalogueItemInput.partial().extend({ active: z.boolean().optional() });
export type UpdateCatalogueItemInput = z.input<typeof updateCatalogueItemInput>;

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export interface QuoteItem {
  id: string;
  catalogueItemId: string | null;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  quantity: number;
  rate: number;
  taxRate: number;
  amount: number;
}

export interface QuoteTotalsView {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export interface QuoteSummary extends QuoteTotalsView {
  id: string;
  /** Q-0007 */
  number: string;
  title: string;
  status: QuoteStatus;
  /** Who it is for: the lead's or client's name */
  customerName: string;
  leadId: string | null;
  clientId: string | null;
  issueDate: string;
  validUntil: string | null;
  /** True when it was sent and the validity date has passed without an answer */
  expired: boolean;
  createdAt: string;
}

export interface Quote extends QuoteSummary {
  customerPhone: string | null;
  items: QuoteItem[];
  notes: string | null;
  terms: string | null;
  /** Share this: /q/<token>. Anyone with it can see and accept the quote. */
  shareToken: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  eventId: string | null;
}

export const quoteItemInput = z.object({
  catalogueItemId: z.uuid().nullable().optional(),
  name: z.string().trim().min(1, "Name this line").max(100),
  description: optionalText(300),
  unit: z.enum(SERVICE_UNITS),
  quantity: z.coerce.number().positive("More than zero").max(100_000),
  rate: money,
  taxRate: gst.default(0),
});
export type QuoteItemInput = z.input<typeof quoteItemInput>;

const optionalDate = z
  .union([z.literal(""), z.iso.date("Pick a valid date")])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const quoteInput = z
  .object({
    leadId: z.uuid().nullable().optional(),
    clientId: z.uuid().nullable().optional(),
    title: z.string().trim().min(2, "Give the quote a title").max(120),
    items: z.array(quoteItemInput).min(1, "Add at least one service").max(60),
    discount: money.default(0),
    validUntil: optionalDate,
    notes: optionalText(2000),
    terms: optionalText(4000),
  })
  .refine((q) => !!q.leadId || !!q.clientId, { message: "Choose who the quote is for", path: ["leadId"] });
export type QuoteInput = z.input<typeof quoteInput>;

export const updateQuoteInput = z.object({
  title: z.string().trim().min(2, "Give the quote a title").max(120).optional(),
  items: z.array(quoteItemInput).min(1, "Add at least one service").max(60).optional(),
  discount: money.optional(),
  validUntil: optionalDate,
  notes: optionalText(2000),
  terms: optionalText(4000),
});
export type UpdateQuoteInput = z.input<typeof updateQuoteInput>;

export const acceptQuoteInput = z.object({
  name: personName,
});
export const declineQuoteInput = z.object({
  reason: optionalText(500),
});

/** What the client sees at /q/<token>. */
export interface PublicQuote {
  business: {
    name: string;
    typeName: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    gstin: string | null;
  };
  quote: Omit<Quote, "shareToken" | "leadId" | "clientId" | "eventId" | "customerPhone">;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const EVENT_STATUSES = ["confirmed", "completed", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  confirmed: "Confirmed",
  completed: "Done",
  cancelled: "Cancelled",
};

export interface EventFunction {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  notes: string | null;
}

export interface EventSummary {
  id: string;
  title: string;
  eventType: EventType | null;
  status: EventStatus;
  clientId: string | null;
  clientName: string | null;
  /** Booking value. Null when not set, or when the viewer's role doesn't include money. */
  value: number | null;
  city: string | null;
  /** First and last function dates */
  startDate: string | null;
  endDate: string | null;
  functionCount: number;
}

/** Another event on the same day as one of this event's functions. */
export interface EventClash {
  date: string;
  eventId: string;
  eventTitle: string;
  functionName: string;
}

export interface WeddingEvent extends EventSummary {
  venue: string | null;
  notes: string | null;
  /** The enquiry it came from, when the viewer can open that lead */
  leadId: string | null;
  /** The accepted quote, when the viewer's role includes quotes */
  quoteId: string | null;
  quoteNumber: string | null;
  clientPhone: string | null;
  functions: EventFunction[];
  clashes: EventClash[];
  createdAt: string;
}

const time = z
  .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:30")])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

export const eventFunctionInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Name the function").max(60),
  date: z.iso.date("Pick a date"),
  startTime: time,
  endTime: time,
  venue: optionalText(120),
  notes: optionalText(500),
});
export type EventFunctionInput = z.input<typeof eventFunctionInput>;

export const eventInput = z
  .object({
    clientId: z.uuid().nullable().optional(),
    /** Create a new client on the fly when there isn't one yet */
    newClient: z.object({ name: personName, phone: z.union([z.literal(""), phone]).optional() }).optional(),
    leadId: z.uuid().nullable().optional(),
    title: z.string().trim().min(2, "Give the event a name").max(120),
    eventType: z.enum(EVENT_TYPES).nullable().optional(),
    value: z
      .union([z.literal(""), money])
      .nullable()
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    city: optionalText(60),
    venue: optionalText(120),
    notes: optionalText(2000),
    functions: z.array(eventFunctionInput).min(1, "Add at least one function with a date").max(20),
  })
  .refine((e) => !!e.clientId || !!e.newClient, { message: "Choose the client", path: ["clientId"] });
export type EventInput = z.input<typeof eventInput>;

export const updateEventInput = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  eventType: z.enum(EVENT_TYPES).nullable().optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  value: z
    .union([z.literal(""), money])
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  city: optionalText(60),
  venue: optionalText(120),
  notes: optionalText(2000),
  functions: z.array(eventFunctionInput).min(1, "Keep at least one function").max(20).optional(),
});
export type UpdateEventInput = z.input<typeof updateEventInput>;

export const eventListQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  clientId: z.uuid().optional(),
});
export type EventListQuery = z.input<typeof eventListQuery>;

/** One function on the calendar. */
export interface CalendarEntry {
  date: string;
  eventId: string;
  eventTitle: string;
  eventStatus: EventStatus;
  functionName: string;
  startTime: string | null;
  venue: string | null;
}

export const clashQuery = z.object({
  dates: z
    .string()
    .transform((s) => s.split(",").filter(Boolean))
    .pipe(z.array(z.iso.date()).min(1).max(20)),
  excludeEventId: z.uuid().optional(),
});

export type { ServiceUnit, EventType };
