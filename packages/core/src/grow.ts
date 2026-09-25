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
