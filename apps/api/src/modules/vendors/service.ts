import { can, round2, type PaymentMethod } from "@wedding-yantra/core";
import type { Payout, PayoutStatus, Vendor, VendorSummary } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { requireMoneyView } from "../money/access.js";

/** Vendors and what they're owed: owners and managers run it, the accountant reads it. */
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "expenses.approve")) throw forbidden("Only the owner or a manager can do this");
};

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

interface VendorRow {
  id: string;
  name: string;
  service: string | null;
  phone: string | null;
  upi_id: string | null;
  notes: string | null;
  owed: string;
  paid: string;
}

const VENDOR_SELECT = `
  SELECT v.id, v.name, v.service, v.phone, v.upi_id, v.notes,
         coalesce(sum(p.amount) FILTER (WHERE p.status = 'owed'), 0) AS owed,
         coalesce(sum(p.amount) FILTER (WHERE p.status = 'paid'), 0) AS paid
    FROM vendors v
    LEFT JOIN payouts p ON p.vendor_id = v.id AND p.deleted_at IS NULL`;

const toSummary = (r: VendorRow): VendorSummary => ({
  id: r.id,
  name: r.name,
  service: r.service,
  phone: r.phone,
  upiId: r.upi_id,
  owed: Number(r.owed),
  paid: Number(r.paid),
});

export async function listVendors(db: Queryable, ctx: MemberContext): Promise<VendorSummary[]> {
  requireMoneyView(ctx);
  const { rows } = await db.query<VendorRow>(
    `${VENDOR_SELECT} WHERE v.workspace_id = $1 AND v.deleted_at IS NULL GROUP BY v.id
      ORDER BY coalesce(sum(p.amount) FILTER (WHERE p.status = 'owed'), 0) DESC, v.name`,
    [ctx.workspaceId],
  );
  return rows.map(toSummary);
}

export async function getVendor(db: Queryable, ctx: MemberContext, id: string): Promise<Vendor> {
  requireMoneyView(ctx);
  const { rows } = await db.query<VendorRow>(`${VENDOR_SELECT} WHERE v.id = $1 AND v.workspace_id = $2 AND v.deleted_at IS NULL GROUP BY v.id`, [
    id,
    ctx.workspaceId,
  ]);
  if (!rows[0]) throw notFound("This vendor");
  return { ...toSummary(rows[0]), notes: rows[0].notes, payouts: await listPayouts(db, ctx, { vendorId: id }) };
}

export interface VendorFields {
  name?: string;
  service?: string | null;
  phone?: string | null;
  upiId?: string | null;
  notes?: string | null;
}
const VENDOR_COLUMNS: [keyof VendorFields, string][] = [
  ["name", "name"],
  ["service", "service"],
  ["phone", "phone"],
  ["upiId", "upi_id"],
  ["notes", "notes"],
];

export async function createVendor(db: Db, ctx: MemberContext, input: VendorFields & { name: string }): Promise<Vendor> {
  requireManage(ctx);
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO vendors (workspace_id, name, service, phone, upi_id, notes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ctx.workspaceId, input.name, input.service ?? null, input.phone ?? null, input.upiId ?? null, input.notes ?? null, ctx.userId],
  );
  return getVendor(db, ctx, rows[0]!.id);
}

export async function updateVendor(db: Db, ctx: MemberContext, id: string, input: VendorFields): Promise<Vendor> {
  requireManage(ctx);
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of VENDOR_COLUMNS) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length) {
    values.push(id, ctx.workspaceId);
    const r = await db.query(
      `UPDATE vendors SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND workspace_id = $${values.length} AND deleted_at IS NULL`,
      values,
    );
    if (!r.rowCount) throw notFound("This vendor");
  }
  return getVendor(db, ctx, id);
}

