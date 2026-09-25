import type { FastifyInstance } from "fastify";
import { exportQuery, monthQuery } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import { exportMonth, monthReport } from "./service.js";

type Ws = { Params: { workspaceId: string } };

export function reportRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  app.get<Ws>("/workspaces/:workspaceId/reports/month", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { month } = parse(monthQuery, request.query);
    return ok(await monthReport(db, ctx, month));
  });

  // Returned as JSON so every app (web, phone) handles it the same way, then saves or shares it.
  app.get<Ws>("/workspaces/:workspaceId/exports", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { kind, month } = parse(exportQuery, request.query);
    return ok(await exportMonth(db, ctx, kind, month));
  });
}
