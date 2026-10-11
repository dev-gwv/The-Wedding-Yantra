import { can } from "@wedding-yantra/core";
import type { LeadRouting } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { loadAccess, type PersonAccess } from "../auth/access.js";

/**
 * Who gets the leads that arrive by themselves (Facebook and Instagram lead forms): one
 * row per business. No row: everyone with the Leads screen except the owner, skipping
 * anyone on leave today.
 */
export interface RoutingSettings {
  everyoneWithLeads: boolean;
  /** The people picked, used only when not everyone */
  people: string[];
  includeOwner: boolean;
  skipOnLeave: boolean;
}

export async function routingSettings(db: Queryable, workspaceId: string): Promise<RoutingSettings> {
  const { rows } = await db.query<{ people: string[]; everyone_with_leads: boolean; include_owner: boolean; skip_on_leave: boolean }>(
    `SELECT people, everyone_with_leads, include_owner, skip_on_leave FROM lead_routing WHERE workspace_id = $1`,
    [workspaceId],
  );
  const r = rows[0];
  if (!r) return { everyoneWithLeads: true, people: [], includeOwner: false, skipOnLeave: true };
  return { everyoneWithLeads: r.everyone_with_leads, people: r.people, includeOwner: r.include_owner, skipOnLeave: r.skip_on_leave };
}

/** Active members (all of them, or only these) who have the Leads screen, with their access. */
export async function membersWithLeads(db: Queryable, workspaceId: string, userIds?: string[]): Promise<Map<string, PersonAccess>> {
  const access = await loadAccess(db, workspaceId, userIds);
  return new Map([...access].filter(([, a]) => can(a, "leads.work")));
}

type Person = LeadRouting["pool"][number] & { lastLeadAt: Date | null };

/** How busy each of these people is: open leads, when they last got one, and whether they're off today. */
async function loadPeople(db: Queryable, workspaceId: string, userIds: string[], now: Date): Promise<Person[]> {
  if (!userIds.length) return [];
  const { rows } = await db.query<{ user_id: string; name: string | null; open_leads: number; last_lead_at: Date | null; on_leave: boolean }>(
    `WITH today AS (SELECT ($3::timestamptz AT TIME ZONE timezone)::date AS d FROM workspaces WHERE id = $1)
     SELECT u.id AS user_id, u.name,
            (SELECT count(*) FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id AND s.kind = 'open'
              WHERE l.workspace_id = $1 AND l.assigned_to = u.id AND l.deleted_at IS NULL)::int AS open_leads,
            (SELECT max(l.created_at) FROM leads l
              WHERE l.workspace_id = $1 AND l.assigned_to = u.id AND l.deleted_at IS NULL) AS last_lead_at,
            EXISTS (SELECT 1 FROM time_off o
                     WHERE o.workspace_id = $1 AND o.user_id = u.id AND o.deleted_at IS NULL
                       AND today.d BETWEEN o.start_date AND o.end_date) AS on_leave
       FROM users u CROSS JOIN today
      WHERE u.id = ANY($2::uuid[])`,
    [workspaceId, userIds, now],
  );
  return rows.map((r) => ({ userId: r.user_id, name: r.name, openLeads: r.open_leads, lastLeadAt: r.last_lead_at, onLeave: r.on_leave }));
}

/** Fewest open leads first; on a tie, whoever got their last lead longest ago, then by name. */
function byTurn(a: Person, b: Person): number {
  if (a.openLeads !== b.openLeads) return a.openLeads - b.openLeads;
  const at = a.lastLeadAt?.getTime() ?? -Infinity;
  const bt = b.lastLeadAt?.getTime() ?? -Infinity;
  if (at !== bt) return at - bt;
  if (a.name !== b.name) return a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name);
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/** The longest-standing owner: who gets leads when nobody else can. */
async function firstOwner(db: Queryable, workspaceId: string): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner' AND removed_at IS NULL ORDER BY created_at, id LIMIT 1`,
    [workspaceId],
  );
  return rows[0]?.user_id ?? null;
}

/**
 * Everyone the settings name who can still take leads, in turn order. People on leave come
 * last and are skipped, unless that would leave nobody.
 */
async function turnOrder(db: Queryable, workspaceId: string, now: Date): Promise<{ people: Person[]; available: Person[] }> {
  const settings = await routingSettings(db, workspaceId);
  const eligible = await membersWithLeads(db, workspaceId, settings.everyoneWithLeads ? undefined : settings.people);
  const ids = [...eligible]
    .filter(([, a]) => !settings.everyoneWithLeads || settings.includeOwner || a.role !== "owner")
    .map(([id]) => id);
  const people = (await loadPeople(db, workspaceId, ids, now)).sort(byTurn);
  const working = settings.skipOnLeave ? people.filter((p) => !p.onLeave) : people;
  const available = working.length ? working : people;
  return { people: [...available, ...people.filter((p) => !available.includes(p))], available };
}

/**
 * Who gets the next lead that arrives by itself: the person with the fewest open leads, or
 * the owner when there's nobody. `tx` must be a transaction: the lock makes two leads arriving
 * at the same moment wait for each other, so they don't both go to the same person.
 */
export async function pickAssignee(tx: Queryable, workspaceId: string, now: Date): Promise<string | null> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('routing:' || $1::text, 0))`, [workspaceId]);
  const { available } = await turnOrder(tx, workspaceId, now);
  return available[0]?.userId ?? (await firstOwner(tx, workspaceId));
}

/** Who would get leads now, next one first, with their open leads: shown on the settings screen. */
export async function previewPool(db: Queryable, workspaceId: string, now: Date): Promise<LeadRouting["pool"]> {
  let { people } = await turnOrder(db, workspaceId, now);
  if (!people.length) {
    const owner = await firstOwner(db, workspaceId);
    people = owner ? await loadPeople(db, workspaceId, [owner], now) : [];
  }
  return people.map((p) => ({ userId: p.userId, name: p.name, openLeads: p.openLeads, onLeave: p.onLeave }));
}
