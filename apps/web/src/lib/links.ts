import type { SetupStepKey } from "@wedding-yantra/types";

/** Where each Home setup step takes you. */
export const SETUP_LINKS: Record<SetupStepKey, string | null> = {
  create_business: null,
  business_profile: "/app/settings/business",
  price_list: "/app/settings/services",
  first_enquiry: "/app/leads",
  first_quote: "/app/quotes/new",
  getting_paid: "/app/settings/business",
  invite_team: "/app/team",
};

export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

/** The client's link to a bill: they can see it and pay by UPI. */
export const billUrl = (token: string) => `${window.location.origin}/b/${token}`;

/** The client's own page: their events, quotes, bills and payments. */
export const portalUrl = (token: string) => `${window.location.origin}/c/${token}`;

/** A client's "recommend us" link: the enquiry form, crediting them. */
export const referralUrl = (slug: string, code: string) => `${window.location.origin}/f/${slug}?ref=${encodeURIComponent(code)}`;
