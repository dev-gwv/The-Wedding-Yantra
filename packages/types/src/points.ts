import { POINT_RULE_KEYS, type PointRuleKey, type Role, type ScoreBand } from "@wedding-yantra/core";
import { z } from "zod";
import type { PersonRef } from "./sales.js";

export interface LeaderboardRow {
  user: PersonRef;
  role: Role;
  points: number;
  /** 1 is top; null when not ranked */
  rank: number | null;
  /** Why not ranked, in words */
  notRanked: string | null;
  band: string;
  /** Tasks given to them and finished this month */
  tasksDone: number;
  /** Of finished tasks that had a day, how many by that day (0-100), or null */
  onTime: number | null;
  lateNow: number;
}

export interface Leaderboard {
  month: string;
  rows: LeaderboardRow[];
  /** Your own place, points to the next band, and what to do next */
  me: (LeaderboardRow & { nextBand: string | null; gap: number; coaching: string }) | null;
  penaltiesOn: boolean;
  bands: ScoreBand[];
}

export interface LedgerEntry {
  id: string;
  rule: PointRuleKey;
  label: string;
  points: number;
  note: string | null;
  task: { id: string; title: string } | null;
  by: PersonRef | null;
  at: string;
}

export interface Ledger {
  user: PersonRef;
  month: string;
  total: number;
  entries: LedgerEntry[];
}

export interface PointRuleSetting {
  key: PointRuleKey;
  label: string;
  points: number;
  enabled: boolean;
  penalty: boolean;
  /** The points when nothing is changed */
  defaultPoints: number;
}

export interface PointSettings {
  rules: PointRuleSetting[];
  penaltiesOn: boolean;
  bands: ScoreBand[];
}

export const ledgerQuery = z.object({
  userId: z.uuid().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-09").optional(),
});

export const savePointSettingsInput = z.object({
  rules: z
    .array(z.object({ key: z.enum(POINT_RULE_KEYS), points: z.number().int().min(-50).max(100), enabled: z.boolean() }))
    .max(POINT_RULE_KEYS.length),
  penaltiesOn: z.boolean(),
  bands: z
    .array(z.object({ name: z.string().trim().min(1, "Name the band").max(30), min: z.number().int().min(0).max(10000) }))
    .min(2, "Keep at least two bands")
    .max(6)
    .refine((b) => b.some((x) => x.min === 0), { message: "One band has to start at 0" })
    .refine((b) => new Set(b.map((x) => x.min)).size === b.length, { message: "Each band needs its own starting points" }),
});
export type SavePointSettingsInput = z.input<typeof savePointSettingsInput>;

export const recogniseInput = z.object({
  userId: z.uuid(),
  note: z.string().trim().min(3, "Say what it was for").max(200),
});
export type RecogniseInput = z.input<typeof recogniseInput>;
