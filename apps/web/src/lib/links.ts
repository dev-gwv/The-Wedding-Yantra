import type { SetupStepKey } from "@wedding-yantra/types";

/** Where each Home setup step takes you. */
export const SETUP_LINKS: Record<SetupStepKey, string | null> = {
  create_business: null,
  business_profile: "/app/settings/business",
  invite_team: "/app/team",
};

export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;
