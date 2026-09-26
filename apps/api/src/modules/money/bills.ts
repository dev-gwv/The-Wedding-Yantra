import { randomBytes } from "node:crypto";
import {
  billNumber,
  computeBillTotals,
  financialYear,
  formatMoney,
  instalmentAmounts,
  planStatus,
  prepareBillLines,
  receiptNumber,
  round2,
  stateFromGstin,
  type BillTaxRow,
  type PlanPartInput,
} from "@wedding-yantra/core";
import type {
  BankDetails,
  InvoiceDesign,
  Bill,
  BillDraft,
  BillListSummary,
  BillItem,
  BillStatus,
  BillSummary,
  PayState,
  PublicBill,
  ServiceUnit,
} from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { nextNumber } from "../bookings/quotes.js";
import { requireBillsManage as requireManage, requireMoneyView } from "./access.js";
import { insertPayment, listPayments } from "./payments.js";
import { requirePaymentsRecord } from "./access.js";
import { upsertClientForLead } from "../sales/leads.js";
import { optionJoin } from "../options/service.js";
import { logoPath } from "../files/logo.js";
import { accountForBill, defaultAccountId, defaultText } from "../invoicing/service.js";

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface BillRow {
  id: string;
  workspace_id: string;
  fy: string;
  number: string;
  status: BillStatus;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  event_id: string | null;
  event_title: string | null;
  issue_date: string;
  due_date: string | null;
  total: string;
  received: string;
  today: string;
  created_at: Date;
  bill_to_name: string;
  bill_to_phone: string | null;
  bill_to_address: string | null;
  bill_to_gstin: string | null;
  seller_gstin: string | null;
  place_of_supply: string | null;
  inter_state: boolean;
  subtotal: string;
  discount: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  round_off: string;
  notes: string | null;
  terms: string | null;
  share_token: string;
  quote_id: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  subject: string | null;
  prices_include_gst: boolean;
  discount_percent: string | null;
  bank_account_id: string | null;
  bank_details: BankDetails | null;
  plan_due_by_today: string;
}

export const BILL_SELECT = `
  SELECT b.id, b.workspace_id, b.fy, b.number, b.status, b.client_id, coalesce(c.name, b.bill_to_name) AS client_name,
         coalesce(c.phone, b.bill_to_phone) AS client_phone,
         b.event_id, e.title AS event_title, b.issue_date::text AS issue_date, b.due_date::text AS due_date,
         b.total, b.created_at,
         coalesce((SELECT sum(p.amount) FROM payments p WHERE p.bill_id = b.id AND p.deleted_at IS NULL), 0) AS received,
         (now() AT TIME ZONE w.timezone)::date::text AS today,
         b.bill_to_name, b.bill_to_phone, b.bill_to_address, b.bill_to_gstin, b.seller_gstin,
         b.place_of_supply, b.inter_state, b.subtotal, b.discount, b.taxable, b.cgst, b.sgst, b.igst,
         b.tax, b.round_off, b.notes, b.terms, b.share_token, b.quote_id, b.cancelled_at, b.cancel_reason,
         b.subject, b.prices_include_gst, b.discount_percent, b.bank_account_id, b.bank_details,
         coalesce((SELECT sum(i.amount) FROM bill_instalments i
                    WHERE i.bill_id = b.id AND i.due_date < (now() AT TIME ZONE w.timezone)::date), 0) AS plan_due_by_today
    FROM bills b
    JOIN workspaces w ON w.id = b.workspace_id
    LEFT JOIN clients c ON c.id = b.client_id
    LEFT JOIN events e ON e.id = b.event_id`;

export function toBillSummary(r: BillRow): BillSummary {
  const total = Number(r.total);
  const received = Number(r.received);
  const cancelled = r.status === "cancelled";
  const due = cancelled ? 0 : Math.max(round2(total - received), 0);
  const payState: PayState = received <= 0 ? "unpaid" : received < total ? "part_paid" : "paid";
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    payState,
    // Late on the final date, or behind on a part of the payment plan whose date has passed.
    overdue: due > 0 && ((r.due_date !== null && r.due_date < r.today) || Number(r.plan_due_by_today) > received + 0.5),
    clientId: r.client_id,
    clientName: r.client_name,
    eventId: r.event_id,
    eventTitle: r.event_title,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    total,
    received,
    due,
    shareToken: r.share_token,
    createdAt: r.created_at.toISOString(),
  };
}