/** A vendor with money still owed stays, so nothing owed is lost. */
export async function deleteVendor(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  const vendor = await getVendor(db, ctx, id);
  if (vendor.owed > 0) throw new AppError(409, "VENDOR_OWED", `You still owe ${vendor.name}. Pay or remove those first.`);
  await db.query(`UPDATE vendors SET deleted_at = now() WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

interface PayoutRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_phone: string | null;
  vendor_upi_id: string | null;
  event_id: string | null;
  event_title: string | null;
  description: string;
  amount: string;
  due_date: string | null;
  status: PayoutStatus;
  paid_on: string | null;
  method: PaymentMethod | null;
  reference: string | null;
  expense_id: string | null;
  created_at: Date;
  today: string;
}

const PAYOUT_SELECT = `
  SELECT p.id, p.vendor_id, v.name AS vendor_name, v.phone AS vendor_phone, v.upi_id AS vendor_upi_id,
         p.event_id, e.title AS event_title, p.description, p.amount, p.due_date::text AS due_date, p.status,
         p.paid_on::text AS paid_on, p.method, p.reference, p.expense_id, p.created_at,
         (now() AT TIME ZONE w.timezone)::date::text AS today
    FROM payouts p
    JOIN workspaces w ON w.id = p.workspace_id
    JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN events e ON e.id = p.event_id`;

const toPayout = (r: PayoutRow): Payout => ({
  id: r.id,
  vendorId: r.vendor_id,
  vendorName: r.vendor_name,
  vendorPhone: r.vendor_phone,
  vendorUpiId: r.vendor_upi_id,
  eventId: r.event_id,
  eventTitle: r.event_title,
  description: r.description,
  amount: Number(r.amount),
  dueDate: r.due_date,
  status: r.status,
  late: r.status === "owed" && r.due_date !== null && r.due_date < r.today,
  paidOn: r.paid_on,
  method: r.method,
  reference: r.reference,
  createdAt: r.created_at.toISOString(),
});

export async function listPayouts(
  db: Queryable,
  ctx: MemberContext,
  filters: { status?: PayoutStatus; eventId?: string; vendorId?: string } = {},
): Promise<Payout[]> {
  requireMoneyView(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["p.workspace_id = $1", "p.deleted_at IS NULL"];
  if (filters.status) where.push(`p.status = ${add(filters.status)}`);
  if (filters.eventId) where.push(`p.event_id = ${add(filters.eventId)}`);
  if (filters.vendorId) where.push(`p.vendor_id = ${add(filters.vendorId)}`);
  const order = filters.status === "paid" ? "p.paid_on DESC, p.created_at DESC LIMIT 200" : "(p.status = 'paid'), p.due_date NULLS LAST, p.created_at LIMIT 500";
  const { rows } = await db.query<PayoutRow>(`${PAYOUT_SELECT} WHERE ${where.join(" AND ")} ORDER BY ${order}`, params);
  return rows.map(toPayout);
}

async function loadPayout(db: Queryable, ctx: MemberContext, id: string, lock = false): Promise<PayoutRow> {
  const { rows } = await db.query<PayoutRow>(
    `${PAYOUT_SELECT} WHERE p.id = $1 AND p.workspace_id = $2 AND p.deleted_at IS NULL${lock ? " FOR UPDATE OF p" : ""}`,
    [id, ctx.workspaceId],
  );
  if (!rows[0]) throw notFound("This payout");
  return rows[0];
}

async function assertRefs(db: Queryable, ctx: MemberContext, input: { vendorId?: string; eventId?: string | null }) {
  if (input.vendorId) {
    const v = await db.query(`SELECT 1 FROM vendors WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [input.vendorId, ctx.workspaceId]);
    if (!v.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a vendor from your list", { vendorId: "Choose a vendor" });
  }
  if (input.eventId) {
    const e = await db.query(`SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [input.eventId, ctx.workspaceId]);
    if (!e.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
  }
}

export interface PayoutFields {
  vendorId?: string;
  eventId?: string | null;
  description?: string;
  amount?: number;
  dueDate?: string | null;
}

export async function createPayout(db: Db, ctx: MemberContext, input: PayoutFields & { vendorId: string; description: string; amount: number }): Promise<Payout> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    await assertRefs(tx, ctx, input);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO payouts (workspace_id, vendor_id, event_id, description, amount, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.workspaceId, input.vendorId, input.eventId ?? null, input.description, input.amount, input.dueDate ?? null, ctx.userId],
    );
    return toPayout(await loadPayout(tx, ctx, rows[0]!.id));
  });
}

/** Changing a paid payout keeps its expense in step, so profit stays right. */
export async function updatePayout(db: Db, ctx: MemberContext, id: string, input: PayoutFields): Promise<Payout> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const current = await loadPayout(tx, ctx, id, true);
    await assertRefs(tx, ctx, input);
    const map: [keyof PayoutFields, string][] = [
      ["vendorId", "vendor_id"],
      ["eventId", "event_id"],
      ["description", "description"],
      ["amount", "amount"],
      ["dueDate", "due_date"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of map) {
      if (input[key] === undefined) continue;
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length) {
      values.push(id);
      await tx.query(`UPDATE payouts SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    }
    if (current.expense_id) await syncExpense(tx, ctx, id, current.expense_id);
    return toPayout(await loadPayout(tx, ctx, id));
  });
}

