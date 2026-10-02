import type { FastifyInstance } from "fastify";
import { searchQuery } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as search from "./service.js";

type Ws = { Params: { workspaceId: string } };

/** The search box: people and records by name or phone, within each person's screens. */
export function searchRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  app.get<Ws>("/workspaces/:workspaceId/search", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { q } = parse(searchQuery, request.query);
    return ok(await search.searchAll(db, ctx, q));
  });
}
