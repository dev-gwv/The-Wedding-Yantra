import type { FastifyInstance } from "fastify";
import { can } from "@wedding-yantra/core";
import { createWorkspaceInput, updateWorkspaceInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { forbidden, ok, parse } from "../../lib/http.js";
import { requireMember, requireUser } from "../auth/guard.js";
import * as workspaces from "./service.js";

type WsParams = { Params: { workspaceId: string } };

export function workspaceRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  app.post("/workspaces", async (request, reply) => {
    const { userId } = requireUser(request);
    const workspace = await workspaces.createWorkspace(db, userId, parse(createWorkspaceInput, request.body));
    return reply.status(201).send(ok(workspace));
  });

  app.get<WsParams>("/workspaces/:workspaceId", async (request) => {
    const member = await requireMember(db, request, request.params.workspaceId);
    return ok(await workspaces.getWorkspace(db, member.workspaceId, member.role));
  });

  app.patch<WsParams>("/workspaces/:workspaceId", async (request) => {
    const member = await requireMember(db, request, request.params.workspaceId);
    if (!can(member.role, "workspace.update")) throw forbidden("Only the owner or a manager can change business details");
    return ok(await workspaces.updateWorkspace(db, member, parse(updateWorkspaceInput, request.body)));
  });

  app.get<WsParams>("/workspaces/:workspaceId/home", async (request) => {
    const member = await requireMember(db, request, request.params.workspaceId);
    return ok(await workspaces.getHome(db, member));
  });
}
