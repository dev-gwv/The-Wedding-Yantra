import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Role } from "@wedding-yantra/core";
import type { Db } from "../../db.js";
import { AppError, assertId } from "../../lib/http.js";
import { authenticate } from "./service.js";

export interface AuthContext {
  userId: string;
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

/**
 * Reads `Authorization: Bearer <token>` on every request. The same token works for the
 * web app and the mobile app; there are no cookies, so the API can live on any domain.
 */
export function registerAuth(app: FastifyInstance, db: Db): void {
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) return;
    const token = header.slice("Bearer ".length).trim();
    if (token) request.auth = await authenticate(db, token);
  });
}

export function requireUser(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError(401, "UNAUTHORIZED", "Please sign in to continue");
  return request.auth;
}

export interface MemberContext extends AuthContext {
  workspaceId: string;
  membershipId: string;
  role: Role;
}

/**
 * The tenant boundary. Every workspace route calls this first. Someone who is not an
 * active member gets "not found", so they can't even learn that the business exists.
 */
export async function requireMember(db: Db, request: FastifyRequest, workspaceId: string): Promise<MemberContext> {
  const auth = requireUser(request);
  assertId(workspaceId, "This business");
  const { rows } = await db.query<{ id: string; role: Role }>(
    `SELECT m.id, m.role
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
      WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.removed_at IS NULL`,
    [workspaceId, auth.userId],
  );
  const membership = rows[0];
  if (!membership) throw new AppError(404, "NOT_FOUND", "This business was not found");
  return { ...auth, workspaceId, membershipId: membership.id, role: membership.role };
}
