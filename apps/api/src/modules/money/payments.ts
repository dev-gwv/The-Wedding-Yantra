import { receiptNumber, type PaymentMethod } from "@wedding-yantra/core";
import type { Payment } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { nextNumber } from "../bookings/quotes.js";
import { requireMoneyView, requirePaymentsRecord } from "./access.js";

interface PaymentRow {
  id: string;
  number: number;
  amount: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  bill_id: string | null;
  bill_number: string | null;
  event_id: string | null;
  client_id: string | null;
  client_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
}

const PAYMENT_SELECT = `
  SELECT p.id, p.number, p.amount, p.paid_on::text AS paid_on, p.method, p.reference, p.note,
         p.bill_id, b.number AS bill_number, p.event_id, p.client_id, coalesce(c.name, b.bill_to_name) AS client_name,
         p.created_by, u.name AS created_by_name, p.created_at
    FROM payments p
    LEFT JOIN bills b ON b.id = p.bill_id
    LEFT JOIN clients c ON c.id = p.client_id
    LEFT JOIN users u ON u.id = p.created_by`;

const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  number: receiptNumber(r.number),
  amount: Number(r.amount),
  paidOn: r.paid_on,
  method: r.method,
  reference: r.reference,
  note: r.note,
  billId: r.bill_id,
  billNumber: r.bill_number,
  eventId: r.event_id,
  clientId: r.client_id,
  clientName: r.client_name,
  recordedBy: r.created_by ? { id: r.created_by, name: r.created_by_name } : null,
  createdAt: r.created_at.toISOString(),
});

async function loadPayment(db: Queryable, workspaceId: string, id: string): Promise<Payment> {
  const { rows } = await db.query<PaymentRow>(`${PAYMENT_SELECT} WHERE p.id = $1 AND p.workspace_id = $2 AND p.deleted_at IS NULL`, [
    id,
    workspaceId,
  ]);
  if (!rows[0]) throw notFound("This payment");
  return toPayment(rows[0]);
}

export async function listPayments(
  db: Queryable,
  ctx: MemberContext,
  filters: { billId?: string; eventId?: string; clientId?: string; month?: string } = {},
): Promise<Payment[]> {
  requireMoneyView(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const where = ["p.workspace_id = $1", "p.deleted_at IS NULL"];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filters.billId) add("p.bill_id = ?", filters.billId);
  if (filters.eventId) add("p.event_id = ?", filters.eventId);
  if (filters.clientId) add("p.client_id = ?", filters.clientId);
  if (filters.month) add("to_char(p.paid_on, 'YYYY-MM') = ?", filters.month);
  const { rows } = await db.query<PaymentRow>(
    `${PAYMENT_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.paid_on DESC, p.number DESC LIMIT 1000`,
    params,
  );
  return rows.map(toPayment);
}

interface PaymentFields {
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
}

/**
 * Money received. On a bill when one is given; for an event, it goes on the oldest bill
 * of that event with money still due, or waits as an advance until a bill is made.
 */
export async function recordPayment(
  db: Db,
  ctx: MemberContext,
  input: PaymentFields & { billId?: string | null; eventId?: string | null; clientId?: string | null },
): Promise<Payment> {
  requirePaymentsRecord(ctx);
  return withTransaction(db, async (tx) => {
    let billId = input.billId ?? null;
    let eventId = input.eventId ?? null;
    let clientId = input.clientId ?? null;

    if (billId) {
      const b = await tx.query<{ status: string; event_id: string | null; client_id: string | null }>(
        `SELECT status, event_id, client_id FROM bills WHERE id = $1 AND workspace_id = $2 FOR UPDATE`,
        [billId, ctx.workspaceId],
      );
      const bill = b.rows[0];
      if (!bill) throw new AppError(400, "VALIDATION_ERROR", "Choose a bill from your list", { billId: "Choose a bill" });
      if (bill.status === "cancelled") throw new AppError(409, "BILL_CANCELLED", "This bill was cancelled. Record the money on the new bill.");
      eventId = bill.event_id;
      clientId = bill.client_id ?? clientId;
    } else if (eventId) {
      const e = await tx.query<{ client_id: string | null }>(
        `SELECT client_id FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
        [eventId, ctx.workspaceId],
      );
      if (!e.rows[0]) throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
      clientId = clientId ?? e.rows[0].client_id;
      const open = await tx.query<{ id: string }>(
        `SELECT b.id FROM bills b
          WHERE b.event_id = $1 AND b.status = 'issued'
            AND b.total > coalesce((SELECT sum(amount) FROM payments p WHERE p.bill_id = b.id AND p.deleted_at IS NULL), 0)
          ORDER BY b.issue_date, b.seq LIMIT 1`,
        [eventId],
      );
      billId = open.rows[0]?.id ?? null;
    }
    if (clientId) {
      const c = await tx.query(`SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [clientId, ctx.workspaceId]);
      if (!c.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a client from your list", { clientId: "Choose a client" });
    }

    const number = await nextNumber(tx, ctx.workspaceId, "receipt");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO payments (workspace_id, number, client_id, event_id, bill_id, amount, paid_on, method, reference, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        ctx.workspaceId,
        number,
        clientId,
        eventId,
        billId,
        input.amount,
        input.paidOn,
        input.method,
        input.reference ?? null,
        input.note ?? null,
        ctx.userId,
      ],
    );
    const id = rows[0]!.id;
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "payment.recorded",
      entityType: "payment",
      entityId: id,
      meta: { amount: input.amount, method: input.method, billId, eventId },
    });
    return loadPayment(tx, ctx.workspaceId, id);
  });
}

export async function updatePayment(db: Db, ctx: MemberContext, id: string, input: Partial<PaymentFields>): Promise<Payment> {
  requirePaymentsRecord(ctx);
  const map: [keyof PaymentFields, string][] = [
    ["amount", "amount"],
    ["paidOn", "paid_on"],
    ["method", "method"],
    ["reference", "reference"],
    ["note", "note"],
  ];
  const sets: string[] = [];
  const values: unknown[] = [id, ctx.workspaceId];
  for (const [key, column] of map) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length) {
    const { rowCount } = await db.query(
      `UPDATE payments SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
      values,
    );
    if (!rowCount) throw notFound("This payment");
    await logActivity(db, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "payment.updated",
      entityType: "payment",
      entityId: id,
      meta: { fields: map.filter(([k]) => input[k] !== undefined).map(([k]) => k) },
    });
  }
  return loadPayment(db, ctx.workspaceId, id);
}

export async function deletePayment(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requirePaymentsRecord(ctx);
  const { rows } = await db.query<{ amount: string }>(
    `UPDATE payments SET deleted_at = now() WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL RETURNING amount`,
    [id, ctx.workspaceId],
  );
  if (!rows[0]) throw notFound("This payment");
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "payment.deleted",
    entityType: "payment",
    entityId: id,
    meta: { amount: Number(rows[0].amount) },
  });
}
