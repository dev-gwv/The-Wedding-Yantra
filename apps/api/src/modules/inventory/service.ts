import { can, eventScope } from "@wedding-yantra/core";
import type { InventoryBooking, InventoryBookingStatus, InventoryItem } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

/** Everyone who sees all events sees the stock; owners and managers plan it; the crew loads it. */
const requireView = (ctx: MemberContext) => {
  if (eventScope(ctx.role) !== "all") throw forbidden("Your role doesn't include inventory");
};
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "events.manage")) throw forbidden("Only the owner or a manager can change the stock");
};
const requireCrew = (ctx: MemberContext) => {
  requireView(ctx);
  if (!can(ctx.role, "tasks.work")) throw forbidden("Your role doesn't include loading stock");
};

/** Bookings that hold stock on their days: not returned, on an event that's still on. */
const HOLDING = `o.deleted_at IS NULL AND o.status <> 'returned'
  AND EXISTS (SELECT 1 FROM events oe WHERE oe.id = o.event_id AND oe.deleted_at IS NULL AND oe.status <> 'cancelled')`;

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface ItemRow {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  notes: string | null;
  out_now: string;
  available: number | null;
}

const toItem = (r: ItemRow): InventoryItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  quantity: r.quantity,
  notes: r.notes,
  outNow: Number(r.out_now),
  available: r.available === null ? null : Math.max(0, Number(r.available)),
});

/** The stock; with dates, how many of each are free across all of those days. */
export async function listItems(db: Queryable, ctx: MemberContext, range: { from?: string; to?: string } = {}, id?: string): Promise<InventoryItem[]> {
  requireView(ctx);
  const dated = !!(range.from && range.to);
  if (dated && range.to! < range.from!) throw new AppError(400, "VALIDATION_ERROR", "The last day is before the first", { to: "Pick a later day" });
  const { rows } = await db.query<ItemRow>(
    `SELECT i.id, i.name, i.category, i.quantity, i.notes,
            (SELECT coalesce(sum(o.quantity), 0) FROM inventory_bookings o WHERE o.item_id = i.id AND o.status = 'out' AND ${HOLDING}) AS out_now,
            ${
              dated
                ? `i.quantity - (SELECT coalesce(max(held), 0) FROM (
                     SELECT (SELECT coalesce(sum(o.quantity), 0) FROM inventory_bookings o
                              WHERE o.item_id = i.id AND ${HOLDING} AND d::date BETWEEN o.from_date AND o.to_date) AS held
                       FROM generate_series($2::date, $3::date, interval '1 day') d) x)`
                : "NULL::int"
            } AS available
       FROM inventory_items i
      WHERE i.workspace_id = $1 AND i.deleted_at IS NULL ${id ? `AND i.id = $${dated ? 4 : 2}` : ""}
      ORDER BY i.category NULLS LAST, i.name`,
    [ctx.workspaceId, ...(dated ? [range.from, range.to] : []), ...(id ? [id] : [])],
  );
  return rows.map(toItem);
}

async function getItem(db: Queryable, ctx: MemberContext, id: string): Promise<InventoryItem> {
  const [item] = await listItems(db, ctx, {}, id);
  if (!item) throw notFound("This item");
  return item;
}

export interface ItemFields {
  name?: string;
  category?: string | null;
  quantity?: number;
  notes?: string | null;
}

export async function createItem(db: Db, ctx: MemberContext, input: ItemFields & { name: string; quantity: number }): Promise<InventoryItem> {
  requireManage(ctx);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO inventory_items (workspace_id, name, category, quantity, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [ctx.workspaceId, input.name, input.category ?? null, input.quantity, input.notes ?? null, ctx.userId],
  );
  return getItem(db, ctx, rows[0]!.id);
}

