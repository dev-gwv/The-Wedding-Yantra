import { z } from "zod";
import { phone } from "./auth.js";
import { optionalText } from "./common.js";

// ---------------------------------------------------------------------------
// Venues: where events happen. An event finds its venue by the venue's name.
// ---------------------------------------------------------------------------

export interface VenueSummary {
  id: string;
  name: string;
  /** A key from the business's "venue_type" list */
  venueType: string | null;
  /** The type's name */
  venueTypeLabel: string | null;
  address: string | null;
  city: string | null;
  /** A Google Maps link, as pasted */
  mapsUrl: string | null;
  contactPerson: string | null;
  phone: string | null;
  /** Guests it holds */
  capacity: number | null;
  archived: boolean;
  /** Events still to come there */
  upcoming: number;
}

/** One event held (or to be held) at a venue. */
export interface VenueEvent {
  eventId: string;
  title: string;
  status: "confirmed" | "completed" | "cancelled";
  clientName: string | null;
  /** YYYY-MM-DD: its first function there */
  date: string | null;
  /** The functions held there */
  functions: string[];
}

export interface Venue extends VenueSummary {
  /** HH:MM, 24-hour: when the music must stop */
  musicCutoff: string | null;
  /** Whether outside caterers are allowed; null when not known */
  outsideCatering: boolean | null;
  /** When and how setup can start: gate, lift, parking */
  loadIn: string | null;
  notes: string | null;
  events: VenueEvent[];
}

/** What the crew need about an event's venue. */
export interface VenueBrief {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  mapsUrl: string | null;
  contactPerson: string | null;
  phone: string | null;
  musicCutoff: string | null;
  loadIn: string | null;
}

const blankToNull = <T>(v: T | "" | null | undefined) => (v === undefined ? undefined : v === "" ? null : v);

const venueFields = {
  venueType: z.string().trim().max(40).nullable().optional().transform(blankToNull),
  address: optionalText(300),
  city: optionalText(60),
  mapsUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Paste the link from Google Maps (it starts with https://)")
    .nullable()
    .optional()
    .transform(blankToNull),
  contactPerson: optionalText(80),
  phone: z.union([z.literal(""), phone]).nullable().optional().transform(blankToNull),
  capacity: z.number("Enter a number").int("Enter a whole number").min(1, "Enter how many guests").max(100_000, "That's too many").nullable().optional(),
  musicCutoff: z
    .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:00")])
    .nullable()
    .optional()
    .transform(blankToNull),
  outsideCatering: z.boolean().nullable().optional(),
  loadIn: optionalText(200),
  notes: optionalText(1000),
};

export const venueInput = z.object({
  name: z.string().trim().min(2, "Enter the venue's name").max(120),
  ...venueFields,
});
export type VenueInput = z.input<typeof venueInput>;

export const updateVenueInput = z.object({
  name: z.string().trim().min(2, "Enter the venue's name").max(120).optional(),
  ...venueFields,
  archived: z.boolean().optional(),
});
export type UpdateVenueInput = z.input<typeof updateVenueInput>;

/** A Maps link for a venue: the one saved, else a search for its name and address. */
export function venueMapsLink(v: { name: string; address?: string | null; city?: string | null; mapsUrl?: string | null }): string {
  if (v.mapsUrl) return v.mapsUrl;
  const q = [v.name, v.address, v.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
