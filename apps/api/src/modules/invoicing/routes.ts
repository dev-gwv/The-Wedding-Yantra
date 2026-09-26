import type { FastifyInstance } from "fastify";
import { bankAccountInput, savedTextInput, updateBankAccountInput, updateSavedTextInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as invoicing from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** What invoices carry, set once: saved notes and terms, and bank accounts. */
export function invoicingRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  app.get<Ws>("/workspaces/:workspaceId/saved-texts", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await invoicing.listSavedTexts(db, ctx));
  });
  app.post<Ws>("/workspaces/:workspaceId/saved-texts", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return reply.status(201).send(ok(await invoicing.addSavedText(db, ctx, parse(savedTextInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/saved-texts/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await invoicing.updateSavedText(db, ctx, assertId(request.params.id, "This saved text"), parse(updateSavedTextInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/saved-texts/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await invoicing.deleteSavedText(db, ctx, assertId(request.params.id, "This saved text")));
  });

  app.get<Ws>("/workspaces/:workspaceId/bank-accounts", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await invoicing.listBankAccounts(db, ctx));
  });
  app.post<Ws>("/workspaces/:workspaceId/bank-accounts", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return reply.status(201).send(ok(await invoicing.addBankAccount(db, ctx, parse(bankAccountInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/bank-accounts/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await invoicing.updateBankAccount(db, ctx, assertId(request.params.id, "This bank account"), parse(updateBankAccountInput, request.body)));
  });
}