/** Writes the payout's amount, event, vendor and note onto its expense. */
async function syncExpense(db: Queryable, ctx: MemberContext, payoutId: string, expenseId: string) {
  const p = await loadPayout(db, ctx, payoutId);
  await db.query(
    `UPDATE expenses SET amount = $2, event_id = $3, paid_to = $4, note = $5, spent_on = $6, method = $7 WHERE id = $1`,
    [expenseId, p.amount, p.event_id, p.vendor_name, p.description, p.paid_on, p.method],
  );
}

/** Paid: records the money as a "Vendors & helpers" expense on the event, approved. */
export async function payPayout(
  db: Db,
  ctx: MemberContext,
  id: string,
  input: { paidOn: string; method: PaymentMethod; reference?: string | null },
): Promise<Payout> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const p = await loadPayout(tx, ctx, id, true);
    if (p.status === "paid") throw new AppError(409, "ALREADY_PAID", "This is already marked paid.");
    const expense = await tx.query<{ id: string }>(
      `INSERT INTO expenses (workspace_id, event_id, category, amount, spent_on, paid_to, method, note, status, submitted_by, reviewed_by, reviewed_at)
       VALUES ($1, $2, 'vendor', $3, $4, $5, $6, $7, 'approved', $8, $8, now()) RETURNING id`,
      [ctx.workspaceId, p.event_id, p.amount, input.paidOn, p.vendor_name, input.method, p.description, ctx.userId],
    );
    await tx.query(`UPDATE payouts SET status = 'paid', paid_on = $2, method = $3, reference = $4, expense_id = $5 WHERE id = $1`, [
      id,
      input.paidOn,
      input.method,
      input.reference ?? null,
      expense.rows[0]!.id,
    ]);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "payout.paid",
      entityType: "payout",
      entityId: id,
      meta: { vendor: p.vendor_name, amount: Number(p.amount), eventId: p.event_id },
    });
    return toPayout(await loadPayout(tx, ctx, id));
  });
}

/** Paid by mistake: owed again, and its expense goes. */
export async function unpayPayout(db: Db, ctx: MemberContext, id: string): Promise<Payout> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const p = await loadPayout(tx, ctx, id, true);
    if (p.status !== "paid") return toPayout(p);
    if (p.expense_id) await tx.query(`UPDATE expenses SET deleted_at = now() WHERE id = $1`, [p.expense_id]);
    await tx.query(`UPDATE payouts SET status = 'owed', paid_on = NULL, method = NULL, reference = NULL, expense_id = NULL WHERE id = $1`, [id]);
    return toPayout(await loadPayout(tx, ctx, id));
  });
}

export async function deletePayout(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  await withTransaction(db, async (tx) => {
    const p = await loadPayout(tx, ctx, id, true);
    if (p.expense_id) await tx.query(`UPDATE expenses SET deleted_at = now() WHERE id = $1`, [p.expense_id]);
    await tx.query(`UPDATE payouts SET deleted_at = now() WHERE id = $1`, [id]);
  });
}

/** Still owed to vendors: everything, or one event's. */
export async function toPay(db: Queryable, workspaceId: string, eventId?: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT coalesce(sum(amount), 0) AS n FROM payouts
      WHERE workspace_id = $1 AND deleted_at IS NULL AND status = 'owed' AND ($2::uuid IS NULL OR event_id = $2)`,
    [workspaceId, eventId ?? null],
  );
  return round2(Number(rows[0]?.n ?? 0));
}
