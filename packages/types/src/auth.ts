import { z } from "zod";
import { normalizePhone } from "@wedding-yantra/core";
import { workspaceSummary } from "./workspaces.js";

/** Accepts any common way of writing a phone number and outputs E.164 (`+919876543210`). */
export const phone = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number" });
      return z.NEVER;
    }
    return normalized;
  });

export const personName = z.string().trim().min(2, "Enter your name").max(80);

export const otpRequestInput = z.object({ phone });
export type OtpRequestInput = z.input<typeof otpRequestInput>;

export interface OtpRequestResult {
  sent: true;
  phone: string;
  expiresInSeconds: number;
  /** How the code went out; "none" when no provider is set up (development). */
  channel?: "whatsapp" | "sms" | "none";
  /** Only present when the server runs with AUTH_OTP_DEV_ECHO=true (no SMS/WhatsApp provider yet). */
  devCode?: string;
}

export const otpVerifyInput = z.object({
  phone,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type OtpVerifyInput = z.input<typeof otpVerifyInput>;

export const user = z.object({
  id: z.uuid(),
  phone: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof user>;

export interface AuthSession {
  /** Send as `Authorization: Bearer <token>` on every request. */
  token: string;
  expiresAt: string;
  user: User;
  /** True the first time this phone number signs in; the app then asks for a name. */
  isNewUser: boolean;
}

export const updateMeInput = z.object({
  name: personName,
  email: z
    .union([z.literal(""), z.email("Enter a valid email")])
    .optional()
    .transform((v) => (v === undefined ? undefined : v ? v.toLowerCase() : null)),
});
export type UpdateMeInput = z.input<typeof updateMeInput>;

export const me = z.object({
  user,
  workspaces: z.array(workspaceSummary),
});
export type Me = z.infer<typeof me>;
