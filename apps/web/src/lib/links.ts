import type { SetupStepKey } from "@wedding-yantra/types";

/** Where each Home setup step takes you. */
export const SETUP_LINKS: Record<SetupStepKey, string | null> = {
  create_business: null,
  business_profile: "/app/settings/business",
  invite_team: "/app/team",
};

export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

/** The client's link to a bill: they can see it and pay by UPI. */
export const billUrl = (token: string) => `${window.location.origin}/b/${token}`;
