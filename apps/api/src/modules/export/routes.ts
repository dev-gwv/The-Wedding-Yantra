import type { FastifyInstance } from "fastify";
import type { Db } from "../../db.js";
import { requireMember } from "../auth/guard.js";
import { exportWorkspace } from "./service.js";

type Ws = { Params: { workspaceId: string } };

export function exportRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  // A file to save, not the usual { success, data } reply. Errors still use the usual shape.
  app.get<Ws>("/workspaces/:workspaceId/export", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { fileName, data } = await exportWorkspace(db, ctx);
    request.log.info({ workspaceId: ctx.workspaceId, userId: ctx.userId }, "workspace data exported");
    return reply
      .header("Content-Type", "application/json; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${fileName}"`)
      .header("Cache-Control", "no-store")
      // The web app is on another domain: let it read the file name.
      .header("Access-Control-Expose-Headers", "Content-Disposition")
      .send(JSON.stringify(data, null, 2));
  });
}
