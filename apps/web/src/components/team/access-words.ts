import { AREA_INFO, type Area } from "@wedding-yantra/core";
import type { Member } from "@wedding-yantra/types";

/** "A, B and C" */
export function andList(words: readonly string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Screens by name: "Leads & follow-ups, Quotes & prices and Events & calendar". */
export const screenNames = (areas: readonly Area[]) => andList(areas.map((a) => AREA_INFO[a].label));

/**
 * Someone put in a department before departments decided screens: they keep their role's
 * usual access until the owner turns their department's screens on. A department changes
 * nothing for the owner or freelancers, so they're left out.
 */
export const onUsualAccess = (m: Member) => !!m.department && !m.departmentOn && m.role !== "owner" && m.role !== "freelancer";
