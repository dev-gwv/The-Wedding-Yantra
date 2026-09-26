import type { FastifyInstance } from "fastify";
import { optionInput, optionListQuery, reorderOptionsInput, updateOptionInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as options from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** The business's own lists: payment modes and expense categories. */
export function optionRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  app.get<Ws>("/workspaces/:workspaceId/options", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await options.listOptions(db, ctx.workspaceId, parse(optionListQuery, request.query).list));
  });
  app.post<Ws>("/workspaces/:workspaceId/options", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return reply.status(201).send(ok(await options.addOption(db, ctx, parse(optionInput, request.body))));
  });
  app.put<Ws>("/workspaces/:workspaceId/options/order", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await options.reorderOptions(db, ctx, parse(reorderOptionsInput, request.body)));
  });
  app.patch<WsId>("/workspaces/:workspaceId/options/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await options.updateOption(db, ctx, assertId(request.params.id, "This option"), parse(updateOptionInput, request.body)));
  });
}
