import { z } from "zod";
import { optionalText } from "./common.js";
import { personName, phone } from "./auth.js";

// ---------------------------------------------------------------------------
// Fixed lists
// ---------------------------------------------------------------------------

export const LEAD_SOURCES = [
  "instagram",
  "whatsapp",
  "referral",
  "enquiry_form",
  "walk_in",
  "phone_call",
  "wedding_portal",
  "website",
  "ads",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  referral: "Referral",
  enquiry_form: "Enquiry form",
  walk_in: "Walk-in",
  phone_call: "Phone call",
  wedding_portal: "Wedding portal",
  website: "Website",
  ads: "Ads",
  other: "Other",
};

export const EVENT_TYPES = [
  "wedding",
  "engagement",
  "pre_wedding",
  "haldi",
  "mehendi",
  "sangeet",
  "reception",
  "birthday",
  "anniversary",
  "baby_shower",
  "corporate",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_LABELS: Record<EventType, string> = {
  wedding: "Wedding",
  engagement: "Engagement / Roka",
  pre_wedding: "Pre-wedding",
  haldi: "Haldi",
  mehendi: "Mehendi",
  sangeet: "Sangeet",
  reception: "Reception",
  birthday: "Birthday",
  anniversary: "Anniversary",
  baby_shower: "Baby shower",
  corporate: "Corporate event",
  other: "Other",
};

export const LOST_REASONS = ["price", "date_unavailable", "chose_another", "no_response", "plans_changed", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_LABELS: Record<LostReason, string> = {
  price: "Price too high",
  date_unavailable: "We weren't free that date",
  chose_another: "Chose another vendor",
  no_response: "Stopped replying",
  plans_changed: "Event cancelled or changed",
  other: "Other reason",
};

export const STAGE_KINDS = ["open", "won", "lost"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

/** Where a follow-up stands today, worked out by the server in the business's time zone. */
export type FollowUpState = "overdue" | "today" | "upcoming" | "none";

export const ACTIVITY_KINDS = ["created", "note", "call", "whatsapp", "stage_changed", "follow_up_set", "assigned"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// ---------------------------------------------------------------------------
// Shapes the API returns
// ---------------------------------------------------------------------------

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  kind: StageKind;
  /** Leads in this stage that you can see */
  leadCount: number;
  /** Sum of their budgets, in rupees */
  value: number;
}

export interface PersonRef {
  id: string;
  name: string | null;
}

export interface LeadSummary {
  id: string;
  name: string;
  phone: string | null;
  eventType: EventType | null;
  /** YYYY-MM-DD */
  eventDate: string | null;
  city: string | null;
  budget: number | null;
  source: LeadSource;
  stageId: string;
  stageName: string;
  stageKind: StageKind;
  assignedTo: PersonRef | null;
  nextFollowUpAt: string | null;
  followUpState: FollowUpState;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivity {
  id: string;
  kind: ActivityKind;
  body: string | null;
  meta: Record<string, unknown>;
  actor: PersonRef | null;
  createdAt: string;
}

export interface Lead extends LeadSummary {
  email: string | null;
  venue: string | null;
  guestCount: number | null;
  referredBy: string | null;
  requirements: string | null;
  lostReason: LostReason | null;
  createdBy: PersonRef | null;
  activities: LeadActivity[];
}

export interface LeadList {
  stages: PipelineStage[];
  leads: LeadSummary[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

const optionalPhone = z
  .union([z.literal(""), phone])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const optionalEmail = z
  .union([z.literal(""), z.email("Enter a valid email")])
  .nullable()
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null));

const optionalDate = z
  .union([z.literal(""), z.iso.date("Pick a valid date")])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const optionalAmount = z
  .union([z.literal(""), z.coerce.number().min(0, "Can't be negative").max(1_000_000_000)])
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const optionalCount = z
  .union([z.literal(""), z.coerce.number().int("Whole number only").min(0).max(100_000)])
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const leadFields = {
  name: personName,
  phone: optionalPhone,
  email: optionalEmail,
  eventType: z.enum(EVENT_TYPES).nullable().optional(),
  eventDate: optionalDate,
  city: optionalText(60),
  venue: optionalText(120),
  guestCount: optionalCount,
  budget: optionalAmount,
  source: z.enum(LEAD_SOURCES).optional(),
  referredBy: optionalText(120),
  requirements: optionalText(2000),
  stageId: z.uuid().optional(),
  assignedToUserId: z.uuid().nullable().optional(),
  nextFollowUpAt: z.iso.datetime({ offset: true }).nullable().optional(),
};

export const createLeadInput = z.object(leadFields);
export type CreateLeadInput = z.input<typeof createLeadInput>;

export const updateLeadInput = z
  .object({ ...leadFields, lostReason: z.enum(LOST_REASONS).nullable().optional() })
  .partial();
export type UpdateLeadInput = z.input<typeof updateLeadInput>;

export const addActivityInput = z.object({
  kind: z.enum(["note", "call", "whatsapp"]),
  body: z.string().trim().max(2000).optional(),
});
export type AddActivityInput = z.input<typeof addActivityInput>;

export const leadListQuery = z.object({
  stageId: z.uuid().optional(),
  q: z.string().trim().max(80).optional(),
  followUp: z.enum(["due", "overdue", "today", "upcoming"]).optional(),
  mine: z.enum(["true", "false"]).optional(),
});
export type LeadListQuery = z.input<typeof leadListQuery>;

// ---------------------------------------------------------------------------
// Sales stages
// ---------------------------------------------------------------------------

export const saveStagesInput = z.object({
  stages: z
    .array(
      z.object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1, "Give the stage a name").max(40),
        kind: z.enum(STAGE_KINDS),
      }),
    )
    .min(2, "Keep at least two stages")
    .max(12, "Twelve stages at most")
    .refine((s) => s.some((x) => x.kind === "open"), "Keep at least one open stage")
    .refine((s) => s.filter((x) => x.kind === "won").length === 1, "Keep exactly one Booked (won) stage")
    .refine((s) => s.filter((x) => x.kind === "lost").length === 1, "Keep exactly one Lost stage"),
});
export type SaveStagesInput = z.input<typeof saveStagesInput>;

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export interface ClientSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  leadCount: number;
  createdAt: string;
}

