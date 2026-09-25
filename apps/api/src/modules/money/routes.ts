import type { FastifyInstance } from "fastify";
import {
  expenseInput,
  expenseListQuery,
  reviewExpenseInput,
  updateExpenseInput,
  billDraftQuery,
  billInput,
  billListQuery,
  cancelBillInput,
  paymentInput,
  paymentListQuery,
  updateBillInput,
  updatePaymentInput,
} from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import type { Files } from "../files/service.js";
import * as bills from "./bills.js";
import * as dues from "./dues.js";
import * as expenses from "./expenses.js";
import * as payments from "./payments.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

export function moneyRoutes(app: FastifyInstance, deps: { db: Db; files: Files }) {
  const { db } = deps;
  const secret = deps.files.secret;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  // ---- Overview: money to collect -------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/money", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await dues.moneyOverview(db, ctx));
  });
  app.get<WsId>("/workspaces/:workspaceId/events/:id/money", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await dues.eventMoney(db, ctx, assertId(request.params.id, "This event")));
  });

  // ---- Bills ----------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/bills", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await bills.listBills(db, ctx, parse(billListQuery, request.query)));
  });
  app.get<Ws>("/workspaces/:workspaceId/bill-draft", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await bills.billDraft(db, ctx, parse(billDraftQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/bills", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await bills.createBill(db, ctx, parse(billInput, request.body))));
  });
  app.get<WsId>("/workspaces/:workspaceId/bills/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await bills.getBill(db, ctx, assertId(request.params.id, "This bill")));
  });
  app.patch<WsId>("/workspaces/:workspaceId/bills/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await bills.updateBill(db, ctx, assertId(request.params.id, "This bill"), parse(updateBillInput, request.body)));
  });
  app.post<WsId>("/workspaces/:workspaceId/bills/:id/cancel", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { reason } = parse(cancelBillInput, request.body);
    return ok(await bills.cancelBill(db, ctx, assertId(request.params.id, "This bill"), reason ?? null));
  });
  app.get<{ Params: { token: string } }>("/public/bills/:token", async (request) => {
    return ok(await bills.getPublicBill(db, request.params.token));
  });

  // ---- Payments ---------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/payments", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await payments.listPayments(db, ctx, parse(paymentListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/payments", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await payments.recordPayment(db, ctx, parse(paymentInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/payments/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await payments.updatePayment(db, ctx, assertId(request.params.id, "This payment"), parse(updatePaymentInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/payments/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await payments.deletePayment(db, ctx, assertId(request.params.id, "This payment"));
    return ok({ deleted: true as const });
  });

  // ---- Expenses ---------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/expenses", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await expenses.listExpenses(db, secret, ctx, parse(expenseListQuery, request.query)));
  });
  app.get<Ws & { Querystring: { month?: string } }>("/workspaces/:workspaceId/expense-month", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { month } = parse(expenseListQuery.pick({ month: true }).required(), request.query);
    return ok(await expenses.expenseMonth(db, ctx, month));
  });
  app.post<Ws>("/workspaces/:workspaceId/expenses", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await expenses.createExpense(db, secret, ctx, parse(expenseInput, request.body))));
  });
  app.get<WsId>("/workspaces/:workspaceId/expenses/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await expenses.getExpense(db, secret, ctx, assertId(request.params.id, "This expense")));
  });
  app.patch<WsId>("/workspaces/:workspaceId/expenses/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This expense");
    return ok(await expenses.updateExpense(db, secret, ctx, id, parse(updateExpenseInput, request.body)));
  });
  app.post<WsId>("/workspaces/:workspaceId/expenses/:id/review", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This expense");
    return ok(await expenses.reviewExpense(db, secret, ctx, id, parse(reviewExpenseInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/expenses/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await expenses.deleteExpense(db, ctx, assertId(request.params.id, "This expense"));
    return ok({ deleted: true as const });
  });
}
