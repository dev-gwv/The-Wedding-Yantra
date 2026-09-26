import type { FastifyInstance } from "fastify";
import { BROADCAST_AUDIENCES } from "@wedding-yantra/core";
import { broadcastInput, broadcastRecipientInput } from "@wedding-yantra/types";
import { z } from "zod";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as broadcasts from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

const audienceQuery = z.object({ audience: z.enum(BROADCAST_AUDIENCES, "Choose who it goes to") });

/** Festival wishes, anniversary wishes and offers, sent person by person on WhatsApp. */
export function broadcastRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  app.get<Ws>("/workspaces/:workspaceId/broadcasts", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await broadcasts.listBroadcasts(db, ctx));
  });

  app.get<Ws>("/workspaces/:workspaceId/broadcasts/audience", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await broadcasts.previewAudience(db, ctx, parse(audienceQuery, request.query).audience));
  });

  app.post<Ws>("/workspaces/:workspaceId/broadcasts", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const made = await broadcasts.createBroadcast(db, ctx, parse(broadcastInput, request.body));
    return reply.status(201).send(ok(made));
  });

  app.get<WsId>("/workspaces/:workspaceId/broadcasts/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await broadcasts.getBroadcast(db, ctx, assertId(request.params.id, "This message")));
  });

  app.delete<WsId>("/workspaces/:workspaceId/broadcasts/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    await broadcasts.deleteBroadcast(db, ctx, assertId(request.params.id, "This message"));
    return ok({ deleted: true as const });
  });

  app.patch<{ Params: { workspaceId: string; id: string; recipientId: string } }>(
    "/workspaces/:workspaceId/broadcasts/:id/recipients/:recipientId",
    async (request) => {
      const ctx = await requireMember(db, request, request.params.workspaceId);
      return ok(
        await broadcasts.markRecipient(
          db,
          ctx,
          assertId(request.params.id, "This message"),
          assertId(request.params.recipientId, "This person"),
          parse(broadcastRecipientInput, request.body),
        ),
      );
    },
  );
}