export interface Client extends ClientSummary {
  notes: string | null;
  leads: LeadSummary[];
}

export const clientInput = z.object({
  name: personName,
  phone: optionalPhone,
  email: optionalEmail,
  city: optionalText(60),
  notes: optionalText(2000),
});
export type ClientInput = z.input<typeof clientInput>;
export const updateClientInput = clientInput.partial();
export type UpdateClientInput = z.input<typeof updateClientInput>;

// ---------------------------------------------------------------------------
// WhatsApp quick replies
// ---------------------------------------------------------------------------

export interface WhatsAppTemplate {
  id: string;
  title: string;
  body: string;
  position: number;
}

export const templateInput = z.object({
  title: z.string().trim().min(2, "Give it a short title").max(60),
  body: z.string().trim().min(5, "Write the message").max(1000),
});
export type TemplateInput = z.input<typeof templateInput>;

// ---------------------------------------------------------------------------
// Public enquiry form
// ---------------------------------------------------------------------------

export interface LeadFormSettings {
  slug: string;
  enabled: boolean;
}

export const updateLeadFormInput = z.object({ enabled: z.boolean() });

export interface PublicLeadForm {
  businessName: string;
  businessTypeName: string;
  businessTypeIcon: string;
  city: string;
}

export const submitLeadFormInput = z.object({
  name: personName,
  phone,
  eventType: z.enum(EVENT_TYPES).nullable().optional(),
  eventDate: optionalDate,
  city: optionalText(60),
  message: optionalText(1000),
  /** Hidden from people; bots fill it in. */
  website: z.string().max(200).optional(),
});
export type SubmitLeadFormInput = z.input<typeof submitLeadFormInput>;
