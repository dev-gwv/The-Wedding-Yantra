import type { FastifyInstance } from "fastify";
import { payoutInput, payoutListQuery, payPayoutInput, updatePayoutInput, updateVendorInput, vendorInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as vendors from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** Phase 6, Grow: vendors and what each event owes them. */
export function vendorRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  app.get<Ws>("/workspaces/:workspaceId/vendors", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.listVendors(db, ctx));
  });
  app.post<Ws>("/workspaces/:workspaceId/vendors", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await vendors.createVendor(db, ctx, parse(vendorInput, request.body))));
  });
  app.get<WsId>("/workspaces/:workspaceId/vendors/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.getVendor(db, ctx, assertId(request.params.id, "This vendor")));
  });
  app.patch<WsId>("/workspaces/:workspaceId/vendors/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.updateVendor(db, ctx, assertId(request.params.id, "This vendor"), parse(updateVendorInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/vendors/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await vendors.deleteVendor(db, ctx, assertId(request.params.id, "This vendor"));
    return ok({ deleted: true as const });
  });

  app.get<Ws>("/workspaces/:workspaceId/payouts", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.listPayouts(db, ctx, parse(payoutListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/payouts", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await vendors.createPayout(db, ctx, parse(payoutInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/payouts/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.updatePayout(db, ctx, assertId(request.params.id, "This payout"), parse(updatePayoutInput, request.body)));
  });
  app.post<WsId>("/workspaces/:workspaceId/payouts/:id/pay", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.payPayout(db, ctx, assertId(request.params.id, "This payout"), parse(payPayoutInput, request.body)));
  });
  app.post<WsId>("/workspaces/:workspaceId/payouts/:id/unpay", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await vendors.unpayPayout(db, ctx, assertId(request.params.id, "This payout")));
  });
  app.delete<WsId>("/workspaces/:workspaceId/payouts/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await vendors.deletePayout(db, ctx, assertId(request.params.id, "This payout"));
    return ok({ deleted: true as const });
  });
}
