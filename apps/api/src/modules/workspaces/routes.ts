import type { FastifyInstance } from "fastify";
import { can } from "@wedding-yantra/core";
import { createWorkspaceInput, updateWorkspaceInput } from "@wedding-yantra/types";
import type { Config } from "../../config.js";
import type { Db } from "../../db.js";
import { forbidden, ok, parse } from "../../lib/http.js";
import { requireMember, requireUser } from "../auth/guard.js";
import * as workspaces from "./service.js";

type WsParams = { Params: { workspaceId: string } };

export function workspaceRoutes(app: FastifyInstance, deps: { db: Db; config: Config }) {
  const { db, config } = deps;

  app.post("/workspaces", async (request, reply) => {
    const { userId } = requireUser(request);
    const workspace = await workspaces.createWorkspace(db, userId, parse(createWorkspaceInput, request.body));
    return reply.status(201).send(ok(workspace));
  });

  app.get<WsParams>("/workspaces/:workspaceId", async (request) => {
    const member = await requireMember(db, request, request.params.workspaceId);
    return ok(await workspaces.getWorkspace(db, member));
  });

  app.patch<WsParams>("/workspaces/:workspaceId", async (request) => {
    const member = await requireMember(db, request, request.params.workspaceId);
    const input = parse(updateWorkspaceInput, request.body);
    const fields = Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined);
    const invoice = fields.filter((f) => (workspaces.INVOICE_FIELDS as readonly string[]).includes(f));
    // How invoices look and are numbered belongs to Payments & invoices; the rest to Business settings.
    if (invoice.length && !can(member, "bills.manage")) throw forbidden("Ask the owner for the Payments & invoices screen to change invoices");
    if (fields.length > invoice.length && !can(member, "workspace.update")) throw forbidden("Ask the owner for the Business settings screen to change these");
    return ok(await workspaces.updateWorkspace(db, member, input));
  });

  app.get<WsParams>("/workspaces/:workspaceId/home", async (request) => {
    const member = await requireMember(db, request, request.params.workspaceId);
    return ok(await workspaces.getHome(db, member, config));
  });
}
