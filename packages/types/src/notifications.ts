import { NOTIFICATION_GROUP_KEYS, type NotificationGroup, type NotificationKind } from "@wedding-yantra/core";
import { z } from "zod";
import type { PersonRef } from "./sales.js";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** A path in the app to open */
  link: string | null;
  read: boolean;
  actor: PersonRef | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
  /** Pass as `before` for older ones; null when there are no more */
  nextBefore: string | null;
}

export const notificationListQuery = z.object({
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const markReadInput = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);

export interface NotificationPrefs {
  off: NotificationGroup[];
  push: boolean;
  /** "HH:MM", or null for no quiet hours */
  quietFrom: string | null;
  quietTo: string | null;
  /** Phones and browsers this person gets push on */
  devices: number;
}

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:00");

export const notificationPrefsInput = z
  .object({
    off: z.array(z.enum(NOTIFICATION_GROUP_KEYS as [NotificationGroup, ...NotificationGroup[]])).max(20),
    push: z.boolean(),
    quietFrom: clock.nullable(),
    quietTo: clock.nullable(),
  })
  .refine((v) => (v.quietFrom === null) === (v.quietTo === null), { message: "Set both times, or neither", path: ["quietTo"] });

export const pushSubscriptionInput = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const pushUnsubscribeInput = z.object({ endpoint: z.url().max(1000) });