async function loadItems(db: Queryable, billId: string): Promise<(BillItem & { taxRate: number })[]> {
  const { rows } = await db.query<{
    id: string;
    catalogue_item_id: string | null;
    name: string;
    description: string | null;
    sac: string | null;
    unit: ServiceUnit;
    quantity: string;
    rate: string;
    tax_rate: string;
    amount: string;
    discount: string;
    taxable: string;
    cgst: string;
    sgst: string;
    igst: string;
  }>(
    `SELECT id, catalogue_item_id, name, description, sac, unit, quantity, rate, tax_rate, amount, discount, taxable, cgst, sgst, igst
       FROM bill_items WHERE bill_id = $1 ORDER BY position`,
    [billId],
  );
  return rows.map((r) => ({
    id: r.id,
    catalogueItemId: r.catalogue_item_id,
    name: r.name,
    description: r.description,
    sac: r.sac,
    unit: r.unit,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    taxRate: Number(r.tax_rate),
    amount: Number(r.amount),
    discount: Number(r.discount),
    taxable: Number(r.taxable),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    igst: Number(r.igst),
  }));
}

/** GST summary rows from the saved lines, so old bills never change. */
function taxRows(items: BillItem[]): BillTaxRow[] {
  const rows = new Map<number, BillTaxRow>();
  for (const i of items) {
    if (i.taxRate === 0) continue;
    const row = rows.get(i.taxRate) ?? { rate: i.taxRate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    rows.set(i.taxRate, {
      rate: i.taxRate,
      taxable: round2(row.taxable + i.taxable),
      cgst: round2(row.cgst + i.cgst),
      sgst: round2(row.sgst + i.sgst),
      igst: round2(row.igst + i.igst),
    });
  }
  return [...rows.values()].sort((a, b) => a.rate - b.rate);
}

async function loadPlan(db: Queryable, billId: string): Promise<{ label: string; percent: number | null; amount: number; dueDate: string | null }[]> {
  const { rows } = await db.query<{ label: string; percent: string | null; amount: string; due_date: string | null }>(
    `SELECT label, percent, amount, due_date::text AS due_date FROM bill_instalments WHERE bill_id = $1 ORDER BY position`,
    [billId],
  );
  return rows.map((p) => ({ label: p.label, percent: p.percent === null ? null : Number(p.percent), amount: Number(p.amount), dueDate: p.due_date }));
}

async function toBill(db: Queryable, ctx: MemberContext | null, r: BillRow): Promise<Bill> {
  const items = await loadItems(db, r.id);
  const summary = toBillSummary(r);
  const cancelled = r.status === "cancelled";
  return {
    ...summary,
    plan: planStatus(await loadPlan(db, r.id), cancelled ? 0 : summary.received, r.today),
    dueNow: cancelled ? 0 : Math.min(summary.due, Math.max(0, round2(Number(r.plan_due_by_today) - summary.received))),
    billTo: { name: r.bill_to_name, phone: r.bill_to_phone, address: r.bill_to_address, gstin: r.bill_to_gstin },
    subject: r.subject,
    pricesIncludeGst: r.prices_include_gst,
    discountPercent: r.discount_percent === null ? null : Number(r.discount_percent),
    sellerGstin: r.seller_gstin,
    chargesGst: r.seller_gstin !== null,
    placeOfSupply: r.place_of_supply,
    interState: r.inter_state,
    items,
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    taxable: Number(r.taxable),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    igst: Number(r.igst),
    tax: Number(r.tax),
    roundOff: Number(r.round_off),
    byRate: taxRows(items),
    notes: r.notes,
    terms: r.terms,
    bankAccountId: r.bank_account_id,
    bank: r.bank_details,
    quoteId: r.quote_id,
    payments: ctx ? await listPayments(db, ctx, { billId: r.id }) : [],
    cancelledAt: r.cancelled_at?.toISOString() ?? null,
    cancelReason: r.cancel_reason,
  };
}

async function loadRow(db: Queryable, workspaceId: string, billId: string, lock = false): Promise<BillRow> {
  const { rows } = await db.query<BillRow>(
    `${BILL_SELECT} WHERE b.id = $1 AND b.workspace_id = $2${lock ? " FOR UPDATE OF b" : ""}`,
    [billId, workspaceId],
  );
  if (!rows[0]) throw notFound("This bill");
  return rows[0];
}

export async function getBill(db: Queryable, ctx: MemberContext, billId: string): Promise<Bill> {
  requireMoneyView(ctx);
  return toBill(db, ctx, await loadRow(db, ctx.workspaceId, billId));
}

export interface BillFilters {
  clientId?: string;
  eventId?: string;
  status?: "open" | "overdue" | "paid" | "cancelled";
  q?: string;
  from?: string;
  to?: string;
}

export async function listBills(db: Queryable, ctx: MemberContext, filters: BillFilters = {}, limit = 500): Promise<BillSummary[]> {
  requireMoneyView(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const where = ["b.workspace_id = $1"];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filters.clientId) add("b.client_id = ?", filters.clientId);
  if (filters.eventId) add("b.event_id = ?", filters.eventId);
  if (filters.from) add("b.issue_date >= ?", filters.from);
  if (filters.to) add("b.issue_date <= ?", filters.to);
  if (filters.q) add("(b.number ILIKE ? OR coalesce(c.name, b.bill_to_name) ILIKE ? OR b.subject ILIKE ? OR e.title ILIKE ?)", `%${filters.q.replace(/[%_]/g, "")}%`);
  if (filters.status === "cancelled") where.push("b.status = 'cancelled'");
  else if (filters.status) where.push("b.status = 'issued'");
  const { rows } = await db.query<BillRow>(
    `${BILL_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.issue_date DESC, b.fy DESC, b.seq DESC LIMIT ${limit}`,
    params,
  );
  const list = rows.map(toBillSummary);
  if (filters.status === "open") return list.filter((b) => b.due > 0);
  if (filters.status === "overdue") return list.filter((b) => b.overdue);
  if (filters.status === "paid") return list.filter((b) => b.due === 0);
  return list;
}

/** Totals for exactly what a list shows. Cancelled invoices only count when that's what's asked for. */
export async function billsSummary(db: Queryable, ctx: MemberContext, filters: BillFilters = {}): Promise<BillListSummary> {
  const list = (await listBills(db, ctx, filters, 5000)).filter((b) => filters.status === "cancelled" || b.status !== "cancelled");
  const add = (pick: (b: BillSummary) => number) => round2(list.reduce((a, b) => a + pick(b), 0));
  return {
    count: list.length,
    total: add((b) => b.total),
    received: add((b) => Math.min(b.received, b.total)),
    due: add((b) => b.due),
    overdue: add((b) => (b.overdue ? b.due : 0)),
  };
}

// ---------------------------------------------------------------------------
// Starting values for a new bill
// ---------------------------------------------------------------------------

interface WorkspaceMoney {
  gstin: string | null;
  bill_prefix: string;
  bill_terms: string | null;
  today: string;
}

async function workspaceMoney(db: Queryable, workspaceId: string): Promise<WorkspaceMoney> {
  const { rows } = await db.query<WorkspaceMoney>(
    `SELECT gstin, bill_prefix, bill_terms, (now() AT TIME ZONE timezone)::date::text AS today FROM workspaces WHERE id = $1`,
    [workspaceId],
  );
  return rows[0]!;
}

type DraftLine = BillDraft["items"][number];

async function quoteLines(db: Queryable, quoteId: string): Promise<DraftLine[]> {
  const { rows } = await db.query<{
    catalogue_item_id: string | null;
    name: string;
    sac: string | null;
    unit: ServiceUnit;
    quantity: string;
    rate: string;
    tax_rate: string;
  }>(
    `SELECT qi.catalogue_item_id, qi.name, ci.sac, qi.unit, qi.quantity, qi.rate, qi.tax_rate
       FROM quote_items qi LEFT JOIN catalogue_items ci ON ci.id = qi.catalogue_item_id
      WHERE qi.quote_id = $1 ORDER BY qi.position`,
    [quoteId],
  );
  return rows.map((r) => ({
    catalogueItemId: r.catalogue_item_id,
    name: r.name,
    sac: r.sac,
    unit: r.unit,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    taxRate: Number(r.tax_rate),
  }));
}

/**
 * Everything a new bill starts with: the accepted quote's lines, who it's for, the due
 * date (the event day) and the business's usual terms. The owner can change any of it.
 */
export async function billDraft(
  db: Db,
  ctx: MemberContext,
  query: { eventId?: string; clientId?: string; quoteId?: string },
): Promise<BillDraft> {
  requireManage(ctx);
  const ws = await workspaceMoney(db, ctx.workspaceId);
  let eventId = query.eventId ?? null;
  let clientId = query.clientId ?? null;
  let quoteId = query.quoteId ?? null;
  let items: DraftLine[] = [];
  let discount = 0;
  let dueDate: string | null = null;

  if (quoteId) {
    const q = await db.query<{ event_id: string | null; client_id: string | null; discount: string }>(
      `SELECT event_id, client_id, discount FROM quotes WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      [quoteId, ctx.workspaceId],
    );
    if (!q.rows[0]) throw notFound("This quote");
    eventId = eventId ?? q.rows[0].event_id;
    clientId = clientId ?? q.rows[0].client_id;
  }

  let eventTitle: string | null = null;
  let eventValue: number | null = null;
  if (eventId) {
    const e = await db.query<{ client_id: string | null; title: string; value: string | null; start_date: string | null }>(
      `SELECT e.client_id, e.title, e.value, (SELECT min(date)::text FROM event_functions WHERE event_id = e.id) AS start_date
         FROM events e WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL`,
      [eventId, ctx.workspaceId],
    );
    const event = e.rows[0];
    if (!event) throw notFound("This event");
    clientId = clientId ?? event.client_id;
    eventTitle = event.title;
    eventValue = event.value === null ? null : Number(event.value);
    // Wedding businesses usually take the balance before the big day.
    dueDate = event.start_date && event.start_date > ws.today ? event.start_date : ws.today;
    if (!quoteId) {
      const accepted = await db.query<{ id: string }>(
        `SELECT id FROM quotes WHERE event_id = $1 AND status = 'accepted' AND deleted_at IS NULL ORDER BY accepted_at DESC LIMIT 1`,
        [eventId],
      );
      quoteId = accepted.rows[0]?.id ?? null;
    }
  }

  if (quoteId) {
    items = await quoteLines(db, quoteId);
    discount = Number(
      (await db.query<{ discount: string }>(`SELECT discount FROM quotes WHERE id = $1`, [quoteId])).rows[0]?.discount ?? 0,
    );
  } else if (eventTitle && eventValue) {
    items = [{ catalogueItemId: null, name: eventTitle, sac: null, unit: "event", quantity: 1, rate: eventValue, taxRate: 0 }];
  }

  let billTo: BillDraft["billTo"] = { name: "", phone: null, address: null, gstin: null };
  if (clientId) {
    const c = await db.query<{ name: string; phone: string | null; address: string | null; gstin: string | null }>(
      `SELECT c.name, c.phone,
              (SELECT bill_to_address FROM bills WHERE client_id = c.id AND bill_to_address IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS address,
              (SELECT bill_to_gstin FROM bills WHERE client_id = c.id AND bill_to_gstin IS NOT NULL ORDER BY created_at DESC LIMIT 1) AS gstin
         FROM clients c WHERE c.id = $1 AND c.workspace_id = $2 AND c.deleted_at IS NULL`,
      [clientId, ctx.workspaceId],
    );
    if (!c.rows[0]) throw notFound("This client");
    billTo = c.rows[0];
  }

  const advance = eventId
    ? Number(
        (
          await db.query<{ sum: string }>(
            `SELECT coalesce(sum(amount), 0) AS sum FROM payments WHERE event_id = $1 AND bill_id IS NULL AND deleted_at IS NULL`,
            [eventId],
          )
        ).rows[0]!.sum,
      )
    : 0;

  const chargesGst = ws.gstin !== null;
  return {
    eventId,
    clientId,
    quoteId,
    billTo,
    placeOfSupply: null,
    issueDate: ws.today,
    dueDate,
    items: chargesGst ? items : items.map((i) => ({ ...i, taxRate: 0 })),
    discount,
    notes: await defaultText(db, ctx.workspaceId, "note"),
    terms: (await defaultText(db, ctx.workspaceId, "terms")) ?? ws.bill_terms,
    bankAccountId: await defaultAccountId(db, ctx.workspaceId),
    chargesGst,
    homeState: stateFromGstin(ws.gstin),
    advance,
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface BillLineFields {
  catalogueItemId?: string | null;
  name: string;
  description?: string | null;
  sac?: string | null;
  unit: ServiceUnit;
  quantity: number;
  rate: number;
  taxRate: number;
}

interface BillFields {
  billTo: { name: string; phone?: string | null; address?: string | null; gstin?: string | null };
  subject?: string | null;
  chargesGst?: boolean;
  pricesIncludeGst?: boolean;
  discountPercent?: number | null;
  placeOfSupply?: string | null;
  issueDate: string;
  dueDate?: string | null;
  items: BillLineFields[];
  discount: number;
  notes?: string | null;
  terms?: string | null;
  bankAccountId?: string | null;
  instalments?: PlanPartInput[];
}

/**
 * Saves the payment plan for an invoice of this total. Percent parts are worked out from the
 * total; the parts must add up to it. With dates, the invoice is due on the last one.
 * Left out on an edit, a plan already there follows a new total when it's in percentages.
 */
async function savePlan(tx: Queryable, workspaceId: string, billId: string, parts: PlanPartInput[] | undefined, total: number) {
  let plan = parts;
  if (plan === undefined) {
    const existing = await loadPlan(tx, billId);
    if (!existing.length) return;
    plan = existing.map((p) => (p.percent !== null ? { ...p, amount: null } : { ...p, percent: null }));
  }
  await tx.query(`DELETE FROM bill_instalments WHERE bill_id = $1`, [billId]);
  if (!plan.length) return;
  const amounts = instalmentAmounts(plan, total);
  const planned = round2(amounts.reduce((a, b) => a + b, 0));
  if (Math.abs(planned - total) > 0.5 || amounts.some((a) => a <= 0)) {
    const message = `The parts add up to ${formatMoney(planned)}, but the invoice total is ${formatMoney(total)}`;
    throw new AppError(400, "VALIDATION_ERROR", message, { instalments: message });
  }
  for (const [i, p] of plan.entries()) {
    await tx.query(
      `INSERT INTO bill_instalments (bill_id, workspace_id, position, label, percent, amount, due_date) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [billId, workspaceId, i, p.label, p.percent ?? null, amounts[i], p.dueDate || null],
    );
  }
  const last = plan.map((p) => p.dueDate).filter((d): d is string => !!d).sort().at(-1);
  if (last) await tx.query(`UPDATE bills SET due_date = $2 WHERE id = $1`, [billId, last]);
}

function checkDates(issueDate: string, dueDate: string | null | undefined) {
  if (dueDate && dueDate < issueDate) {
    throw new AppError(400, "VALIDATION_ERROR", "The due date can't be before the bill date", {
      dueDate: "Can't be before the bill date",
    });
  }
}

/** Works out and saves every line and total. GST follows the business's state and the place of supply. */
async function writeLines(
  db: Queryable,
  workspaceId: string,
  billId: string,
  lines: BillLineFields[],
  typedDiscount: number,
  gst: { chargesGst: boolean; interState: boolean; pricesIncludeGst: boolean; discountPercent: number | null },
) {
  const prepared = prepareBillLines(lines, {
    chargesGst: gst.chargesGst,
    pricesIncludeGst: gst.pricesIncludeGst,
    discount: typedDiscount,
    discountPercent: gst.discountPercent,
  });
  lines = prepared.lines;
  const discount = prepared.discount;
  const totals = computeBillTotals(lines, discount, gst);
  await db.query(`DELETE FROM bill_items WHERE bill_id = $1`, [billId]);
  for (const [i, line] of lines.entries()) {
    const t = totals.lines[i]!;
    await db.query(
      `INSERT INTO bill_items (workspace_id, bill_id, catalogue_item_id, name, description, sac, unit, quantity, rate, tax_rate,
                               amount, discount, taxable, cgst, sgst, igst, position)
       VALUES ($1, $2, (SELECT id FROM catalogue_items WHERE id = $3 AND workspace_id = $1),
               $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        workspaceId,
        billId,
        line.catalogueItemId ?? null,
        line.name,
        line.description ?? null,
        line.sac ?? null,
        line.unit,
        line.quantity,
        line.rate,
        gst.chargesGst ? line.taxRate : 0,
        t.amount,
        t.discount,
        t.taxable,
        t.cgst,
        t.sgst,
        t.igst,
        i,
      ],
    );
  }
  await db.query(
    `UPDATE bills SET subtotal = $2, discount = $3, taxable = $4, cgst = $5, sgst = $6, igst = $7, tax = $8,
                      round_off = $9, total = $10 WHERE id = $1`,
    [billId, totals.subtotal, totals.discount, totals.taxable, totals.cgst, totals.sgst, totals.igst, totals.tax, totals.roundOff, totals.total],
  );
  return totals;
}

/** Earlier money received for this event (or client) that isn't on a bill yet moves onto the new bill. */
async function attachAdvances(db: Queryable, bill: { id: string; eventId: string | null; clientId: string | null; total: number }) {
  const { rows } = bill.eventId
    ? await db.query<{ id: string; amount: string }>(
        `SELECT id, amount FROM payments WHERE event_id = $1 AND bill_id IS NULL AND deleted_at IS NULL ORDER BY paid_on, number`,
        [bill.eventId],
      )
    : await db.query<{ id: string; amount: string }>(
        `SELECT id, amount FROM payments
          WHERE client_id = $1 AND event_id IS NULL AND bill_id IS NULL AND deleted_at IS NULL ORDER BY paid_on, number`,
        [bill.clientId],
      );
  let covered = 0;
  for (const p of rows) {
    const amount = Number(p.amount);
    if (covered + amount > bill.total) break;
    covered = round2(covered + amount);
    await db.query(`UPDATE payments SET bill_id = $2 WHERE id = $1`, [p.id, bill.id]);
  }
}

export async function createBill(
  db: Db,
  ctx: MemberContext,
  input: BillFields & {
    eventId?: string | null;
    clientId?: string | null;
    quoteId?: string | null;
    payment?: { amount: number; paidOn: string; method: string; reference?: string | null } | null;
  },
): Promise<Bill> {
  requireManage(ctx);
  checkDates(input.issueDate, input.dueDate);
  return withTransaction(db, async (tx) => {
    let clientId = input.clientId ?? null;
    const eventId = input.eventId ?? null;
    if (eventId) {
      const e = await tx.query<{ client_id: string | null }>(
        `SELECT client_id FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
        [eventId, ctx.workspaceId],
      );
      if (!e.rows[0]) throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
      clientId = clientId ?? e.rows[0].client_id;
    }
    if (clientId) {
      const c = await tx.query(`SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [clientId, ctx.workspaceId]);
      if (!c.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a client from your list", { clientId: "Choose a client" });
    }
    if (input.quoteId) {
      const q = await tx.query(`SELECT 1 FROM quotes WHERE id = $1 AND workspace_id = $2`, [input.quoteId, ctx.workspaceId]);
      if (!q.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a quote from your list", { quoteId: "Choose a quote" });
    }
    // A new customer typed on the invoice joins the client list (or matches one by number).
    if (!clientId && !eventId) {
      clientId = await upsertClientForLead(tx, ctx, { name: input.billTo.name, phone: input.billTo.phone ?? null, email: null, city: null });
    }

    const ws = await workspaceMoney(tx, ctx.workspaceId);
    if (input.chargesGst && !ws.gstin) {
      throw new AppError(400, "VALIDATION_ERROR", "Add your GST number in Business profile to charge GST", { chargesGst: "Add your GST number first" });
    }
    const chargesGst = ws.gstin !== null && input.chargesGst !== false;
    const pricesIncludeGst = chargesGst && input.pricesIncludeGst === true;
    const discountPercent = input.discountPercent ?? null;
    const homeState = stateFromGstin(ws.gstin);
    const placeOfSupply = chargesGst ? (input.placeOfSupply ?? homeState) : null;
    const interState = chargesGst && !!placeOfSupply && !!homeState && placeOfSupply !== homeState;

    const account = await accountForBill(tx, ctx.workspaceId, input.bankAccountId);
    const fy = financialYear(input.issueDate);
    const seq = await nextNumber(tx, ctx.workspaceId, `bill:${fy}`);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO bills (workspace_id, fy, seq, number, client_id, event_id, quote_id, issue_date, due_date,
                          bill_to_name, bill_to_phone, bill_to_address, bill_to_gstin, seller_gstin, place_of_supply,
                          inter_state, notes, terms, share_token, created_by, subject, prices_include_gst, discount_percent,
                          bank_account_id, bank_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25) RETURNING id`,
      [
        ctx.workspaceId,
        fy,
        seq,
        billNumber(ws.bill_prefix, fy, seq),
        clientId,
        eventId,
        input.quoteId ?? null,
        input.issueDate,
        input.dueDate ?? null,
        input.billTo.name,
        input.billTo.phone ?? null,
        input.billTo.address ?? null,
        chargesGst ? (input.billTo.gstin ?? null) : null,
        chargesGst ? ws.gstin : null,
        placeOfSupply,
        interState,
        input.notes !== undefined ? input.notes : await defaultText(tx, ctx.workspaceId, "note"),
        input.terms !== undefined ? input.terms : ((await defaultText(tx, ctx.workspaceId, "terms")) ?? ws.bill_terms),
        randomBytes(18).toString("base64url"),
        ctx.userId,
        input.subject ?? null,
        pricesIncludeGst,
        discountPercent,
        account?.id ?? null,
        account ? JSON.stringify(account.details) : null,
      ],
    );
    const id = rows[0]!.id;
    const totals = await writeLines(tx, ctx.workspaceId, id, input.items, input.discount, { chargesGst, interState, pricesIncludeGst, discountPercent });
    await savePlan(tx, ctx.workspaceId, id, input.instalments, totals.total);
    await attachAdvances(tx, { id, eventId, clientId, total: totals.total });
    // Money received with the invoice: full, an advance or a token amount, in the same save.
    if (input.payment) {
      requirePaymentsRecord(ctx);
      const already = Number(
        (await tx.query<{ sum: string }>(`SELECT coalesce(sum(amount), 0) AS sum FROM payments WHERE bill_id = $1 AND deleted_at IS NULL`, [id])).rows[0]!.sum,
      );
      if (round2(already + input.payment.amount) > totals.total) {
        const message = `That's more than the ${totals.total - already > 0 ? "balance" : "invoice total"}`;
        throw new AppError(400, "VALIDATION_ERROR", message, { "payment.amount": message });
      }
      await insertPayment(tx, ctx, { ...input.payment, note: null, billId: id, eventId, clientId });
    }
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "bill.created",
      entityType: "bill",
      entityId: id,
      meta: { total: totals.total, eventId },
    });
    return toBill(tx, ctx, await loadRow(tx, ctx.workspaceId, id));
  });
}

