import { can, round2 } from "@wedding-yantra/core";
import type { Expense, ExpenseMonth, ExpenseStatus } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { assertWorkspaceFile, toUploaded } from "../files/service.js";
import { assertOption, optionJoin } from "../options/service.js";

/** Seeing money: everything. Everyone else who can add expenses sees only their own. */
const seesAll = (ctx: MemberContext) => can(ctx.role, "finance.view") || can(ctx.role, "expenses.approve");
const requireSubmit = (ctx: MemberContext) => {
  if (!can(ctx.role, "expenses.submit") && !can(ctx.role, "finance.view")) throw forbidden("Your role doesn't include expenses");
};
/** Approvers change any expense; others only their own. The accountant only looks. */
const requireChange = (ctx: MemberContext, row: { submitted_by: string | null }) => {
  if (can(ctx.role, "expenses.approve")) return;
  if (can(ctx.role, "expenses.submit") && row.submitted_by === ctx.userId) return;
  throw forbidden("Only the owner, a manager or the person who added it can change this expense");
};

interface ExpenseRow {
  id: string;
  amount: string;
  spent_on: string;
  category: string;
  category_label: string;
  paid_to: string | null;
  method: string | null;
  method_label: string | null;
  note: string | null;
  event_id: string | null;
  event_title: string | null;
  status: ExpenseStatus;
  reject_reason: string | null;
  file_id: string | null;
  file_type: string | null;
  file_size: number | null;
  submitted_by: string | null;
  submitted_name: string | null;
  reviewed_by: string | null;
  reviewed_name: string | null;
  created_at: Date;
}

const EXPENSE_SELECT = `
  SELECT x.id, x.amount, x.spent_on::text AS spent_on, x.category, coalesce(xc.label, x.category) AS category_label,
         x.paid_to, x.method, CASE WHEN x.method IS NULL THEN NULL ELSE coalesce(xm.label, x.method) END AS method_label, x.note,
         x.event_id, e.title AS event_title, x.status, x.reject_reason,
         f.id AS file_id, f.content_type AS file_type, f.size_bytes AS file_size,
         x.submitted_by, su.name AS submitted_name, x.reviewed_by, ru.name AS reviewed_name, x.created_at
    FROM expenses x
    LEFT JOIN events e ON e.id = x.event_id
    LEFT JOIN files f ON f.id = x.receipt_file_id
    LEFT JOIN users su ON su.id = x.submitted_by
    LEFT JOIN users ru ON ru.id = x.reviewed_by
    ${optionJoin("xc", "expense_category", "x.workspace_id", "x.category")}
    ${optionJoin("xm", "payment_method", "x.workspace_id", "x.method")}`;

const toExpense = (secret: Buffer, r: ExpenseRow): Expense => ({
  id: r.id,
  amount: Number(r.amount),
  spentOn: r.spent_on,
  category: r.category,
  categoryLabel: r.category_label,
  paidTo: r.paid_to,
  method: r.method,
  methodLabel: r.method_label,
  note: r.note,
  eventId: r.event_id,
  eventTitle: r.event_title,
  status: r.status,
  rejectReason: r.reject_reason,
  receipt: r.file_id ? toUploaded(secret, { id: r.file_id, content_type: r.file_type!, size_bytes: r.file_size ?? 0 }) : null,
  submittedBy: r.submitted_by ? { id: r.submitted_by, name: r.submitted_name } : null,
  reviewedBy: r.reviewed_by ? { id: r.reviewed_by, name: r.reviewed_name } : null,
  createdAt: r.created_at.toISOString(),
});

async function loadRow(db: Queryable, ctx: MemberContext, id: string, lock = false): Promise<ExpenseRow> {
  const { rows } = await db.query<ExpenseRow>(
    `${EXPENSE_SELECT} WHERE x.id = $1 AND x.workspace_id = $2 AND x.deleted_at IS NULL${lock ? " FOR UPDATE OF x" : ""}`,
    [id, ctx.workspaceId],
  );
  const row = rows[0];
  // Someone who can't see an expense shouldn't learn it exists.
  if (!row || (!seesAll(ctx) && row.submitted_by !== ctx.userId)) throw notFound("This expense");
  return row;
}

