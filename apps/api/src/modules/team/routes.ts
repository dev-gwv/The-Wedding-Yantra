import type { FastifyInstance } from "fastify";
import { createInvitationInput, updateMemberInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember, requireUser } from "../auth/guard.js";
import * as team from "./service.js";

type WsParams = { Params: { workspaceId: string } };
type MemberParams = { Params: { workspaceId: string; memberId: string } };
type InviteParams = { Params: { workspaceId: string; invitationId: string } };
type TokenParams = { Params: { token: string } };

export function teamRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  app.get<WsParams>("/workspaces/:workspaceId/team", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await team.getTeam(db, ctx));
  });

  app.post<WsParams>("/workspaces/:workspaceId/invitations", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const created = await team.inviteMember(db, ctx, parse(createInvitationInput, request.body));
    return reply.status(201).send(ok(created));
  });

  app.delete<InviteParams>("/workspaces/:workspaceId/invitations/:invitationId", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    await team.revokeInvitation(db, ctx, assertId(request.params.invitationId, "This invitation"));
    return ok({ revoked: true as const });
  });

  app.patch<MemberParams>("/workspaces/:workspaceId/members/:memberId", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { role } = parse(updateMemberInput, request.body);
    await team.updateMemberRole(db, ctx, assertId(request.params.memberId, "This team member"), role);
    return ok({ updated: true as const });
  });

  app.delete<MemberParams>("/workspaces/:workspaceId/members/:memberId", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    await team.removeMember(db, ctx, assertId(request.params.memberId, "This team member"));
    return ok({ removed: true as const });
  });

  // Public: anyone with the link can see who invited them before signing in.
  app.get<TokenParams>("/invitations/:token", async (request) => {
    return ok(await team.previewInvitation(db, request.params.token));
  });

  app.post<TokenParams>("/invitations/:token/accept", async (request) => {
    const auth = requireUser(request);
    return ok(await team.acceptInvitation(db, auth, request.params.token));
  });
}
