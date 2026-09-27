import { can } from "@wedding-yantra/core";
import type { Venue, VenueBrief, VenueEvent, VenueSummary } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { assertOption, optionJoin } from "../options/service.js";

/** Everyone who sees all events sees the venues; owners and managers keep them. */
const requireView = (ctx: MemberContext) => {
  if (!can(ctx.role, "events.view")) throw forbidden("You can't see the venue list");
};
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "events.manage")) throw forbidden("Only the owner or a manager can do this");
};

interface VenueRow {
  id: string;
  name: string;
  venue_type: string | null;
  type_label: string | null;
  address: string | null;
  city: string | null;
  maps_url: string | null;
  contact_person: string | null;
  phone: string | null;
  capacity: number | null;
  music_cutoff: string | null;
  outside_catering: boolean | null;
  load_in: string | null;
  notes: string | null;
  archived_at: Date | null;
  upcoming: string;
}

// An event (or one of its functions) is at a venue when its venue name is the venue's name.
const VENUE_SELECT = `
  SELECT v.id, v.name, v.venue_type, vt.label AS type_label, v.address, v.city, v.maps_url, v.contact_person, v.phone,
         v.capacity, to_char(v.music_cutoff, 'HH24:MI') AS music_cutoff, v.outside_catering, v.load_in, v.notes, v.archived_at,
         (SELECT count(DISTINCT f.event_id) FROM event_functions f
            JOIN events e ON e.id = f.event_id AND e.deleted_at IS NULL AND e.status = 'confirmed'
           WHERE f.workspace_id = v.workspace_id AND f.date >= current_date
             AND lower(trim(coalesce(f.venue, e.venue))) = lower(v.name)) AS upcoming
    FROM venues v
    ${optionJoin("vt", "venue_type", "v.workspace_id", "v.venue_type")}`;

const toSummary = (r: VenueRow): VenueSummary => ({
  id: r.id,
  name: r.name,
  venueType: r.venue_type,
  venueTypeLabel: r.type_label ?? r.venue_type,
  address: r.address,
  city: r.city,
  mapsUrl: r.maps_url,
  contactPerson: r.contact_person,
  phone: r.phone,
  capacity: r.capacity,
  archived: r.archived_at !== null,
  upcoming: Number(r.upcoming),
});

/** Venues with events coming up first, then by name. Archived ones only when asked. */
export async function listVenues(db: Queryable, ctx: MemberContext, archived = false): Promise<VenueSummary[]> {
  requireView(ctx);
  const { rows } = await db.query<VenueRow>(
    `SELECT * FROM (${VENUE_SELECT} WHERE v.workspace_id = $1 AND v.deleted_at IS NULL AND v.archived_at IS ${archived ? "NOT NULL" : "NULL"}) x
      ORDER BY x.upcoming DESC, lower(x.name)`,
    [ctx.workspaceId],
  );
  return rows.map(toSummary);
}

async function venueEvents(db: Queryable, workspaceId: string, name: string): Promise<VenueEvent[]> {
  const { rows } = await db.query<{ id: string; title: string; status: VenueEvent["status"]; client_name: string | null; date: string | null; functions: string[] }>(
    `SELECT e.id, e.title, e.status, c.name AS client_name,
            (min(f.date) FILTER (WHERE lower(trim(coalesce(f.venue, e.venue))) = lower($2)))::text AS date,
            coalesce(array_agg(f.name ORDER BY f.date, f.position) FILTER (WHERE lower(trim(coalesce(f.venue, e.venue))) = lower($2)), '{}') AS functions
       FROM events e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN event_functions f ON f.event_id = e.id
      WHERE e.workspace_id = $1 AND e.deleted_at IS NULL
        AND (lower(trim(e.venue)) = lower($2)
             OR EXISTS (SELECT 1 FROM event_functions g WHERE g.event_id = e.id AND lower(trim(g.venue)) = lower($2)))
      GROUP BY e.id, c.name
      ORDER BY date DESC NULLS LAST
      LIMIT 100`,
    [workspaceId, name],
  );
  return rows.map((r) => ({ eventId: r.id, title: r.title, status: r.status, clientName: r.client_name, date: r.date, functions: r.functions }));
}

export async function getVenue(db: Queryable, ctx: MemberContext, id: string): Promise<Venue> {
  requireView(ctx);
  const { rows } = await db.query<VenueRow>(`${VENUE_SELECT} WHERE v.id = $1 AND v.workspace_id = $2 AND v.deleted_at IS NULL`, [id, ctx.workspaceId]);
  const r = rows[0];
  if (!r) throw notFound("This venue");
  return {
    ...toSummary(r),
    musicCutoff: r.music_cutoff,
    outsideCatering: r.outside_catering,
    loadIn: r.load_in,
    notes: r.notes,
    events: await venueEvents(db, ctx.workspaceId, r.name),
  };
}

