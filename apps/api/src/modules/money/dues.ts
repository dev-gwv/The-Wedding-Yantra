import { can, nextInstalment, planStatus, round2 } from "@wedding-yantra/core";
import type { DueItem, EventMoney, HomeSummary, MoneyOverview } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { requireMoneyView } from "./access.js";
import { BILL_SELECT, toBillSummary, type BillRow } from "./bills.js";
import { eventSpend, pendingExpenseCount } from "./expenses.js";
import { listPayments } from "./payments.js";
import { toPay } from "../vendors/service.js";

/**
 * Everything still to collect: bills with a balance, and bookings with a value that
 * have no bill yet (the balance is due by the first function).
 */
async function dues(db: Queryable, workspaceId: string): Promise<DueItem[]> {
  const bills = await db.query<BillRow>(
    `SELECT * FROM (${BILL_SELECT} WHERE b.workspace_id = $1 AND b.status = 'issued') x WHERE x.total > x.received`,
    [workspaceId],
  );
  // Invoices paid in parts: ask for the part that's due, not the whole balance.
  const parts = new Map<string, { label: string; percent: number | null; amount: number; dueDate: string | null }[]>();
  if (bills.rows.length) {
    const { rows } = await db.query<{ bill_id: string; label: string; percent: string | null; amount: string; due_date: string | null }>(
      `SELECT bill_id, label, percent, amount, due_date::text AS due_date FROM bill_instalments WHERE bill_id = ANY($1::uuid[]) ORDER BY bill_id, position`,
      [bills.rows.map((r) => r.id)],
    );
    for (const p of rows) {
      const list = parts.get(p.bill_id) ?? [];
      list.push({ label: p.label, percent: p.percent === null ? null : Number(p.percent), amount: Number(p.amount), dueDate: p.due_date });
      parts.set(p.bill_id, list);
    }
  }
  const fromBills: DueItem[] = bills.rows.map((r) => {
    const s = toBillSummary(r);
    const plan = parts.get(r.id);
    const next = plan ? nextInstalment(planStatus(plan, s.received, r.today)) : null;
    const dueNow = Math.max(0, round2(Number(r.plan_due_by_today) - s.received));
    return {
      kind: "bill",
      billId: s.id,
      billNumber: s.number,
      eventId: s.eventId,
      eventTitle: s.eventTitle,
      clientId: s.clientId,
      clientName: s.clientName,
      clientPhone: r.client_phone,
      total: s.total,
      received: s.received,
      due: s.due,
      dueDate: s.dueDate,
      overdue: s.overdue,
      shareToken: r.share_token,
      part: next ? { label: next.label, amount: Math.min(s.due, dueNow > 0 ? dueNow : next.remaining), dueDate: next.dueDate } : null,
    };
  });

  const events = await db.query<{
    id: string;
    title: string;
    value: string;
    client_id: string | null;
    client_name: string | null;
    client_phone: string | null;
    start_date: string | null;
    received: string;
    today: string;
  }>(
    `SELECT * FROM (
       SELECT e.id, e.title, e.value, e.client_id, c.name AS client_name, c.phone AS client_phone,
              (SELECT min(date)::text FROM event_functions f WHERE f.event_id = e.id) AS start_date,
              coalesce((SELECT sum(amount) FROM payments p WHERE p.event_id = e.id AND p.deleted_at IS NULL), 0) AS received,
              (now() AT TIME ZONE w.timezone)::date::text AS today
         FROM events e
         JOIN workspaces w ON w.id = e.workspace_id
         LEFT JOIN clients c ON c.id = e.client_id
        WHERE e.workspace_id = $1 AND e.deleted_at IS NULL AND e.status <> 'cancelled' AND e.value > 0
          AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.event_id = e.id AND b.status = 'issued')
     ) x WHERE x.value > x.received`,
    [workspaceId],
  );
  const fromEvents: DueItem[] = events.rows.map((r) => {
    const total = Number(r.value);
    const received = Number(r.received);
    const due = round2(total - received);
    return {
      kind: "event",
      billId: null,
      billNumber: null,
      eventId: r.id,
      eventTitle: r.title,
      clientId: r.client_id,
      clientName: r.client_name ?? r.title,
      clientPhone: r.client_phone,
      total,
      received,
      due,
      dueDate: r.start_date,
      overdue: r.start_date !== null && r.start_date < r.today,
      shareToken: null,
      part: null,
    };
  });

  return [...fromBills, ...fromEvents].sort(
    (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.due - a.due,
  );
}

export async function moneyOverview(db: Queryable, ctx: MemberContext): Promise<MoneyOverview> {
  requireMoneyView(ctx);
  const list = await dues(db, ctx.workspaceId);
  const { rows } = await db.query<{ received: string; billed: string }>(
    `SELECT
       coalesce((SELECT sum(p.amount) FROM payments p
                  WHERE p.workspace_id = w.id AND p.deleted_at IS NULL
                    AND date_trunc('month', p.paid_on) = date_trunc('month', (now() AT TIME ZONE w.timezone)::date)), 0) AS received,
       coalesce((SELECT sum(b.total) FROM bills b
                  WHERE b.workspace_id = w.id AND b.status = 'issued'
                    AND date_trunc('month', b.issue_date) = date_trunc('month', (now() AT TIME ZONE w.timezone)::date)), 0) AS billed
       FROM workspaces w WHERE w.id = $1`,
    [ctx.workspaceId],
  );
  const sum = (items: DueItem[]) => round2(items.reduce((a, d) => a + d.due, 0));
  return {
    toCollect: sum(list),
    overdue: sum(list.filter((d) => d.overdue)),
    receivedThisMonth: Number(rows[0]?.received ?? 0),
    billedThisMonth: Number(rows[0]?.billed ?? 0),
    toPay: await toPay(db, ctx.workspaceId),
    dues: list,
  };
}

/** What Home shows about money: only for roles that see money. */
export async function homeMoney(db: Queryable, ctx: MemberContext): Promise<HomeSummary["money"]> {
  if (!can(ctx.role, "finance.view")) return null;
  const [overview, pendingExpenses, month] = await Promise.all([
    moneyOverview(db, ctx),
    pendingExpenseCount(db, ctx),
    db.query<{ received: string; spent: string }>(
      `WITH m AS (SELECT date_trunc('month', now() AT TIME ZONE timezone)::date AS start FROM workspaces WHERE id = $1)
       SELECT (SELECT coalesce(sum(amount), 0) FROM payments p, m WHERE p.workspace_id = $1 AND p.deleted_at IS NULL AND p.paid_on >= m.start) AS received,
              (SELECT coalesce(sum(amount), 0) FROM expenses x, m
                WHERE x.workspace_id = $1 AND x.deleted_at IS NULL AND x.status = 'approved' AND x.spent_on >= m.start) AS spent`,
      [ctx.workspaceId],
    ),
  ]);
  return {
    toCollect: overview.toCollect,
    overdue: overview.overdue,
    due: overview.dues.slice(0, 3),
    pendingExpenses,
    receivedThisMonth: Number(month.rows[0]?.received ?? 0),
    spentThisMonth: Number(month.rows[0]?.spent ?? 0),
  };
}

export async function eventMoney(db: Queryable, ctx: MemberContext, eventId: string): Promise<EventMoney> {
  requireMoneyView(ctx);
  const e = await db.query<{ value: string | null }>(
    `SELECT value FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [eventId, ctx.workspaceId],
  );
  if (!e.rows[0]) throw notFound("This event");
  const bills = await db.query<BillRow>(
    `${BILL_SELECT} WHERE b.event_id = $1 AND b.workspace_id = $2 ORDER BY b.issue_date, b.seq`,
    [eventId, ctx.workspaceId],
  );
  const summaries = bills.rows.map(toBillSummary);
  const payments = await listPayments(db, ctx, { eventId });
  const issued = summaries.filter((b) => b.status === "issued");
  const bookingValue = e.rows[0].value === null ? null : Number(e.rows[0].value);
  const billed = round2(issued.reduce((a, b) => a + b.total, 0));
  const expected = issued.length ? billed : (bookingValue ?? 0);
  const received = round2(payments.reduce((a, p) => a + p.amount, 0));

  // What the business keeps is the price before GST: GST is the government's money.
  let revenue: number;
  if (issued.length) {
    revenue = round2(bills.rows.filter((b) => b.status === "issued").reduce((a, b) => a + Number(b.taxable), 0));
  } else {
    const quote = await db.query<{ taxable: string }>(
      `SELECT subtotal - discount AS taxable FROM quotes
        WHERE event_id = $1 AND status = 'accepted' AND deleted_at IS NULL ORDER BY accepted_at DESC LIMIT 1`,
      [eventId],
    );
    revenue = quote.rows[0] ? Number(quote.rows[0].taxable) : (bookingValue ?? 0);
  }
  const spend = await eventSpend(db, eventId);
  return {
    bookingValue,
    billed,
    expected,
    received,
    due: Math.max(round2(expected - received), 0),
    revenue,
    spent: spend.spent,
    pendingSpend: spend.pending,
    profit: round2(revenue - spend.spent),
    toPay: await toPay(db, ctx.workspaceId, eventId),
    bills: summaries,
    payments,
  };
}
