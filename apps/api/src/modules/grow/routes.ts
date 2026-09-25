import type { FastifyInstance } from "fastify";
import type { Db } from "../../db.js";
import { assertId, ok } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as portal from "./portal.js";
import * as reviews from "./reviews.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** Phase 6, Grow: the client's own page, review requests and referrals. */
export function growRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  app.post<WsId>("/workspaces/:workspaceId/clients/:id/portal", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await portal.sharePortal(db, ctx, assertId(request.params.id, "This client")));
  });

  app.delete<WsId>("/workspaces/:workspaceId/clients/:id/portal", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await portal.stopPortal(db, ctx, assertId(request.params.id, "This client"));
    return ok({ stopped: true as const });
  });

  app.post<WsId>("/workspaces/:workspaceId/events/:id/review-request", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await reviews.requestReview(db, ctx, assertId(request.params.id, "This event")));
  });

  app.get<Ws>("/workspaces/:workspaceId/grow", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await reviews.growSummary(db, ctx));
  });

  // Public: the client opens their page without signing in.
  app.get<{ Params: { token: string } }>("/public/clients/:token", async (request) => {
    return ok(await portal.getPortal(db, request.params.token));
  });
}
