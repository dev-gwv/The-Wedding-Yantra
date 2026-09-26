import { BROADCAST_AUDIENCES, type BroadcastAudience } from "@wedding-yantra/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Messages to clients: festival wishes, anniversary wishes and offers
// ---------------------------------------------------------------------------

export interface BroadcastCounts {
  total: number;
  sent: number;
  skipped: number;
}

export interface Broadcast {
  id: string;
  title: string;
  message: string;
  audience: BroadcastAudience;
  counts: BroadcastCounts;
  createdBy: { id: string; name: string | null } | null;
  createdAt: string;
}

export interface BroadcastRecipient {
  id: string;
  name: string;
  phone: string;
  /** The client's page in the app, when they are a client */
  clientId: string | null;
  leadId: string | null;
  sentAt: string | null;
  skippedAt: string | null;
}

export interface BroadcastDetail extends Broadcast {
  recipients: BroadcastRecipient[];
}

/** Who a message would go to, before making it. */
export interface BroadcastAudiencePreview {
  audience: BroadcastAudience;
  count: number;
  /** A few first names, to show who's in it */
  names: string[];
}

export const broadcastInput = z.object({
  title: z.string().trim().min(2, "Give it a short name").max(60, "Keep it short"),
  message: z.string().trim().min(10, "Write the message").max(1000, "Keep it under 1000 characters"),
  audience: z.enum(BROADCAST_AUDIENCES, "Choose who it goes to"),
});
export type BroadcastInput = z.input<typeof broadcastInput>;

export const broadcastRecipientInput = z.object({
  status: z.enum(["sent", "skipped", "pending"]),
  /** Also leave this client out of every future message */
  noMoreMessages: z.boolean().optional(),
});
export type BroadcastRecipientInput = z.input<typeof broadcastRecipientInput>;
