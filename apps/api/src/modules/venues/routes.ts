import type { FastifyInstance } from "fastify";
import { updateVenueInput, venueInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as venues from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** Master data: the venue list. */
export function venueRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  app.get<Ws & { Querystring: { archived?: string } }>("/workspaces/:workspaceId/venues", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await venues.listVenues(db, ctx, request.query.archived === "true"));
  });
  app.post<Ws>("/workspaces/:workspaceId/venues", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return reply.status(201).send(ok(await venues.createVenue(db, ctx, parse(venueInput, request.body))));
  });
  app.get<WsId>("/workspaces/:workspaceId/venues/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await venues.getVenue(db, ctx, assertId(request.params.id, "This venue")));
  });
  app.patch<WsId>("/workspaces/:workspaceId/venues/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await venues.updateVenue(db, ctx, assertId(request.params.id, "This venue"), parse(updateVenueInput, request.body)));
  });
}
