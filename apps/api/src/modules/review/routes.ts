import type { FastifyInstance } from "fastify";
import { activityQuery, dailySummaryQuery, ledgerQuery, monthQuery, recogniseInput, savePointSettingsInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import { activityFeed } from "./activity.js";
import { teamScores } from "./scores.js";
import { dailySummary } from "./summary.js";
import * as points from "./points.js";

type Ws = { Params: { workspaceId: string } };

export function reviewRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;

  // Everyone's month for owners and managers; your own for everyone else.
  app.get<Ws>("/workspaces/:workspaceId/scores", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { month } = parse(monthQuery, request.query);
    return ok(await teamScores(db, ctx, month));
  });

  // Points: the month's board, how someone earned theirs, the rules, and recognition.
  app.get<Ws>("/workspaces/:workspaceId/points/leaderboard", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const { month } = parse(monthQuery, request.query);
    return ok(await points.leaderboard(db, ctx, month));
  });
  app.get<Ws>("/workspaces/:workspaceId/points/ledger", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    const q = parse(ledgerQuery, request.query);
    const { month } = parse(monthQuery, { month: q.month });
    return ok(await points.ledger(db, ctx, { userId: q.userId, month }));
  });
  app.get<Ws>("/workspaces/:workspaceId/points/rules", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await points.getPointSettings(db, ctx));
  });
  app.put<Ws>("/workspaces/:workspaceId/points/rules", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await points.savePointSettings(db, ctx, parse(savePointSettingsInput, request.body)));
  });
  app.post<Ws>("/workspaces/:workspaceId/points/recognise", async (request, reply) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return reply.status(201).send(ok({ points: await points.recognise(db, ctx, parse(recogniseInput, request.body)) }));
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
