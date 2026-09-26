import type { FastifyInstance } from "fastify";
import { saveCustomFieldsInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as fields from "./service.js";

type Ws = { Params: { workspaceId: string } };

/** The business's own fields on enquiries, clients and events. */
export function fieldRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  app.get<Ws>("/workspaces/:workspaceId/custom-fields", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await fields.listFields(db, ctx.workspaceId));
  });
  app.put<Ws>("/workspaces/:workspaceId/custom-fields", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await fields.saveFields(db, ctx, parse(saveCustomFieldsInput, request.body)));
  });
}
