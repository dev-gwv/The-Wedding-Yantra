import { formatDate, salesAlertText, type NotificationKind, type SalesAlertFacts } from "@wedding-yantra/core";
import { EVENT_LABELS, type EventType } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { notify } from "../notifications/service.js";

/**
 * Who hears about a lead or a quote: the people on it who are still in the business, or
 * the owner(s) when there's nobody. Never whoever did it.
 */
export async function salesRecipients(db: Queryable, workspaceId: string, people: (string | null | undefined)[]): Promise<string[]> {
  const wanted = [...new Set(people.filter((id): id is string => !!id))];
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM memberships
      WHERE workspace_id = $1 AND removed_at IS NULL AND (user_id = ANY($2::uuid[]) OR (cardinality($2::uuid[]) = 0 AND role = 'owner'))`,
    [workspaceId, wanted],
  );
  if (rows.length || !wanted.length) return rows.map((r) => r.user_id);
  // Everyone on it has left: the owner hears instead.
  return salesRecipients(db, workspaceId, []);
}

/** One enquiry or quote alert to everyone it's for. Respects who switched "Enquiries and quotes" off. */
export async function salesAlert(
  db: Queryable,
  a: {
    workspaceId: string;
    kind: NotificationKind;
    to: (string | null | undefined)[];
    facts: SalesAlertFacts;
    link: string;
    entityType: "lead" | "quote";
    entityId: string;
    actorId?: string | null;
    dedupeKey?: string | null;
  },
): Promise<number> {
  const people = await salesRecipients(db, a.workspaceId, a.to);
  const text = salesAlertText(a.kind, a.facts);
  return notify(
    db,
    people.map((userId) => ({
      workspaceId: a.workspaceId,
      userId,
      kind: a.kind,
      ...text,
      link: a.link,
      entityType: a.entityType,
      entityId: a.entityId,
      actorId: a.actorId ?? null,
      dedupeKey: a.dedupeKey ?? null,
    })),
  );
}

/** "Wedding · 5 Dec 2026 · Jaipur": what the enquiry is for, as far as it's known. */
export function enquiryLine(lead: { eventType?: string | null; eventDate?: string | null; city?: string | null }, via?: string | null): string {
  return [
    lead.eventType ? (EVENT_LABELS[lead.eventType as EventType] ?? null) : null,
    lead.eventDate ? formatDate(lead.eventDate) : null,
    lead.city || null,
    via || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
