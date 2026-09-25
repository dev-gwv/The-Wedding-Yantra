import { BILLING_PERIODS, PLANS, type BillingPeriod, type BillingStatus, type Plan } from "@wedding-yantra/core";
import { z } from "zod";
import { optionalText } from "./common.js";

/** A business's plan, trial and how much of its plan it uses. */
export interface BillingOverview {
  status: BillingStatus;
  /** The plan being paid for; null during the trial and after it ends */
  plan: Plan | null;
  period: BillingPeriod | null;
  trialEndsAt: string;
  /** When the paid time ends: it renews then, or stops if cancelled */
  currentPeriodEnd: string | null;
  cancelled: boolean;
  usage: {
    /** People on the team, and invitations waiting */
    members: number;
    membersLimit: number;
    eventsThisYear: number;
    eventsLimit: number | null;
  };
  /** Paying online is switched on */
  onlinePayment: boolean;
  /** The end of the trial and the plan limits are enforced */
  enforced: boolean;
}

export const checkoutInput = z.object({ plan: z.enum(PLANS), period: z.enum(BILLING_PERIODS) });
export type CheckoutInput = z.input<typeof checkoutInput>;

/** Where to send the owner to pay. */
export interface Checkout {
  url: string;
}

/** For whoever runs Wedding Yantra: a plan paid another way (UPI, bank transfer). */
export const manualPlanInput = z.object({
  plan: z.enum(PLANS),
  period: z.enum(BILLING_PERIODS),
  /** The last day it's paid for */
  until: z.iso.date("Pick the last day"),
  note: optionalText(200),
});
export type ManualPlanInput = z.input<typeof manualPlanInput>;
