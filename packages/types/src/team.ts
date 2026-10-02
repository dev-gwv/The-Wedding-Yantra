import { z } from "zod";
import { phone, personName } from "./auth.js";
import { optionalText } from "./common.js";
import { IFSC_PATTERN } from "./invoicing.js";
import { role, UPI_ID_PATTERN } from "./workspaces.js";

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "freelance"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  freelance: "Freelance",
};

export const PAY_TYPES = ["monthly", "daily"] as const;
export type PayType = (typeof PAY_TYPES)[number];
export const PAY_TYPE_LABELS: Record<PayType, string> = { monthly: "Monthly salary", daily: "Per day" };

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export interface Member {
  id: string;
  userId: string;
  name: string | null;
  phone: string;
  role: z.infer<typeof role>;
  joinedAt: string;
  isYou: boolean;
  /** A key from the business's "designation" list */
  designation: string | null;
  /** The designation's name */
  designationLabel: string | null;
  /** A key from the business's "department" list: how the team is organised, not what they can see */
  department: string | null;
  /** The department's name */
  departmentLabel: string | null;
  employmentType: EmploymentType | null;
}

/** Someone who has left the team. Their details stay on record. */
export interface FormerMember {
  id: string;
  userId: string;
  name: string | null;
  phone: string;
  role: z.infer<typeof role>;
  designationLabel: string | null;
  leftAt: string;
}

export interface EmployeePay {
  payType: PayType | null;
  payAmount: number | null;
  upiId: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  pan: string | null;
}

/** One person's record in the employee master. */
export interface Employee extends Member {
  /** When they left the team; null while they're in it */
  leftAt: string | null;
  /** YYYY-MM-DD: when they started working for the business (not when they joined the app) */
  joinedOn: string | null;
  /** For the owner, managers and the person themselves; null for anyone else */
  emergency: { name: string | null; phone: string | null } | null;
  /** For the owner and the person themselves; null for anyone else */
  pay: EmployeePay | null;
}

const blankToNull = <T>(v: T | "" | null | undefined) => (v === undefined ? undefined : v === "" ? null : v);

const optionalUpper = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || pattern.test(v), message)
    .nullable()
    .optional()
    .transform(blankToNull);

export const employeeDetailsInput = z
  .object({
    designation: z.string().trim().max(40).nullable().optional().transform(blankToNull),
    department: z.string().trim().max(40).nullable().optional().transform(blankToNull),
    employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
    joinedOn: z
      .union([z.literal(""), z.iso.date("Pick a valid date")])
      .nullable()
      .optional()
      .transform(blankToNull),
    emergencyName: optionalText(80),
    emergencyPhone: z.union([z.literal(""), phone]).nullable().optional().transform(blankToNull),
    payType: z.enum(PAY_TYPES).nullable().optional(),
    payAmount: z.number("Enter an amount").min(0, "Enter an amount").max(10_000_000, "That's too much").nullable().optional(),
    upiId: z
      .string()
      .trim()
      .refine((v) => v === "" || UPI_ID_PATTERN.test(v), "A UPI ID looks like name@bank")
      .nullable()
      .optional()
      .transform(blankToNull),
    bankAccount: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .refine((v) => v === "" || /^\d{6,20}$/.test(v), "An account number has 6 to 20 digits")
      .nullable()
      .optional()
      .transform(blankToNull),
    ifsc: optionalUpper(IFSC_PATTERN, "IFSC looks like SBIN0001234"),
    pan: optionalUpper(PAN_PATTERN, "PAN looks like ABCDE1234F"),
  })
  .refine((v) => v.payAmount == null || v.payType, { path: ["payType"], message: "Choose monthly or per day" });
export type EmployeeDetailsInput = z.input<typeof employeeDetailsInput>;

export interface Invitation {
  id: string;
  name: string;
  phone: string;
  role: z.infer<typeof role>;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface Team {
  members: Member[];
  /** Only returned to people who can invite. */
  invitations: Invitation[];
  /** People who have left. Only returned to people who can manage the team. */
  former: FormerMember[];
}

export const createInvitationInput = z.object({
  name: personName,
  phone,
  role,
});
export type CreateInvitationInput = z.input<typeof createInvitationInput>;

export interface CreatedInvitation {
  invitation: Invitation;
  /** Shown once. The app turns it into a link to share on WhatsApp. */
  token: string;
}

export const updateMemberInput = z.object({ role });
export type UpdateMemberInput = z.input<typeof updateMemberInput>;

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface InvitationPreview {
  workspaceName: string;
  businessTypeName: string;
  invitedByName: string | null;
  inviteeName: string;
  role: z.infer<typeof role>;
  phoneMasked: string;
  status: InvitationStatus;
}

export interface AcceptedInvitation {
  workspaceId: string;
}
