import type { PaymentMethod } from "@wedding-yantra/core";
import type { EventStatus, EventType } from "./bookings.js";
import type { DeliverableStatus } from "./deliverables.js";

// ---------------------------------------------------------------------------
// The client's own page, at /c/<token>
// ---------------------------------------------------------------------------

/** The link to a client's page. Owners and managers share it and can stop sharing it. */
export interface ClientPortalLink {
  token: string;
}

export interface PortalEvent {
  title: string;
  eventType: EventType | null;
  status: Exclude<EventStatus, "cancelled">;
  city: string | null;
  venue: string | null;
  /** YYYY-MM-DD */
  startDate: string | null;
  endDate: string | null;
  functions: { name: string; date: string; startTime: string | null; venue: string | null }[];
  /** What the business will hand over, and the link once it's delivered */
  deliverables: { title: string; dueDate: string | null; status: DeliverableStatus; link: string | null }[];
}

export interface PortalQuote {
  number: string;
  title: string | null;
  status: "sent" | "accepted";
  total: number;
  issueDate: string;
  validUntil: string | null;
  expired: boolean;
  /** Opens the quote at /q/<token> */
  token: string;
}

export interface PortalBill {
  number: string;
  issueDate: string;
  dueDate: string | null;
  total: number;
  received: number;
  due: number;
  overdue: boolean;
  /** Opens the bill, with Pay by UPI, at /b/<token> */
  token: string;
}

/** Everything a client has with the business, always up to date. No sign-in needed. */
export interface ClientPortal {
  business: {
    name: string;
    typeName: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    /** Where to leave a review, once an event is over */
    reviewUrl: string | null;
    /** The enquiry form friends are sent to, when it's switched on */
    formSlug: string | null;
  };
  client: {
    name: string;
    /** Goes on the "recommend us" link, so enquiries from it name this client */
    referralCode: string;
  };
  events: PortalEvent[];
  quotes: PortalQuote[];
  bills: PortalBill[];
  payments: { number: string; amount: number; paidOn: string; method: PaymentMethod }[];
  totals: { billed: number; paid: number; due: number };
  /** An event is over, so the page asks for a review */
  eventOver: boolean;
}

// ---------------------------------------------------------------------------
// Reviews and referrals, for owners and managers
// ---------------------------------------------------------------------------

export interface ReviewAsk {
  eventId: string;
  title: string;
  clientName: string | null;
  clientPhone: string | null;
  /** YYYY-MM-DD, the last day of the event */
  endDate: string | null;
}

export interface Referrer {
  clientId: string;
  name: string;
  enquiries: number;
  booked: number;
}

export interface GrowSummary {
  /** The business's review link; asking needs one */
  reviewUrl: string | null;
  /** Events over in the last 60 days whose client hasn't been asked for a review */
  toAsk: ReviewAsk[];
  /** Clients asked for a review in the last 30 days */
  askedRecently: number;
  referrals: {
    /** Enquiries in the last 12 months that came from a referral */
    enquiries: number;
    /** ...and how many of them booked */
    booked: number;
    /** The clients who sent the most enquiries, most first */
    top: Referrer[];
  };
}