export async function updateBill(db: Db, ctx: MemberContext, billId: string, input: Partial<BillFields>): Promise<Bill> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const current = await loadRow(tx, ctx.workspaceId, billId, true);
    if (current.status === "cancelled") {
      throw new AppError(409, "BILL_CANCELLED", "This bill was cancelled. Make a new one instead.");
    }
    const issueDate = input.issueDate ?? current.issue_date;
    if (financialYear(issueDate) !== current.fy) {
      throw new AppError(400, "VALIDATION_ERROR", "A bill can't move to another financial year. Cancel it and make a new one.", {
        issueDate: "Keep the date in the same financial year",
      });
    }
    checkDates(issueDate, input.dueDate !== undefined ? input.dueDate : current.due_date);

    let sellerGstin = current.seller_gstin;
    if (input.chargesGst !== undefined && input.chargesGst !== (current.seller_gstin !== null)) {
      const ws = await workspaceMoney(tx, ctx.workspaceId);
      if (input.chargesGst && !ws.gstin) {
        throw new AppError(400, "VALIDATION_ERROR", "Add your GST number in Business profile to charge GST", { chargesGst: "Add your GST number first" });
      }
      sellerGstin = input.chargesGst ? ws.gstin : null;
    }
    const chargesGst = sellerGstin !== null;
    const pricesIncludeGst = chargesGst && (input.pricesIncludeGst ?? current.prices_include_gst);
    const discountPercent = input.discountPercent !== undefined ? input.discountPercent : current.discount_percent === null ? null : Number(current.discount_percent);
    const homeState = stateFromGstin(sellerGstin);
    const placeOfSupply = chargesGst ? (input.placeOfSupply !== undefined ? (input.placeOfSupply ?? homeState) : current.place_of_supply) : null;
    const interState = chargesGst && !!placeOfSupply && !!homeState && placeOfSupply !== homeState;

    const sets: string[] = [];
    const values: unknown[] = [billId];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (input.issueDate !== undefined) set("issue_date", input.issueDate);
    if (input.dueDate !== undefined) set("due_date", input.dueDate);
    if (input.billTo) {
      set("bill_to_name", input.billTo.name);
      set("bill_to_phone", input.billTo.phone ?? null);
      set("bill_to_address", input.billTo.address ?? null);
      set("bill_to_gstin", input.billTo.gstin ?? null);
    }
    if (input.notes !== undefined) set("notes", input.notes);
    if (input.terms !== undefined) set("terms", input.terms);
    // Picking another account copies its details now; the same one keeps what the client was sent.
    if (input.bankAccountId !== undefined && input.bankAccountId !== current.bank_account_id) {
      const account = await accountForBill(tx, ctx.workspaceId, input.bankAccountId);
      set("bank_account_id", account?.id ?? null);
      set("bank_details", account ? JSON.stringify(account.details) : null);
    }
    if (input.subject !== undefined) set("subject", input.subject);
    set("seller_gstin", sellerGstin);
    if (!chargesGst) set("bill_to_gstin", null);
    set("prices_include_gst", pricesIncludeGst);
    set("discount_percent", discountPercent);
    set("place_of_supply", placeOfSupply);
    set("inter_state", interState);
    await tx.query(`UPDATE bills SET ${sets.join(", ")} WHERE id = $1`, values);

    const lines =
      input.items ??
      (await loadItems(tx, billId)).map((i) => ({
        catalogueItemId: i.catalogueItemId,
        name: i.name,
        description: i.description,
        sac: i.sac,
        unit: i.unit,
        quantity: i.quantity,
        rate: i.rate,
        taxRate: i.taxRate,
      }));
    // Lines kept as they were are already before GST; typed ones follow the invoice's choice.
    const typedInclusive = input.items ? pricesIncludeGst : false;
    const totals = await writeLines(tx, ctx.workspaceId, billId, lines, input.discount ?? Number(current.discount), {
      chargesGst,
      interState,
      pricesIncludeGst: typedInclusive,
      discountPercent,
    });
    await savePlan(tx, ctx.workspaceId, billId, input.instalments, totals.total);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "bill.updated",
      entityType: "bill",
      entityId: billId,
      meta: { total: totals.total, before: Number(current.total) },
    });
    return toBill(tx, ctx, await loadRow(tx, ctx.workspaceId, billId));
  });
}