export async function updateItem(db: Db, ctx: MemberContext, id: string, input: ItemFields): Promise<InventoryItem> {
  requireManage(ctx);
  const map: [keyof ItemFields, string][] = [
    ["name", "name"],
    ["category", "category"],
    ["quantity", "quantity"],
    ["notes", "notes"],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of map) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length) {
    values.push(id, ctx.workspaceId);
    const r = await db.query(
      `UPDATE inventory_items SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND workspace_id = $${values.length} AND deleted_at IS NULL`,
      values,
    );
    if (!r.rowCount) throw notFound("This item");
  }
  return getItem(db, ctx, id);
}

/** An item set aside for a coming event, or out right now, stays until it's back. */
export async function deleteItem(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  await getItem(db, ctx, id);
  const held = await db.query(
    `SELECT 1 FROM inventory_bookings o WHERE o.item_id = $1 AND ${HOLDING}
        AND (o.status = 'out' OR o.to_date >= (SELECT (now() AT TIME ZONE timezone)::date FROM workspaces WHERE id = $2))`,
    [id, ctx.workspaceId],
  );
  if (held.rowCount) throw new AppError(409, "ITEM_IN_USE", "This item is set aside for an event or still out. Free it first.");
  await db.query(`UPDATE inventory_items SET deleted_at = now() WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

interface BookingRow {
  id: string;
  item_id: string;
  item_name: string;
  item_category: string | null;
  event_id: string;
  event_title: string;
  quantity: number;
  from_date: string;
  to_date: string;
  status: InventoryBookingStatus;
  missing: number;
  short: number;
}

/** `short`: on the busiest of its days, how many more are needed than the business owns. */
const BOOKING_SELECT = `
  SELECT b.id, b.item_id, i.name AS item_name, i.category AS item_category, b.event_id, e.title AS event_title,
         b.quantity, b.from_date::text AS from_date, b.to_date::text AS to_date, b.status, b.missing,
         CASE WHEN b.status = 'returned' OR e.status = 'cancelled' THEN 0 ELSE greatest(0, (
           SELECT max((SELECT coalesce(sum(o.quantity), 0) FROM inventory_bookings o
                        WHERE o.item_id = b.item_id AND ${HOLDING} AND d::date BETWEEN o.from_date AND o.to_date))
             FROM generate_series(b.from_date, b.to_date, interval '1 day') d
         ) - i.quantity) END::int AS short
    FROM inventory_bookings b
    JOIN inventory_items i ON i.id = b.item_id
    JOIN events e ON e.id = b.event_id AND e.deleted_at IS NULL`;

const toBooking = (r: BookingRow): InventoryBooking => ({
  id: r.id,
  itemId: r.item_id,
  itemName: r.item_name,
  itemCategory: r.item_category,
  eventId: r.event_id,
  eventTitle: r.event_title,
  quantity: r.quantity,
  fromDate: r.from_date,
  toDate: r.to_date,
  status: r.status,
  missing: r.missing,
  short: r.short,
});

export async function listBookings(db: Queryable, ctx: MemberContext, filters: { eventId?: string; itemId?: string } = {}): Promise<InventoryBooking[]> {
  requireView(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const where = ["b.workspace_id = $1", "b.deleted_at IS NULL"];
  if (filters.eventId) {
    params.push(filters.eventId);
    where.push(`b.event_id = $${params.length}`);
  }
  if (filters.itemId) {
    params.push(filters.itemId);
    where.push(`b.item_id = $${params.length}`);
  }
  const { rows } = await db.query<BookingRow>(
    `${BOOKING_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.from_date, i.category NULLS LAST, i.name LIMIT 500`,
    params,
  );
  return rows.map(toBooking);
}

async function loadBooking(db: Queryable, ctx: MemberContext, id: string): Promise<InventoryBooking> {
  const { rows } = await db.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1 AND b.workspace_id = $2 AND b.deleted_at IS NULL`, [id, ctx.workspaceId]);
  if (!rows[0]) throw notFound("This booking");
  return toBooking(rows[0]);
}

const dateError = () => new AppError(400, "VALIDATION_ERROR", "The last day is before the first", { toDate: "Pick a later day" });

/** Sets items aside for an event, on its days unless others are given. A shortage warns, it doesn't stop you. */
export async function createBooking(
  db: Db,
  ctx: MemberContext,
  input: { itemId: string; eventId: string; quantity: number; fromDate?: string; toDate?: string },
): Promise<InventoryBooking> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const item = await tx.query(`SELECT 1 FROM inventory_items WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [input.itemId, ctx.workspaceId]);
    if (!item.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose an item from your stock", { itemId: "Choose an item" });
    const ev = await tx.query<{ start: string | null; end: string | null }>(
      `SELECT (SELECT min(date)::text FROM event_functions WHERE event_id = e.id) AS start,
              (SELECT max(date)::text FROM event_functions WHERE event_id = e.id) AS "end"
         FROM events e WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL`,
      [input.eventId, ctx.workspaceId],
    );
    if (!ev.rows[0]) throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
    const from = input.fromDate ?? ev.rows[0].start;
    const to = input.toDate ?? ev.rows[0].end ?? from;
    if (!from || !to) {
      throw new AppError(400, "VALIDATION_ERROR", "Give the event its dates first, or pick the days", { fromDate: "Pick the first day" });
    }
    if (to < from) throw dateError();
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO inventory_bookings (workspace_id, item_id, event_id, quantity, from_date, to_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.workspaceId, input.itemId, input.eventId, input.quantity, from, to, ctx.userId],
    );
    return loadBooking(tx, ctx, rows[0]!.id);
  });
}

/**
 * Planning (quantity and days) is for owners and managers. The crew marks it out and
 * back; what didn't come back comes off the stock, and goes back on if that's undone.
 */
export async function updateBooking(
  db: Db,
  ctx: MemberContext,
  id: string,
  input: { quantity?: number; fromDate?: string; toDate?: string; status?: InventoryBookingStatus; missing?: number },
): Promise<InventoryBooking> {
  const planning = input.quantity !== undefined || input.fromDate !== undefined || input.toDate !== undefined;
  if (planning) requireManage(ctx);
  else requireCrew(ctx);
  return withTransaction(db, async (tx) => {
    const current = await tx.query<{ item_id: string; quantity: number; from_date: string; to_date: string; status: InventoryBookingStatus; missing: number }>(
      `SELECT item_id, quantity, from_date::text AS from_date, to_date::text AS to_date, status, missing
         FROM inventory_bookings WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [id, ctx.workspaceId],
    );
    const c = current.rows[0];
    if (!c) throw notFound("This booking");
    const quantity = input.quantity ?? c.quantity;
    const from = input.fromDate ?? c.from_date;
    const to = input.toDate ?? c.to_date;
    if (to < from) throw dateError();
    const status = input.status ?? c.status;
    const missing = status === "returned" ? (input.missing ?? c.missing) : 0;
    if (missing > quantity) throw new AppError(400, "VALIDATION_ERROR", "More missing than were taken", { missing: `At most ${quantity}` });

    // Keep the stock count honest: take off what's newly missing, put back what isn't any more.
    const change = missing - (c.status === "returned" ? c.missing : 0);
    if (change !== 0) {
      await tx.query(`UPDATE inventory_items SET quantity = greatest(0, quantity - $2) WHERE id = $1`, [c.item_id, change]);
    }
    await tx.query(`UPDATE inventory_bookings SET quantity = $2, from_date = $3, to_date = $4, status = $5, missing = $6 WHERE id = $1`, [
      id,
      quantity,
      from,
      to,
      status,
      missing,
    ]);
    return loadBooking(tx, ctx, id);
  });
}

export async function deleteBooking(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  const b = await loadBooking(db, ctx, id);
  if (b.status === "out") throw new AppError(409, "BOOKING_OUT", "These are out right now. Mark them back first.");
  await db.query(`UPDATE inventory_bookings SET deleted_at = now() WHERE id = $1`, [id]);
}
