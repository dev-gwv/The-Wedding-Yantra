/**
 * Messages to many clients at once: festival wishes, anniversary wishes and offers. Each
 * one goes out on WhatsApp from the business's own phone, person by person, so it reads
 * like a message from them and not like an advert.
 */

export const BROADCAST_AUDIENCES = ["past_clients", "all_clients", "lost_enquiries", "anniversaries"] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export const BROADCAST_AUDIENCE_INFO: Record<BroadcastAudience, { label: string; about: string }> = {
  past_clients: { label: "Clients you've worked with", about: "Everyone whose event is done" },
  all_clients: { label: "All clients", about: "Everyone on your client list" },
  lost_enquiries: { label: "Enquiries that didn't book", about: "Marked lost in the last 12 months" },
  anniversaries: { label: "Anniversaries coming up", about: "Couples whose wedding day falls in the next 2 weeks" },
};

/** How many days ahead "anniversaries coming up" looks. */
export const ANNIVERSARY_DAYS_AHEAD = 14;

export interface BroadcastPreset {
  id: string;
  label: string;
  audience: BroadcastAudience;
  message: string;
}

/** Ready messages, one tap to start from. {first_name} and {business} are filled per person. */
export const BROADCAST_PRESETS: BroadcastPreset[] = [
  {
    id: "diwali",
    label: "Diwali",
    audience: "past_clients",
    message: "Happy Diwali, {first_name}! Wishing you and your family a festival full of light, sweets and happiness. Warm wishes from all of us at {business}.",
  },
  {
    id: "holi",
    label: "Holi",
    audience: "past_clients",
    message: "Happy Holi, {first_name}! May your year be as bright as the colours today. With love from {business}.",
  },
  {
    id: "eid",
    label: "Eid",
    audience: "past_clients",
    message: "Eid Mubarak, {first_name}! Wishing you and your family peace, joy and a wonderful celebration. Warm wishes from {business}.",
  },
  {
    id: "navratri",
    label: "Navratri",
    audience: "past_clients",
    message: "Happy Navratri, {first_name}! Wishing you nine nights of joy, garba and blessings. From all of us at {business}.",
  },
  {
    id: "christmas",
    label: "Christmas",
    audience: "past_clients",
    message: "Merry Christmas, {first_name}! Wishing you and your family a joyful season. Warm wishes from {business}.",
  },
  {
    id: "new_year",
    label: "New Year",
    audience: "past_clients",
    message: "Happy New Year, {first_name}! Thank you for being part of our journey. Wishing you a year full of celebrations. From {business}.",
  },
  {
    id: "season_offer",
    label: "Wedding season offer",
    audience: "all_clients",
    message:
      "Hi {first_name}, the wedding season is here and our dates are filling up. If you or someone in your family has a celebration coming, book this month for a special price. Just reply here to check your date. {business}",
  },
  {
    id: "win_back",
    label: "Still planning?",
    audience: "lost_enquiries",
    message:
      "Hi {first_name}, hope the planning is going well! If you still need help for your celebration, we have a few dates open and would love to be part of it. Reply here and we'll share what we can do. {business}",
  },
  {
    id: "anniversary",
    label: "Anniversary wish",
    audience: "anniversaries",
    message: "Happy anniversary, {first_name}! It was a joy to be part of your wedding. Wishing you both many more happy years together. Warm wishes from {business}.",
  },
];

/** "12 of 40 sent", counting skipped people as done. */
export function broadcastProgress(counts: { total: number; sent: number; skipped: number }): { done: number; left: number; percent: number } {
  const done = counts.sent + counts.skipped;
  return { done, left: Math.max(0, counts.total - done), percent: counts.total ? Math.round((done / counts.total) * 100) : 0 };
}
