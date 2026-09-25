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

export const updateWorkspaceInput = z
  .object({
    name: businessName,
    city: z.string().trim().min(2).max(60),
    phone: optionalText(20),
    email: z
      .union([z.literal(""), z.email("Enter a valid email")])
      .nullable()
      .optional()
      .transform((v) => (v ? v.toLowerCase() : null)),
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
  createdAt: z.string(),
  /** The signed-in person's role in this business. */
  role,
});
export type Workspace = z.infer<typeof workspace>;