/**
 * Cancelling keeps the number (GST numbering has no gaps) and frees any money received
 * on it, which moves onto the next bill made for the same event.
 */
export async function cancelBill(db: Db, ctx: MemberContext, billId: string, reason: string | null): Promise<Bill> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const current = await loadRow(tx, ctx.workspaceId, billId, true);
    if (current.status !== "cancelled") {
      await tx.query(`UPDATE bills SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2 WHERE id = $1`, [billId, reason]);
      await tx.query(`UPDATE payments SET bill_id = NULL WHERE bill_id = $1`, [billId]);
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "bill.cancelled",
        entityType: "bill",
        entityId: billId,
        meta: { number: current.number, reason },
      });
    }
    return toBill(tx, ctx, await loadRow(tx, ctx.workspaceId, billId));
  });
}

// ---------------------------------------------------------------------------
// Public: the client's view at /b/<token>
// ---------------------------------------------------------------------------

export async function getPublicBill(db: Db, token: string): Promise<PublicBill> {
  const { rows } = await db.query<BillRow>(`${BILL_SELECT} WHERE b.share_token = $1 AND w.deleted_at IS NULL`, [token]);
  const row = rows[0];
  if (!row) throw notFound("This bill");
  const business = await db.query<{
    name: string;
    type_name: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    upi_id: string | null;
    logo_file_id: string | null;
    invoice_design: InvoiceDesign;
    invoice_accent: string;
  }>(
    `SELECT w.name, bt.name AS type_name, bt.icon, w.city, w.phone, w.email, w.address, w.upi_id, w.logo_file_id,
            w.invoice_design, w.invoice_accent
       FROM workspaces w JOIN business_types bt ON bt.id = w.business_type_id WHERE w.id = $1`,
    [row.workspace_id],
  );
  const b = business.rows[0]!;
  const bill = await toBill(db, null, row);
  const payments = await db.query<{ number: number; amount: string; paid_on: string; method: string; method_label: string }>(
    `SELECT p.number, p.amount, p.paid_on::text AS paid_on, p.method, coalesce(pm.label, p.method) AS method_label FROM payments p
       ${optionJoin("pm", "payment_method", "p.workspace_id", "p.method")}
      WHERE p.bill_id = $1 AND p.deleted_at IS NULL ORDER BY p.paid_on, p.number`,
    [row.id],
  );
  const { shareToken: _t, clientId: _c, eventId: _e, quoteId: _q, payments: _p, ...visible } = bill;
  void _t;
  void _c;
  void _e;
  void _q;
  void _p;
  return {
    business: {
      name: b.name,
      typeName: b.type_name,
      icon: b.icon,
      city: b.city,
      phone: b.phone,
      email: b.email,
      address: b.address,
      // The invoice's own account first, so the client pays where the invoice says.
      upiId: row.status === "cancelled" ? null : (bill.bank?.upiId ?? b.upi_id),
      logoUrl: logoPath(row.workspace_id, b.logo_file_id),
      invoiceDesign: b.invoice_design,
      invoiceAccent: b.invoice_accent,
    },
    bill: {
      ...visible,
      payments: payments.rows.map((p) => ({
        number: receiptNumber(p.number),
        amount: Number(p.amount),
        paidOn: p.paid_on,
        method: p.method,
        methodLabel: p.method_label,
      })),
    },
  };
}
