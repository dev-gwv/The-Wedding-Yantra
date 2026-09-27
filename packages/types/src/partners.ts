import { z } from "zod";
import { phone } from "./auth.js";
import { optionalText } from "./common.js";
import type { EventType, LeadSummary } from "./sales.js";

// ---------------------------------------------------------------------------
// Partner QR codes: collaborations with other businesses, each with its own code on the
// enquiry form, and a private page where the partner sees the enquiries they sent.
// ---------------------------------------------------------------------------

export interface PartnerSummary {
  id: string;
  name: string;
  /** What they are: boutique, jeweller, venue, influencer… */
  label: string | null;
  vendorId: string | null;
  vendorName: string | null;
  phone: string | null;
  /** In the QR link: /f/<form>?p=<code> */
  code: string;
  /** Their page link is on (they can see their enquiries) */
  sharing: boolean;
  /** Their page shows client numbers in full, not masked */
  showPhone: boolean;
  /** Times the enquiry form was opened through their code */
  scans: number;
  enquiries: number;
  booked: number;
  lastEnquiryAt: string | null;
  archived: boolean;
}

export interface Partner extends PartnerSummary {
  notes: string | null;
  /** For their page: /p/<token>. Null while sharing is stopped. */
  viewToken: string | null;
  leads: LeadSummary[];
}

export const PARTNER_LEAD_STATUSES = ["new", "in_talks", "booked", "not_booked"] as const;
export type PartnerLeadStatus = (typeof PARTNER_LEAD_STATUSES)[number];
export const PARTNER_LEAD_STATUS_LABELS: Record<PartnerLeadStatus, string> = {
  new: "New",
  in_talks: "In talks",
  booked: "Booked",
  not_booked: "Not booked",
};

/** One enquiry, as the partner sees it: no money, and the number masked unless allowed. */
export interface PartnerPageLead {
  name: string;
  /** Masked (98xxxxx123) unless the business shows numbers to this partner */
  phone: string | null;
  enquiredOn: string;
  eventType: EventType | null;
  eventDate: string | null;
  status: PartnerLeadStatus;
}

/** What the partner sees at /p/<token>. */
export interface PartnerPage {
  businessName: string;
  businessTypeIcon: string;
  businessCity: string;
  logoUrl: string | null;
  partnerName: string;
  scans: number;
  enquiries: number;
  booked: number;
  leads: PartnerPageLead[];
}

const blankToNull = <T>(v: T | "" | null | undefined) => (v === undefined ? undefined : v === "" ? null : v);

const partnerFields = {
  label: optionalText(60),
  vendorId: z.uuid().nullable().optional(),
  phone: z.union([z.literal(""), phone]).nullable().optional().transform(blankToNull),
  notes: optionalText(1000),
  showPhone: z.boolean().optional(),
};

export const partnerInput = z.object({
  name: z.string().trim().min(2, "Enter the partner's name").max(80),
  ...partnerFields,
});
export type PartnerInput = z.input<typeof partnerInput>;

export const updatePartnerInput = z.object({
  name: z.string().trim().min(2, "Enter the partner's name").max(80).optional(),
  ...partnerFields,
  archived: z.boolean().optional(),
});
export type UpdatePartnerInput = z.input<typeof updatePartnerInput>;

/** 98xxxxx123: enough for a partner to recognise the client, not enough to call them. */
export function maskedPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 6) return "xxxxxxxx";
  return `${digits.slice(0, 2)}xxxxx${digits.slice(-3)}`;
}
