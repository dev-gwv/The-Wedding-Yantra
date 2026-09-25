import type { StarterPack } from "./business-types.js";
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
  starterPack: StarterPack;
}
