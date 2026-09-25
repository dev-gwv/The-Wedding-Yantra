import type { StarterPack } from "./business-types.js";

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
  starterPack: StarterPack;
}
