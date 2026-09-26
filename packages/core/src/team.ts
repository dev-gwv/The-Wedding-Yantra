import { formatClock, formatDate } from "./dates.js";
import { formatMoney } from "./money.js";

// ---------------------------------------------------------------------------
// Scores: the month's key results for each person, worked out from their work
// ---------------------------------------------------------------------------

export const SCORE_KEYS = ["tasks_on_time", "follow_ups_on_time", "leads_booked", "expenses_on_time"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_INFO: Record<ScoreKey, { label: string; hint: string }> = {
  tasks_on_time: { label: "Tasks done on time", hint: "Tasks due this month, ticked off by their day" },
  follow_ups_on_time: {
    label: "Follow-ups kept",
    hint: "Follow-ups that came due, with a call, message or note by the end of that day",
  },
  leads_booked: { label: "Enquiries booked", hint: "Of the enquiries closed this month, the ones that were booked" },
  expenses_on_time: { label: "Expenses added in a day", hint: "Money spent, added by the next day" },
};

/** A whole-number percent, or null when there was nothing to measure. */
export function percentOf(done: number, total: number): number | null {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

/** The month's score: the plain average of the measures that had something to measure. */
export function overallScore(measures: readonly { done: number; total: number }[]): number | null {
  const percents = measures.map((m) => percentOf(m.done, m.total)).filter((p): p is number => p !== null);
  if (percents.length === 0) return null;
  return Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
}

/** How a score reads at a glance. */
export function scoreBand(score: number): "great" | "good" | "low" {
  if (score >= 85) return "great";
  if (score >= 60) return "good";
  return "low";
}

// ---------------------------------------------------------------------------
// Activity: who did what, as a sentence
// ---------------------------------------------------------------------------

/** One thing that happened, with the names already looked up by the API. */
export interface ActivityFacts {
  action: string;
  /** Null when it wasn't someone on the team: a client accepting a quote, the enquiry form */
  actorName: string | null;
  /** What it was about: an event's title, a lead's name, a bill number */
  subject: string | null;
  /** Someone else it involved: who a task went to, whose expense it was, the client who paid */
  other: string | null;
  amount: number | null;
  /** A stage's name, a role, a reason, when a follow-up is due */
  detail: string | null;
  late?: boolean;
}

const q = (s: string | null) => (s ? `“${s}”` : "a task");

/**
 * The sentence that follows the person's name in the activity log, e.g. "ticked off
 * “Kit packed”". When nobody on the team did it, a whole sentence.
 */
export function activityText(a: ActivityFacts): string {
  const money = a.amount !== null ? formatMoney(a.amount, { paise: a.amount % 1 !== 0 }) : null;
  const subject = a.subject ?? "";
  switch (a.action) {
    case "workspace.created":
      return `started ${a.subject ?? "the business"} on Wedding Yantra`;
    case "workspace.updated":
      return "updated the business profile";
    case "member.invited":
      return `invited ${a.subject ?? "someone"}${a.detail ? ` as ${a.detail.toLowerCase()}` : ""}`;
    case "member.joined":
      return `joined the team${a.detail ? ` as ${a.detail.toLowerCase()}` : ""}`;
    case "member.role_changed":
      return `made ${a.subject ?? "a team member"}${a.detail ? ` ${a.detail.toLowerCase()}` : " something else"}`;
    case "member.removed":
      return `took ${a.subject ?? "someone"} off the team`;
    case "member.invite_revoked":
      return `cancelled the invitation for ${a.subject ?? "someone"}`;
    case "sales.stages_updated":
      return "changed the sales stages";
    case "quote.accepted":
      return a.actorName
        ? `marked quote ${subject} as accepted${a.other ? ` for ${a.other}` : ""}`
        : `${a.other ?? "The client"} accepted quote ${subject}${money ? ` (${money})` : ""}`;
    case "event.created":
      return `added the event ${subject}`;
    case "event.cancelled":
      return `cancelled ${subject}`;
    case "event.completed":
      return `marked ${subject} done`;
    case "event.confirmed":
      return `confirmed ${subject} again`;
    case "event.team_changed":
      return `chose the team for ${subject}`;
    case "event.review_requested":
      return `asked ${a.other ?? "the client"} for a review of ${subject}`;
    case "payout.paid":
      return `paid ${a.other ?? "a vendor"}${money ? ` ${money}` : ""}${a.subject ? ` for ${a.subject}` : ""}`;
    case "deliverable.delivered":
      return `delivered ${q(a.subject)}${a.detail ? ` for ${a.detail}` : ""}${a.late ? ", late" : ""}`;
    case "client.portal_shared":
      return `shared ${subject ? `${subject}'s` : "a client's"} page with them`;
    case "client.portal_stopped":
      return `stopped sharing ${subject ? `${subject}'s` : "a client's"} page`;
    case "bill.created":
      return `made invoice ${subject}${a.other ? ` for ${a.other}` : ""}${money ? ` (${money})` : ""}`;
    case "bill.updated":
      return `changed invoice ${subject}${money ? ` (now ${money})` : ""}`;
    case "bill.cancelled":
      return `cancelled invoice ${subject}${a.detail ? `: ${a.detail}` : ""}`;
    case "payment.recorded":
      return `recorded ${money ?? "a payment"}${a.other ? ` from ${a.other}` : ""}`;
    case "payment.updated":
      return `changed a payment${a.other ? ` from ${a.other}` : ""}`;
    case "payment.deleted":
      return `removed a payment${money ? ` of ${money}` : ""}`;
    case "expense.added":
      return `added an expense${money ? ` of ${money}` : ""}${a.subject ? ` for ${a.subject}` : ""}`;
    case "expense.submitted":
      return `sent an expense${money ? ` of ${money}` : ""} for approval`;
    case "expense.approved":
      return `approved ${a.other ? `${a.other}'s` : "an"} expense${money ? ` of ${money}` : ""}`;
    case "expense.rejected":
      return `sent back ${a.other ? `${a.other}'s` : "an"} expense${money ? ` of ${money}` : ""}${a.detail ? `: ${a.detail}` : ""}`;
    case "expense.reimbursed":
      return `paid back ${a.other ?? "a team member"} for an expense${money ? ` of ${money}` : ""}`;
    case "expense.unreimbursed":
      return `marked ${a.other ? `${a.other}'s` : "an"} expense as not paid back yet`;
    case "expense.deleted":
      return `removed an expense${money ? ` of ${money}` : ""}`;
    case "task.assigned":
      return `gave ${a.other ?? "someone"} a task: ${q(a.subject)}`;
    case "task.done":
      return `ticked off ${q(a.subject)}${a.detail ? ` for ${a.detail}` : ""}${a.late ? ", late" : ""}`;
    case "time_off.added":
      return a.other ? `marked ${a.other} as off${a.detail ? ` ${a.detail}` : ""}` : `will be off${a.detail ? ` ${a.detail}` : ""}`;
    case "lead.created":
      return a.actorName
        ? `added the enquiry ${subject}`
        : `New enquiry from ${subject}${a.detail ? ` via the ${a.detail}` : ""}${a.other ? `, recommended by ${a.other}` : ""}`;
    case "lead.note":
      return a.actorName ? `added a note on ${subject}` : `${subject} sent the enquiry form again`;
    case "lead.call":
      return `called ${subject}`;
    case "lead.whatsapp":
      return `sent ${subject} a WhatsApp message`;
    case "lead.stage_changed":
      return a.actorName ? `moved ${subject} to ${a.detail ?? "another stage"}` : `${subject} moved to ${a.detail ?? "another stage"}`;
    case "lead.follow_up_set":
      return `set a follow-up with ${subject}${a.detail ? ` for ${a.detail}` : ""}`;
    case "lead.assigned":
      return a.other ? `gave the enquiry ${subject} to ${a.other}` : `took the enquiry ${subject} off everyone's list`;
    default:
      return a.action.replace(/[._]/g, " ");
  }
}

// ---------------------------------------------------------------------------
// The day in one message, for WhatsApp
// ---------------------------------------------------------------------------

export interface DailySummaryFacts {
  date: string;
  /** Null for people who don't see the money */
  received: { total: number; count: number } | null;
  newLeads: number;
  booked: number;
  tasksDone: number;
  /** Open tasks already late, by person. A null name is "anyone on the event". */
  lateTasks: { name: string | null; count: number }[];
  expensesWaiting: number | null;
  tomorrow: {
    date: string;
    events: { title: string; functions: { name: string; time: string | null }[]; team: string[] }[];
    tasksDue: number;
    /** Who is off that day */
    off: string[];
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayName = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
};

/** The end-of-day message an owner sends to themselves or the team group. WhatsApp's *bold*. */
export function dailySummaryMessage(s: DailySummaryFacts, businessName: string): string {
  const lines = [`*${businessName}: ${dayName(s.date)} ${formatDate(s.date, { year: false })}*`, ""];
  if (s.received) {
    lines.push(s.received.count ? `${formatMoney(s.received.total)} received (${plural(s.received.count, "payment")})` : "No money received");
  }
  lines.push(`${plural(s.newLeads, "new enquiry", "new enquiries")}${s.booked ? `, ${s.booked} booked` : ""}`);
  lines.push(`${plural(s.tasksDone, "task")} done`);
  if (s.lateTasks.length) {
    lines.push(`Late: ${s.lateTasks.map((l) => `${l.name ? l.name.split(" ")[0] : "Anyone"} ${l.count}`).join(", ")}`);
  }
  if (s.expensesWaiting) lines.push(`${plural(s.expensesWaiting, "expense")} waiting for approval`);

  lines.push("", `*Tomorrow, ${dayName(s.tomorrow.date)} ${formatDate(s.tomorrow.date, { year: false })}*`);
  if (s.tomorrow.events.length === 0) lines.push("No events");
  for (const e of s.tomorrow.events) {
    const fns = e.functions.map((f) => (f.time ? `${f.name} ${formatClock(f.time)}` : f.name)).join(", ");
    const team = e.team.length ? `. Team: ${e.team.map((n) => n.split(" ")[0]).join(", ")}` : "";
    lines.push(`${e.title}${fns ? `: ${fns}` : ""}${team}`);
  }
  if (s.tomorrow.tasksDue) lines.push(`${plural(s.tomorrow.tasksDue, "task")} due`);
  // `off` can be missing from an older API during a deploy.
  const off = s.tomorrow.off ?? [];
  if (off.length) lines.push(`Off: ${off.map((n) => n.split(" ")[0]).join(", ")}`);
  return lines.join("\n");
}
