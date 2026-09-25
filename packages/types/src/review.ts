import type { DailySummaryFacts, Role, ScoreKey } from "@wedding-yantra/core";
import { z } from "zod";
import type { PersonRef } from "./sales.js";

// ---------------------------------------------------------------------------
// Scores: each person's month, worked out from the work itself
// ---------------------------------------------------------------------------

export interface ScoreMeasure {
  key: ScoreKey;
  done: number;
  total: number;
}

export interface PersonScore {
  user: PersonRef;
  role: Role;
  /** 0 to 100, or null when there was nothing to measure this month */
  score: number | null;
  /** Only the measures that had something to measure */
  measures: ScoreMeasure[];
  /** Their tasks that are late right now */
  lateNow: number;
}

export interface TeamScores {
  month: string;
  /** Everyone for owners and managers; just you for everyone else */
  people: PersonScore[];
  /** The business as a whole, for owners and managers */
  business: {
    /** For events that began this month: money in before the first function, of what was due */
    moneyBeforeEvents: { collected: number; due: number };
    /** Events that began this month whose every step was done by its day */
    eventsOnTime: { done: number; total: number };
  } | null;
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

export const ACTIVITY_LINK_KINDS = ["event", "lead", "bill", "quote", "team", "expenses", "tasks"] as const;
export type ActivityLinkKind = (typeof ACTIVITY_LINK_KINDS)[number];

/** One thing someone did. `activityText()` in core turns it into a sentence. */
export interface ActivityItem {
  id: string;
  at: string;
  /** Null when a client or the enquiry form did it */
  actor: PersonRef | null;
  action: string;
  subject: string | null;
  other: string | null;
  amount: number | null;
  detail: string | null;
  late: boolean;
  /** Where it opens in the app */
  link: { kind: ActivityLinkKind; id: string | null } | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  /** Pass as `before` for the next page; null at the end */
  next: string | null;
}

export const activityQuery = z.object({
  before: z.string().max(200).optional(),
  /** Only what this person did */
  userId: z.uuid().optional(),
});
export type ActivityQuery = z.input<typeof activityQuery>;

// ---------------------------------------------------------------------------
// Daily summary
// ---------------------------------------------------------------------------

export type DailySummary = DailySummaryFacts;

export const dailySummaryQuery = z.object({ date: z.iso.date("Pick a valid date").optional() });
export type DailySummaryQuery = z.input<typeof dailySummaryQuery>;