export async function listExpenses(
  db: Queryable,
  secret: Buffer,
  ctx: MemberContext,
  filters: { eventId?: string; month?: string; status?: ExpenseStatus } = {},
): Promise<Expense[]> {
  requireSubmit(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const where = ["x.workspace_id = $1", "x.deleted_at IS NULL"];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (!seesAll(ctx)) add("x.submitted_by = ?", ctx.userId);
  if (filters.eventId) add("x.event_id = ?", filters.eventId);
  if (filters.month) add("to_char(x.spent_on, 'YYYY-MM') = ?", filters.month);
  if (filters.status) add("x.status = ?", filters.status);
  const { rows } = await db.query<ExpenseRow>(
    `${EXPENSE_SELECT} WHERE ${where.join(" AND ")}
      ORDER BY (x.status = 'pending') DESC, x.spent_on DESC, x.created_at DESC LIMIT 1000`,
    params,
  );
  return rows.map((r) => toExpense(secret, r));
}

export async function getExpense(db: Queryable, secret: Buffer, ctx: MemberContext, id: string): Promise<Expense> {
  requireSubmit(ctx);
  return toExpense(secret, await loadRow(db, ctx, id));
}

interface ExpenseFields {
  eventId?: string | null;
  category: string;
  amount: number;
  spentOn: string;
  paidTo?: string | null;
  method?: string | null;
  note?: string | null;
  receiptFileId?: string | null;
}

async function checkLinks(db: Queryable, ctx: MemberContext, input: Partial<ExpenseFields>) {
  if (input.eventId) {
    const e = await db.query(`SELECT 1 FROM events WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [input.eventId, ctx.workspaceId]);
    if (!e.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose an event from your list", { eventId: "Choose an event" });
  }
  if (input.receiptFileId) await assertWorkspaceFile(db, ctx.workspaceId, input.receiptFileId);
}

/** The owner's and managers' expenses count straight away; the team's wait for approval. */
export async function createExpense(db: Db, secret: Buffer, ctx: MemberContext, input: ExpenseFields): Promise<Expense> {
  if (!can(ctx.role, "expenses.submit")) throw forbidden("Your role can't add expenses");
  return withTransaction(db, async (tx) => {
    await checkLinks(tx, ctx, input);
    await assertOption(tx, ctx.workspaceId, "expense_category", input.category, "category");
    if (input.method) await assertOption(tx, ctx.workspaceId, "payment_method", input.method, "method");
    const approver = can(ctx.role, "expenses.approve");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO expenses (workspace_id, event_id, category, amount, spent_on, paid_to, method, note, receipt_file_id,
                             status, submitted_by, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $12::uuid IS NULL THEN NULL ELSE now() END)
       RETURNING id`,
      [
        ctx.workspaceId,
        input.eventId ?? null,
        input.category,
        input.amount,
        input.spentOn,
        input.paidTo ?? null,
        input.method ?? null,
        input.note ?? null,
        input.receiptFileId ?? null,
        approver ? "approved" : "pending",
        ctx.userId,
        approver ? ctx.userId : null,
      ],
    );
    const id = rows[0]!.id;
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: approver ? "expense.added" : "expense.submitted",
      entityType: "expense",
      entityId: id,
      meta: { amount: input.amount, category: input.category, eventId: input.eventId ?? null },
    });
    return toExpense(secret, await loadRow(tx, ctx, id));
  });
}

/**
 * Approvers change any expense. Others change their own until it's approved; a change
 * to a rejected one sends it for approval again.
 */
/** Expenses made by paying a vendor change only from Vendors, so the two never disagree. */
async function requireNotPayout(db: Queryable, id: string) {
  const { rowCount } = await db.query(`SELECT 1 FROM payouts WHERE expense_id = $1 AND deleted_at IS NULL`, [id]);
  if (rowCount) throw new AppError(409, "EXPENSE_FROM_PAYOUT", "This was recorded by paying a vendor. Change it from Vendors.");
}

