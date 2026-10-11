import type { MetaProblemKind } from "@wedding-yantra/core";
import { z } from "zod";

export type { MetaProblemKind } from "@wedding-yantra/core";

// ---------------------------------------------------------------------------
// Facebook and Instagram lead ads: what a lead's page shows
// ---------------------------------------------------------------------------

export type AdPlatform = "facebook" | "instagram";

/** One question and its answer, word for word, and the enquiry field it filled. */
export interface AdAnswer {
  key: string;
  label: string;
  value: string;
  /** A core `LeadAnswerUse` ("name", "phone", "eventDate"…), or null when it went to the requirements */
  usedFor: string | null;
}

/** One lead form filled on Facebook or Instagram, shown under "From the ad" and "Form answers". */
export interface AdEnquiry {
  id: string;
  /** Null when Meta didn't say */
  platform: AdPlatform | null;
  pageName: string | null;
  formName: string | null;
  /** Null when Meta didn't share it ("Campaign name not shared") */
  campaignName: string | null;
  adsetName: string | null;
  adName: string | null;
  /** Meta's test lead */
  isTest: boolean;
  /** Filled from the Page itself, not from an ad */
  isOrganic: boolean;
  receivedAt: string;
  /** When they filled the form, per Meta */
  submittedAt: string | null;
  answers: AdAnswer[];
  /** Sent again, and added to this open enquiry */
  merged: boolean;
}

// ---------------------------------------------------------------------------
// Who gets the leads that arrive by themselves
// ---------------------------------------------------------------------------

export interface LeadRoutingPerson {
  userId: string;
  name: string | null;
}

export interface LeadRouting {
  /** Everyone with the Leads screen (and new Sales hires); otherwise only `people` */
  everyoneWithLeads: boolean;
  /** The people picked, when not everyone */
  people: LeadRoutingPerson[];
  includeOwner: boolean;
  /** Skip anyone on leave today */
  skipOnLeave: boolean;
  /** Who would get leads now with these settings, and how many open leads each has */
  pool: (LeadRoutingPerson & { openLeads: number; onLeave: boolean })[];
}

export const leadRoutingInput = z.object({
  everyoneWithLeads: z.boolean(),
  people: z.array(z.uuid()).max(30, "Up to 30 people"),
  includeOwner: z.boolean(),
  skipOnLeave: z.boolean(),
});
export type LeadRoutingInput = z.input<typeof leadRoutingInput>;

// ---------------------------------------------------------------------------
// The Facebook connection, its Pages and forms
// ---------------------------------------------------------------------------

/** Something wrong (or about to be) and the exact steps to fix it. Text from core `metaProblem`. */
export interface MetaProblem {
  kind: MetaProblemKind;
  title: string;
  steps: string[];
  /** Meta's own words, when it gave a reason */
  metaSays: string | null;
}

export type MetaPageStatus = "ok" | "off" | "needs_reconnect" | "lead_access" | "not_subscribed" | "permission_missing";
export type MetaConnectionStatus = "ok" | "reconnect_soon" | "needs_reconnect" | "revoked";

export interface MetaFormQuestion {
  key: string;
  label: string;
  /** Meta's question type: FULL_NAME, PHONE, CUSTOM… */
  type: string;
  /** The enquiry field it fills (a core `LeadAnswerUse`), or null for the requirements */
  usedFor: string | null;
}

export interface MetaForm {
  id: string;
  /** Meta's form id */
  formId: string;
  name: string;
  /** Meta's status: ACTIVE, ARCHIVED… */
  status: string | null;
  leadsCount: number;
  lastLeadAt: string | null;
  questions: MetaFormQuestion[];
}

export interface MetaPage {
  id: string;
  /** Meta's Page id */
  pageId: string;
  name: string;
  /** Sending its leads here */
  active: boolean;
  status: MetaPageStatus;
  /** The person who connected can make ads on it (needed to switch it on) */
  canAdvertise: boolean;
  /** They have full control of it (needed to take it over from another business) */
  canManage: boolean;
  /** Another business on Wedding Yantra gets this Page's leads now: switching it on here moves it (`takeOver`) */
  inOtherBusiness: boolean;
  problems: MetaProblem[];
  lastLeadAt: string | null;
  lastWebhookAt: string | null;
  leadsThisWeek: number;
  forms: MetaForm[];
}

export interface MetaConnection {
  id: string;
  fbUserName: string | null;
  status: MetaConnectionStatus;
  connectedByName: string | null;
  connectedAt: string;
  /** Log in to Facebook again before this, or Meta stops sharing leads */
  dataAccessExpiresAt: string | null;
}

export interface MetaStatus {
  /** Whether this business can connect Facebook at all */
  available: boolean;
  /** Not set up on the server, or not switched on for this business yet */
  reason: "not_configured" | "not_enabled" | null;
  /** "fake": a stand-in for Facebook, for trying it out */
  mode: "live" | "fake";
  connections: MetaConnection[];
  pages: MetaPage[];
  /** Problems with the whole connection rather than one Page */
  problems: MetaProblem[];
}

/** What finishing "Continue with Facebook" returns. */
export type MetaCompleteResult = MetaStatus & {
  /** Pages found */
  added: number;
  /** Several Pages: the owner picks which to switch on */
  needsChoice: boolean;
};

/** What "Check again" returns: the Page, and how many missed leads it brought in. */
export type MetaCheckResult = MetaPage & { recovered: number };

/** "Send a test lead": queued, or do it by hand in Meta's testing tool. */
export interface MetaTestLeadResult {
  queued?: boolean;
  manual?: boolean;
  toolUrl?: string;
}

export type IncomingLeadStatus = "queued" | "added" | "merged" | "skipped" | "failed";

/** One row of "Recent leads" on the Facebook screen. */
export interface IncomingLeadItem {
  id: string;
  /** As read from the answers; null until it's been fetched */
  name: string | null;
  /** The Page row it came through (`MetaPage.id`) */
  pageId: string | null;
  pageName: string | null;
  formName: string | null;
  status: IncomingLeadStatus;
  /** token, permission, lead_access, rate_limit, transient… */
  errorKind: string | null;
  receivedVia: "webhook" | "catch_up" | "test";
  isTest: boolean;
  receivedAt: string;
  /** The enquiry it made or was added to */
  leadId: string | null;
}

/** The public page for a Facebook data deletion request. */
export interface MetaDeletionStatus {
  status: "pending" | "done";
  requestedAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const metaConnectInput = z.object({
  /** Logging in again for a connection that's there already */
  reconnect: z.boolean().optional(),
});
export type MetaConnectInput = z.input<typeof metaConnectInput>;

/** What Facebook hands back to /connect/meta. */
export const metaCompleteInput = z.object({
  code: z.string().min(1).max(2000),
  state: z.string().min(1).max(1000),
});
export type MetaCompleteInput = z.input<typeof metaCompleteInput>;

export const updateMetaPageInput = z.object({
  on: z.boolean(),
  /** Move the Page here from the business that has it on now (needs full control of the Page) */
  takeOver: z.boolean().optional(),
});
export type UpdateMetaPageInput = z.input<typeof updateMetaPageInput>;

export const metaTestLeadInput = z.object({
  /** Meta's form id (`MetaForm.formId`) on this Page */
  formId: z.string().trim().min(1, "Pick a form").max(64),
});
export type MetaTestLeadInput = z.input<typeof metaTestLeadInput>;
