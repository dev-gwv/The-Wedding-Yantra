import type { FastifyInstance } from "fastify";
import { deliverableInput, deliverableListQuery, updateDeliverableInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as deliverables from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** Phase 6, Grow: what each event owes the client. */
export function deliverableRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  app.get<Ws>("/workspaces/:workspaceId/deliverables", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const q = parse(deliverableListQuery, request.query);
    return ok(await deliverables.listDeliverables(db, ctx, { eventId: q.eventId, status: q.status, mine: q.mine === "true" }));
  });

  app.post<Ws>("/workspaces/:workspaceId/deliverables", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const input = parse(deliverableInput, request.body);
    return reply.status(201).send(ok(await deliverables.createDeliverable(db, ctx, input)));
  });

  app.patch<WsId>("/workspaces/:workspaceId/deliverables/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This deliverable");
    return ok(await deliverables.updateDeliverable(db, ctx, id, parse(updateDeliverableInput, request.body)));
  });

  app.delete<WsId>("/workspaces/:workspaceId/deliverables/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await deliverables.deleteDeliverable(db, ctx, assertId(request.params.id, "This deliverable"));
    return ok({ deleted: true as const });
  });
}
