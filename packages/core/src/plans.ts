/**
 * What Wedding Yantra costs and what each plan includes. One place, so the website, the
 * billing screen and the limits the API enforces never disagree. Prices are in rupees.
 */

export const PLANS = ["starter", "studio", "business"] as const;
export type Plan = (typeof PLANS)[number];

export const BILLING_PERIODS = ["monthly", "yearly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export interface PlanInfo {
  name: string;
  /** Who it's for, in a few words */
  for: string;
  monthly: number;
  /** A year for the price of ten months */
  yearly: number;
  /** People who can use it, the owner included */
  members: number;
  /** Events that can be added in a calendar year; null for no limit */
  eventsPerYear: number | null;
  highlights: string[];
}

export const PLAN_INFO: Record<Plan, PlanInfo> = {
  starter: {
    name: "Starter",
    for: "A solo artist or a small vendor",
    monthly: 499,
    yearly: 4990,
    members: 1,
    eventsPerYear: 30,
    highlights: ["Enquiries, quotes and GST bills", "Events and calendar", "Expenses, profit and the monthly report", "30 events a year"],
  },
  studio: {
    name: "Studio",
    for: "A small team",
    monthly: 1499,
    yearly: 14990,
    members: 5,
    eventsPerYear: null,
    highlights: ["Everything in Starter", "Up to 5 people", "Tasks, checklists and days off", "Team scores and the daily summary", "Unlimited events"],
  },
  business: {
    name: "Business",
    for: "An established company",
    monthly: 3499,
    yearly: 34990,
    members: 15,
    eventsPerYear: null,
    highlights: ["Everything in Studio", "Up to 15 people", "Priority help on WhatsApp", "New features first"],
  },
};

/** Every new business tries everything free for this long. No card needed. */
export const TRIAL_DAYS = 14;
/** During the trial, the limits of the biggest plan apply. */
export const TRIAL_PLAN: Plan = "business";

export type BillingStatus = "trial" | "active" | "past_due" | "expired";

/**
 * Where a business stands, from its trial end and its latest subscription.
 * `past_due`: a renewal failed; it keeps working while the payment is retried.
 */
export function billingStatus(
  s: { trialEndsAt: string; subscription: { status: "created" | "active" | "past_due" | "cancelled" | "completed"; currentPeriodEnd: string | null } | null },
  now: Date = new Date(),
): BillingStatus {
  const sub = s.subscription;
  if (sub && (sub.status === "active" || sub.status === "past_due")) {
    if (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > now) return sub.status;
  }
  // Cancelled or finished plans keep working until the end of what was paid for.
  if (sub && (sub.status === "cancelled" || sub.status === "completed") && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now) {
    return "active";
  }
  return new Date(s.trialEndsAt) > now ? "trial" : "expired";
}

/** Whole days left until a time, rounded up; 0 once it has passed. */
export function daysLeft(until: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000));
}
