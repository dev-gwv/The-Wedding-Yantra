import type { FastifyInstance } from "fastify";
import { activityQuery, dailySummaryQuery, monthQuery } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import { activityFeed } from "./activity.js";
import { teamScores } from "./scores.js";
import { dailySummary } from "./summary.js";

type Ws = { Params: { workspaceId: string } };

export function reviewRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  // Everyone's month for owners and managers; your own for everyone else.
  app.get<Ws>("/workspaces/:workspaceId/scores", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { month } = parse(monthQuery, request.query);
    return ok(await teamScores(db, ctx, month));
  });

  app.get<Ws>("/workspaces/:workspaceId/activity", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await activityFeed(db, ctx, parse(activityQuery, request.query)));
  });

  app.get<Ws>("/workspaces/:workspaceId/daily-summary", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { date } = parse(dailySummaryQuery, request.query);
    return ok(await dailySummary(db, ctx, date));
  });
}
