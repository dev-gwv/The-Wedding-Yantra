import { z } from "zod";
import { optionalText } from "./common.js";
import { UPI_ID_PATTERN } from "./workspaces.js";

// ---------------------------------------------------------------------------
// Saved notes and terms: written once, picked on an invoice in a tap.
// ---------------------------------------------------------------------------

export const SAVED_TEXT_KINDS = ["note", "terms"] as const;
export type SavedTextKind = (typeof SAVED_TEXT_KINDS)[number];
export const SAVED_TEXT_LABELS: Record<SavedTextKind, { title: string; one: string; about: string }> = {
  note: { title: "Notes", one: "note", about: "A line for the client: thank you, what's included, what to bring." },
  terms: { title: "Terms", one: "terms", about: "Advance, cancellation and payment rules printed at the bottom." },
};

export interface SavedText {
  id: string;
  kind: SavedTextKind;
  title: string;
  body: string;
  /** Filled in on every new invoice */
  isDefault: boolean;
  position: number;
}

const savedTextFields = {
  kind: z.enum(SAVED_TEXT_KINDS),
  title: z.string().trim().min(1, "Give it a short name").max(60),
  body: z.string().trim().min(1, "Write the text").max(4000),
  isDefault: z.boolean().optional(),
};
export const savedTextInput = z.object(savedTextFields);
export type SavedTextInput = z.input<typeof savedTextInput>;
export const updateSavedTextInput = z.object(savedTextFields).omit({ kind: true }).partial();
export type UpdateSavedTextInput = z.input<typeof updateSavedTextInput>;

// ---------------------------------------------------------------------------
// Bank accounts printed on invoices
// ---------------------------------------------------------------------------

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** What an invoice prints under "Pay to". A copy is kept on each invoice. */
export interface BankDetails {
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  branch: string | null;
  upiId: string | null;
}

export interface BankAccount extends BankDetails {
  id: string;
  /** How the business knows it: "HDFC current", "Personal UPI" */
  label: string;
  isDefault: boolean;
  archived: boolean;
}

const optional = (max: number) => optionalText(max);
const bankFields = {
  label: z.string().trim().min(1, "Name this account").max(60),
  accountName: optional(100),
  accountNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => v === "" || /^\d{6,20}$/.test(v), "Account numbers have 6 to 20 digits")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || IFSC_PATTERN.test(v), "IFSC looks like HDFC0001234")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  bankName: optional(80),
  branch: optional(80),
  upiId: z
    .string()
    .trim()
    .refine((v) => v === "" || UPI_ID_PATTERN.test(v), "A UPI ID looks like name@bank")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  isDefault: z.boolean().optional(),
};

export const bankAccountInput = z.object(bankFields).superRefine((v, ctx) => {
  if (!v.accountNumber && !v.upiId) ctx.addIssue({ code: "custom", path: ["accountNumber"], message: "Add an account number or a UPI ID" });
  if (v.accountNumber && !v.ifsc) ctx.addIssue({ code: "custom", path: ["ifsc"], message: "Add the IFSC for this account" });
});
export type BankAccountInput = z.input<typeof bankAccountInput>;
/** Only the fields sent are changed; the whole account is checked again after. */
export const updateBankAccountInput = z.object({ ...bankFields, archived: z.boolean() }).partial();
export type UpdateBankAccountInput = z.input<typeof updateBankAccountInput>;

export * from "./invoice-look.js";
