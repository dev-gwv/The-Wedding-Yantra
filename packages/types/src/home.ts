import type { BillingStatus } from "@wedding-yantra/core";
import type { StarterPack } from "./business-types.js";
import type { EventSummary } from "./bookings.js";
import type { DueItem } from "./money.js";
import type { LeadSummary } from "./sales.js";

export type SetupStepKey = "create_business" | "business_profile" | "invite_team";

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  description: string;
  done: boolean;
}

/** Everything the Home screen shows, worked out by the server. */
export interface HomeSummary {
  workspaceName: string;
  businessTypeName: string;
  setup: SetupStep[];
  setupDone: number;
  setupTotal: number;
  team: { members: number; pendingInvites: number };
  /** Leads you can see, counted in the business's time zone. */
  sales: {
    overdue: number;
    dueToday: number;
    newLeads: number;
    openValue: number;
    /** Up to five leads to act on first: overdue, then due today. */
    due: LeadSummary[];
  };
  /** Confirmed events in the next 14 days, soonest first (empty for roles without events). */
  upcomingEvents: EventSummary[];
  /** Money to collect, for roles that see money; null for everyone else. */
  money: {
    toCollect: number;
    overdue: number;
    due: DueItem[];
    /** Expenses the team sent that wait for approval (for those who approve) */
    pendingExpenses: number;
  } | null;
  /** Your tasks, and the team's overdue ones for those who manage tasks */
  tasks: { overdue: number; dueToday: number; teamOverdue: number | null };
  /** The plan and trial, for the owner */
  billing: { status: BillingStatus; trialDaysLeft: number; enforced: boolean } | null;
  starterPack: StarterPack;
}