/** The saved venues an event's venue names point to, for the event page. */
export async function venuesNamed(db: Queryable, workspaceId: string, names: (string | null)[]): Promise<VenueBrief[]> {
  const wanted = [...new Set(names.filter((n): n is string => !!n?.trim()).map((n) => n.trim().toLowerCase()))];
  if (!wanted.length) return [];
  const { rows } = await db.query<{
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    maps_url: string | null;
    contact_person: string | null;
    phone: string | null;
    music_cutoff: string | null;
    load_in: string | null;
  }>(
    `SELECT DISTINCT ON (lower(name)) id, name, address, city, maps_url, contact_person, phone,
            to_char(music_cutoff, 'HH24:MI') AS music_cutoff, load_in
       FROM venues WHERE workspace_id = $1 AND deleted_at IS NULL AND lower(name) = ANY($2::text[])
      ORDER BY lower(name), archived_at NULLS FIRST, created_at`,
    [workspaceId, wanted],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    city: r.city,
    mapsUrl: r.maps_url,
    contactPerson: r.contact_person,
    phone: r.phone,
    musicCutoff: r.music_cutoff,
    loadIn: r.load_in,
  }));
}

export interface VenueFields {
  name?: string;
  venueType?: string | null;
  address?: string | null;
  city?: string | null;
  mapsUrl?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  capacity?: number | null;
  musicCutoff?: string | null;
  outsideCatering?: boolean | null;
  loadIn?: string | null;
  notes?: string | null;
  archived?: boolean;
}
const VENUE_COLUMNS: [keyof VenueFields, string][] = [
  ["name", "name"],
  ["venueType", "venue_type"],
  ["address", "address"],
  ["city", "city"],
  ["mapsUrl", "maps_url"],
  ["contactPerson", "contact_person"],
  ["phone", "phone"],
  ["capacity", "capacity"],
  ["musicCutoff", "music_cutoff"],
  ["outsideCatering", "outside_catering"],
  ["loadIn", "load_in"],
  ["notes", "notes"],
];

/** Events find their venue by name, so two venues can't share one. */
async function checkName(db: Queryable, workspaceId: string, name: string | undefined, id?: string) {
  if (!name) return;
  const { rows } = await db.query<{ archived: boolean }>(
    `SELECT archived_at IS NOT NULL AS archived FROM venues
      WHERE workspace_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL AND id IS DISTINCT FROM $3 LIMIT 1`,
    [workspaceId, name, id ?? null],
  );
  if (rows[0]) {
    const message = rows[0].archived ? "An archived venue has this name. Bring it back instead." : "You already have a venue with this name";
    throw new AppError(409, "DUPLICATE_VENUE", message, { name: message });
  }
}

async function checkType(db: Queryable, workspaceId: string, type: string | null | undefined, current?: string | null) {
  if (type) await assertOption(db, workspaceId, "venue_type", type, "venueType", current);
}

export async function createVenue(db: Db, ctx: MemberContext, input: VenueFields & { name: string }): Promise<Venue> {
  requireManage(ctx);
  await checkType(db, ctx.workspaceId, input.venueType);
  await checkName(db, ctx.workspaceId, input.name);
  const cols = VENUE_COLUMNS.filter(([key]) => input[key] !== undefined);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO venues (workspace_id, created_by${cols.map(([, c]) => `, ${c}`).join("")})
     VALUES ($1, $2${cols.map((_, i) => `, $${i + 3}`).join("")}) RETURNING id`,
    [ctx.workspaceId, ctx.userId, ...cols.map(([key]) => input[key])],
  );
  const id = rows[0]!.id;
  await logActivity(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "venue.added", entityType: "venue", entityId: id, meta: { name: input.name } });
  return getVenue(db, ctx, id);
}

export async function updateVenue(db: Db, ctx: MemberContext, id: string, input: VenueFields): Promise<Venue> {
  requireManage(ctx);
  const current = await db.query<{ name: string; venue_type: string | null; archived_at: Date | null }>(
    `SELECT name, venue_type, archived_at FROM venues WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [id, ctx.workspaceId],
  );
  const was = current.rows[0];
  if (!was) throw notFound("This venue");
  await checkType(db, ctx.workspaceId, input.venueType, was.venue_type);
  await checkName(db, ctx.workspaceId, input.name, id);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of VENUE_COLUMNS) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (input.archived !== undefined) {
    values.push(input.archived ? (was.archived_at ?? new Date()) : null);
    sets.push(`archived_at = $${values.length}`);
  }
  if (sets.length) {
    values.push(id, ctx.workspaceId);
    await db.query(`UPDATE venues SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND workspace_id = $${values.length}`, values);
    // A new name follows onto the events at the venue, so they stay at it.
    if (input.name && input.name !== was.name) {
      for (const table of ["events", "event_functions"]) {
        await db.query(`UPDATE ${table} SET venue = $3 WHERE workspace_id = $1 AND lower(trim(venue)) = lower($2)`, [ctx.workspaceId, was.name, input.name]);
      }
    }
    const base = { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, entityType: "venue", entityId: id };
    const name = input.name ?? was.name;
    const archiving = input.archived !== undefined && input.archived !== (was.archived_at !== null);
    if (archiving) await logActivity(db, { ...base, action: input.archived ? "venue.archived" : "venue.restored", meta: { name } });
    if (sets.length > (input.archived !== undefined ? 1 : 0)) await logActivity(db, { ...base, action: "venue.updated", meta: { name } });
  }
  return getVenue(db, ctx, id);
}