export async function updateExpense(db: Db, secret: Buffer, ctx: MemberContext, id: string, input: Partial<ExpenseFields>): Promise<Expense> {
  requireSubmit(ctx);
  return withTransaction(db, async (tx) => {
    const current = await loadRow(tx, ctx, id, true);
    requireChange(ctx, current);
    await requireNotPayout(tx, id);
    const approver = can(ctx.role, "expenses.approve");
    if (!approver && current.status === "approved") {
      throw new AppError(409, "EXPENSE_APPROVED", "This expense is approved. Ask the owner to change it.");
    }
    await checkLinks(tx, ctx, input);
    if (input.category !== undefined) await assertOption(tx, ctx.workspaceId, "expense_category", input.category, "category", current.category);
    if (input.method) await assertOption(tx, ctx.workspaceId, "payment_method", input.method, "method", current.method);
    const map: [keyof ExpenseFields, string][] = [
      ["eventId", "event_id"],
      ["category", "category"],
      ["amount", "amount"],
      ["spentOn", "spent_on"],
      ["paidTo", "paid_to"],
      ["method", "method"],
      ["note", "note"],
      ["receiptFileId", "receipt_file_id"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [id];
    for (const [key, column] of map) {
      if (input[key] === undefined) continue;
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (!approver && current.status === "rejected") sets.push("status = 'pending'", "reject_reason = NULL", "reviewed_by = NULL", "reviewed_at = NULL");
    if (sets.length) await tx.query(`UPDATE expenses SET ${sets.join(", ")} WHERE id = $1`, values);
    return toExpense(secret, await loadRow(tx, ctx, id));
  });
}

export async function reviewExpense(
  db: Db,
  secret: Buffer,
  ctx: MemberContext,
  id: string,
  decision: { approve: boolean; reason?: string | null },
): Promise<Expense> {
  if (!can(ctx.role, "expenses.approve")) throw forbidden("Only the owner or a manager can approve expenses");
  await loadRow(db, ctx, id);
  await db.query(
    `UPDATE expenses SET status = $2, reject_reason = $3, reviewed_by = $4, reviewed_at = now() WHERE id = $1`,
    [id, decision.approve ? "approved" : "rejected", decision.approve ? null : (decision.reason ?? null), ctx.userId],
  );
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: decision.approve ? "expense.approved" : "expense.rejected",
    entityType: "expense",
    entityId: id,
    meta: decision.approve ? {} : { reason: decision.reason ?? null },
  });
  return getExpense(db, secret, ctx, id);
}

export async function deleteExpense(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireSubmit(ctx);
  const current = await loadRow(db, ctx, id);
  requireChange(ctx, current);
  if (!can(ctx.role, "expenses.approve") && current.status === "approved") {
    throw new AppError(409, "EXPENSE_APPROVED", "This expense is approved. Ask the owner to remove it.");
  }
  await requireNotPayout(db, id);
  await db.query(`UPDATE expenses SET deleted_at = now() WHERE id = $1`, [id]);
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "expense.deleted",
    entityType: "expense",
    entityId: id,
    meta: { amount: Number(current.amount) },
  });
}

/** A month of spending for the Money tab. Money roles only. */
export async function expenseMonth(db: Queryable, ctx: MemberContext, month: string): Promise<ExpenseMonth> {
  if (!seesAll(ctx)) throw forbidden("Your role doesn't include money");
  const { rows } = await db.query<{ category: string; label: string; status: ExpenseStatus; total: string; count: string }>(
    `SELECT x.category, coalesce(xc.label, x.category) AS label, x.status, sum(x.amount) AS total, count(*) AS count FROM expenses x
       ${optionJoin("xc", "expense_category", "x.workspace_id", "x.category")}
      WHERE x.workspace_id = $1 AND x.deleted_at IS NULL AND to_char(x.spent_on, 'YYYY-MM') = $2 AND x.status <> 'rejected'
      GROUP BY x.category, xc.label, x.status`,
    [ctx.workspaceId, month],
  );
  const approved = rows.filter((r) => r.status === "approved");
  const pending = rows.filter((r) => r.status === "pending");
  const byCategory = new Map<string, { label: string; total: number }>();
  for (const r of approved) {
    const had = byCategory.get(r.category);
    byCategory.set(r.category, { label: r.label, total: round2((had?.total ?? 0) + Number(r.total)) });
  }
  return {
    month,
    spent: round2(approved.reduce((a, r) => a + Number(r.total), 0)),
    pending: round2(pending.reduce((a, r) => a + Number(r.total), 0)),
    pendingCount: pending.reduce((a, r) => a + Number(r.count), 0),
    byCategory: [...byCategory.entries()].map(([category, v]) => ({ category, label: v.label, total: v.total })).sort((a, b) => b.total - a.total),
  };
}

/** Approved and waiting spend on one event, for its profit. */
export async function eventSpend(db: Queryable, eventId: string): Promise<{ spent: number; pending: number }> {
  const { rows } = await db.query<{ spent: string; pending: string }>(
    `SELECT coalesce(sum(amount) FILTER (WHERE status = 'approved'), 0) AS spent,
            coalesce(sum(amount) FILTER (WHERE status = 'pending'), 0) AS pending
       FROM expenses WHERE event_id = $1 AND deleted_at IS NULL`,
    [eventId],
  );
  return { spent: Number(rows[0]!.spent), pending: Number(rows[0]!.pending) };
}

export async function pendingExpenseCount(db: Queryable, ctx: MemberContext): Promise<number> {
  if (!can(ctx.role, "expenses.approve")) return 0;
  const { rows } = await db.query<{ count: string }>(
    `SELECT count(*) AS count FROM expenses WHERE workspace_id = $1 AND status = 'pending' AND deleted_at IS NULL`,
    [ctx.workspaceId],
  );
  return Number(rows[0]!.count);
}
