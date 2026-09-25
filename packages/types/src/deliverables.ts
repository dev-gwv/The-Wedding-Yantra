import { z } from "zod";
import { optionalText } from "./common.js";
import type { PersonRef } from "./sales.js";

// ---------------------------------------------------------------------------
// Deliverables: what an event owes the client (edited photos, the film, the album,
// reels, hampers, a song mix), when it's due, and the link once it's handed over.
// ---------------------------------------------------------------------------

export const DELIVERABLE_STATUSES = ["pending", "in_progress", "delivered"] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number];
export const DELIVERABLE_STATUS_LABELS: Record<DeliverableStatus, string> = {
  pending: "Not started",
  in_progress: "Working on it",
  delivered: "Delivered",
};

export interface Deliverable {
  id: string;
  eventId: string;
  eventTitle: string;
  clientName: string | null;
  title: string;
  /** YYYY-MM-DD */
  dueDate: string | null;
  status: DeliverableStatus;
  /** Due before today and not delivered */
  late: boolean;
  assignee: PersonRef | null;
  /** Where the client gets it, e.g. a gallery or a Drive folder */
  link: string | null;
  note: string | null;
  deliveredAt: string | null;
  deliveredBy: PersonRef | null;
  /** The viewer can move it along (status, link, note): a manager, its maker, or anyone on the event when it's nobody's */
  canUpdate: boolean;
  createdAt: string;
}

const date = z
  .union([z.literal(""), z.iso.date("Pick a valid date")])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const link = z
  .string()
  .trim()
  .max(1000, "That link is too long")
  .refine((v) => v === "" || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v), "Paste the whole link, starting with https://")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const fields = {
  title: z.string().trim().min(2, "Say what you'll deliver").max(120),
  dueDate: date,
  /** Who's making it */
  assigneeId: z.uuid().nullable().optional(),
  link,
  note: optionalText(1000),
};

export const deliverableInput = z.object({ eventId: z.uuid("Choose the event"), ...fields });
export type DeliverableInput = z.input<typeof deliverableInput>;

export const updateDeliverableInput = z.object({ ...fields, status: z.enum(DELIVERABLE_STATUSES) }).partial();
export type UpdateDeliverableInput = z.input<typeof updateDeliverableInput>;

export const deliverableListQuery = z.object({
  eventId: z.uuid().optional(),
  /** open: not delivered yet; delivered: handed over, newest first */
  status: z.enum(["open", "delivered"]).optional(),
  /** Only the ones given to me */
  mine: z.enum(["true", "false"]).optional(),
});
export type DeliverableListQuery = z.input<typeof deliverableListQuery>;
