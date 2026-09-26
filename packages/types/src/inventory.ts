import { z } from "zod";
import { optionalText } from "./common.js";

// ---------------------------------------------------------------------------
// Inventory: what the business owns (chairs, lights, speakers, glassware), what each
// event needs on which days, and what's out right now.
// ---------------------------------------------------------------------------

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  /** How many the business owns */
  quantity: number;
  notes: string | null;
  /** Loaded for an event and not back yet */
  outNow: number;
  /** Free across the asked-for days, when the list was asked for dates */
  available: number | null;
}

export const INVENTORY_BOOKING_STATUSES = ["booked", "out", "returned"] as const;
export type InventoryBookingStatus = (typeof INVENTORY_BOOKING_STATUSES)[number];
export const INVENTORY_BOOKING_STATUS_LABELS: Record<InventoryBookingStatus, string> = {
  booked: "Set aside",
  out: "Out",
  returned: "Back",
};

export interface InventoryBooking {
  id: string;
  itemId: string;
  itemName: string;
  itemCategory: string | null;
  eventId: string;
  eventTitle: string;
  quantity: number;
  /** YYYY-MM-DD */
  fromDate: string;
  toDate: string;
  status: InventoryBookingStatus;
  /** How many didn't come back */
  missing: number;
  /** How many more than you own are needed on the busiest of these days (0: enough) */
  short: number;
}

const count = (min: number, message: string) => z.coerce.number().int("Whole number only").min(min, message).max(1_000_000);
const date = z.iso.date("Pick a valid date");

export const inventoryItemInput = z.object({
  name: z.string().trim().min(2, "Name the item").max(80),
  category: optionalText(40),
  quantity: count(0, "Can't be below zero"),
  notes: optionalText(500),
});
export type InventoryItemInput = z.input<typeof inventoryItemInput>;
export const updateInventoryItemInput = inventoryItemInput.partial();
export type UpdateInventoryItemInput = z.input<typeof updateInventoryItemInput>;

export const inventoryListQuery = z.object({
  /** With both: how many are free across these days */
  from: date.optional(),
  to: date.optional(),
});
export type InventoryListQuery = z.input<typeof inventoryListQuery>;

export const inventoryBookingInput = z.object({
  itemId: z.uuid("Choose an item"),
  eventId: z.uuid("Choose the event"),
  quantity: count(1, "At least one"),
  /** Default: the event's first and last day */
  fromDate: date.optional(),
  toDate: date.optional(),
});
export type InventoryBookingInput = z.input<typeof inventoryBookingInput>;

export const updateInventoryBookingInput = z.object({
  quantity: count(1, "At least one").optional(),
  fromDate: date.optional(),
  toDate: date.optional(),
  status: z.enum(INVENTORY_BOOKING_STATUSES).optional(),
  /** On return: how many didn't come back */
  missing: count(0, "Can't be below zero").optional(),
});
export type UpdateInventoryBookingInput = z.input<typeof updateInventoryBookingInput>;

export const inventoryBookingListQuery = z.object({
  eventId: z.uuid().optional(),
  itemId: z.uuid().optional(),
});
export type InventoryBookingListQuery = z.input<typeof inventoryBookingListQuery>;
