import { z } from "zod";
import { ROLES } from "@wedding-yantra/core";
import { optionalText } from "./common.js";

export const role = z.enum(ROLES);

export const workspaceSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  businessTypeId: z.string(),
  businessTypeName: z.string(),
  /** Icon name for the kind of business, e.g. `camera`. */
  businessTypeIcon: z.string(),
  /** The time zone the business's days are counted in, e.g. Asia/Kolkata */
  timezone: z.string(),
  /** API path of the logo, when there is one */
  logoUrl: z.string().nullable(),
  role,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummary>;

export const businessName = z.string().trim().min(2, "Enter your business name").max(80);

export const createWorkspaceInput = z.object({
  name: businessName,
  businessTypeId: z.string().trim().min(1, "Pick what your business does"),
  city: z.string().trim().min(2, "Enter your city").max(60),
});
export type CreateWorkspaceInput = z.input<typeof createWorkspaceInput>;

export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export const updateWorkspaceInput = z
  .object({
    name: businessName,
    city: z.string().trim().min(2).max(60),
    phone: optionalText(20),
    email: z
      .union([z.literal(""), z.email("Enter a valid email")])
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v ? v.toLowerCase() : null)),
    address: optionalText(300),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || GSTIN_PATTERN.test(v), "GST number should look like 27ABCDE1234F1Z5")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    /** Printed at the bottom of every new quote */
    quoteTerms: optionalText(4000),
    /** Clients pay bills to this UPI ID, e.g. riya@okhdfc */
    upiId: z
      .string()
      .trim()
      .refine((v) => v === "" || UPI_ID_PATTERN.test(v), "A UPI ID looks like name@bank")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    /** Where clients leave a review, e.g. the Google Business Profile review link */
    reviewUrl: z
      .string()
      .trim()
      .max(500, "That link is too long")
      .refine((v) => v === "" || /^https:\/\/[^\s/]+\.[^\s]+$/i.test(v), "Paste the whole link, starting with https://")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    /** Starts every bill number: INV/26-27/0001 */
    billPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{1,5}$/, "Use up to 5 letters or numbers"),
    /** Printed at the bottom of every bill: bank details, payment terms */
    billTerms: optionalText(2000),
    /** An uploaded photo (see files), or null to remove the logo */
    logoFileId: z.uuid().nullable(),
    /** The owner checked the starter prices and they're right as they are */
    pricesConfirmed: z.literal(true),
  })
  .partial();
export type UpdateWorkspaceInput = z.input<typeof updateWorkspaceInput>;

export const workspace = z.object({
  id: z.uuid(),
  name: z.string(),
  businessTypeId: z.string(),
  businessTypeName: z.string(),
  businessTypeIcon: z.string(),
  city: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  gstin: z.string().nullable(),
  quoteTerms: z.string().nullable(),
  upiId: z.string().nullable(),
  billPrefix: z.string(),
  billTerms: z.string().nullable(),
  reviewUrl: z.string().nullable(),
  /** API path of the logo, when there is one */
  logoUrl: z.string().nullable(),
  /** The time zone the business's days are counted in, e.g. Asia/Kolkata */
  timezone: z.string(),
  createdAt: z.string(),
  /** The signed-in person's role in this business. */
  role,
});
export type Workspace = z.infer<typeof workspace>;
