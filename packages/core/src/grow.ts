/**
 * Growing the business from happy clients: their own page, reviews and referrals.
 * The WhatsApp messages are plain and polite, in the business's voice.
 */

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * An event is over when it's marked done, or its last day has passed. That's when
 * asking for a review makes sense. Cancelled events never are.
 */
export function eventIsOver(event: { status: string; endDate: string | null }, today: string): boolean {
  if (event.status === "cancelled") return false;
  return event.status === "completed" || (event.endDate !== null && event.endDate < today);
}

/** Sends a client the link to their own page. */
export function portalMessage(o: { clientName: string; business: string; link: string }): string {
  return `Hi ${first(o.clientName)}, here is your page with ${o.business}. It has your event dates, quotes, bills and payments, always up to date: ${o.link}`;
}

/** Asks a client for a review once their event is over. */
export function reviewMessage(o: { clientName: string; business: string; link: string }): string {
  return `Hi ${first(o.clientName)}, thank you for choosing ${o.business}! We loved being part of your celebration. If you were happy with our work, would you leave us a short review? It helps other families find us: ${o.link}`;
}

/** What a happy client sends friends to recommend the business. */
export function referralMessage(o: { business: string; link: string }): string {
  return `I booked ${o.business} for our celebration and loved their work. If you're planning one, send them your enquiry here: ${o.link}`;
}

// ---------------------------------------------------------------------------
// Deliverables: what an event owes the client
// ---------------------------------------------------------------------------

/**
 * Days from the event: positive counts from its last day (edited photos 30 days after),
 * negative from its first day (a song mix 21 days before).
 */
export interface DeliverableSuggestion {
  title: string;
  days: number;
}

const COMMON: DeliverableSuggestion[] = [{ title: "Event photos", days: 7 }];

/** Ready suggestions for each trade, so adding a deliverable is one tap. */
export const DELIVERABLE_SUGGESTIONS: Record<string, DeliverableSuggestion[]> = {
  photographer: [
    { title: "Sneak peek photos", days: 3 },
    { title: "Edited photos", days: 30 },
    { title: "Highlight film", days: 45 },
    { title: "Full wedding film", days: 60 },
    { title: "Wedding album", days: 90 },
  ],
  content_creator: [
    { title: "Same-day reel", days: 0 },
    { title: "Reels pack", days: 7 },
    { title: "Behind-the-scenes clips", days: 3 },
    { title: "Raw footage", days: 14 },
  ],
  makeup_artist: [{ title: "Look photos", days: 3 }],
  mehendi_artist: [{ title: "Mehendi photos", days: 3 }],
  wedding_planner: [
    { title: "Run sheet", days: -7 },
    { title: "Final guest list", days: -10 },
    { title: "Vendor contact sheet", days: -5 },
  ],
  decorator: [
    { title: "Design mood board", days: -30 },
    { title: "Final decor plan", days: -14 },
    ...COMMON,
  ],
  event_decorator: [{ title: "Design mood board", days: -14 }, ...COMMON],
  sound_lighting: [
    { title: "Song playlist", days: -7 },
    { title: "Stage and lighting plan", days: -10 },
  ],
  bar_services: [{ title: "Cocktail menu", days: -14 }],
  caterer: [{ title: "Final menu", days: -14 }],
  gifting: [
    { title: "Hamper samples", days: -30 },
    { title: "Gift hampers", days: -3 },
    { title: "Thank-you gifts", days: 0 },
  ],
  choreographer: [
    { title: "Song mix", days: -21 },
    { title: "Practice videos", days: -14 },
    { title: "Performance video", days: 7 },
  ],
  fireworks: [{ title: "Show plan", days: -7 }],
};

export const deliverableSuggestions = (businessTypeId: string): DeliverableSuggestion[] =>
  DELIVERABLE_SUGGESTIONS[businessTypeId] ?? COMMON;

/** The due date for a suggestion on an event with these dates, or null when it has none yet. */
export function suggestedDue(days: number, event: { startDate: string | null; endDate: string | null }): string | null {
  const from = days < 0 ? event.startDate : (event.endDate ?? event.startDate);
  if (!from) return null;
  const [y, m, d] = from.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Tells the client something is ready, with the link when there is one. */
export function deliverableMessage(o: { clientName: string; business: string; title: string; link: string | null }): string {
  const where = o.link ? ` Here it is: ${o.link}` : "";
  return `Hi ${first(o.clientName)}, your ${o.title.toLowerCase()} from ${o.business} ${o.title.endsWith("s") ? "are" : "is"} ready!${where}`;
}
