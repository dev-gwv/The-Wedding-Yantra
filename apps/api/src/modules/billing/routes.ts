import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { checkoutInput, manualPlanInput } from "@wedding-yantra/types";
import type { Config } from "../../config.js";
import type { Db } from "../../db.js";
import { AppError, assertId, fail, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import { validRazorpaySignature, type PaymentGateway } from "./gateway.js";
import { assertWithinPlan, billingOverview, handleRazorpayEvent, setManualPlan, startCheckout } from "./service.js";

type Ws = { Params: { workspaceId: string } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * While billing is enforced: nothing new once a trial runs out unpaid, and no more people or
 * events than the plan includes. Reading always works, and so does paying.
 */
export function billingGuard(app: FastifyInstance, deps: { db: Db; config: Config }) {
  if (!deps.config.billing.enforced) return;
  app.addHook("preHandler", async (request) => {
    if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
    const workspaceId = (request.params as { workspaceId?: string } | undefined)?.workspaceId;
    const url = request.routeOptions.url ?? "";
    if (!workspaceId || !UUID.test(workspaceId) || url.includes("/billing") || !request.auth) return;
    // Outsiders get the route's own "not found", not a hint about the business's plan.
    const member = await deps.db.query(`SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL`, [
      workspaceId,
      request.auth.userId,
    ]);
    if (!member.rowCount) return;
    const adding =
      request.method === "POST" && url.endsWith("/workspaces/:workspaceId/invitations")
        ? "member"
        : request.method === "POST" && url.endsWith("/workspaces/:workspaceId/events")
          ? "event"
          : "write";
    await assertWithinPlan(deps.db, workspaceId, adding);
  });
}

export function billingRoutes(app: FastifyInstance, deps: { db: Db; config: Config; gateway: PaymentGateway | null }) {
  const { db, config } = deps;

  app.get<Ws>("/workspaces/:workspaceId/billing", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await billingOverview(db, ctx, config));
  });

  app.post<Ws>("/workspaces/:workspaceId/billing/checkout", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await startCheckout(db, ctx, config, deps.gateway, parse(checkoutInput, request.body)));
  });

  // Razorpay's messages are checked against their signature over the exact bytes sent.
  app.register(async (hooks) => {
    hooks.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
      (request as { rawBody?: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(new AppError(400, "BAD_REQUEST", "That wasn't valid JSON"), undefined);
      }
    });
    hooks.post("/billing/razorpay/webhook", async (request, reply) => {
      const secret = config.billing.razorpay?.webhookSecret;
      if (!secret) return reply.status(404).send(fail("NOT_FOUND", "Online payment isn't switched on"));
      const raw = (request as { rawBody?: string }).rawBody ?? "";
      const signature = request.headers["x-razorpay-signature"];
      if (!validRazorpaySignature(raw, typeof signature === "string" ? signature : undefined, secret)) {
        return reply.status(400).send(fail("BAD_SIGNATURE", "This message isn't from Razorpay"));
      }
      const header = request.headers["x-razorpay-event-id"];
      const eventId = typeof header === "string" && header ? header : createHash("sha256").update(raw).digest("hex");
      return ok({ result: await handleRazorpayEvent(db, eventId, request.body) });
    });
  });

  // For whoever runs Wedding Yantra: record a plan paid by UPI or bank transfer.
  app.post<Ws>("/admin/workspaces/:workspaceId/plan", async (request, reply) => {
    const expected = config.billing.adminToken;
    const given = request.headers["x-admin-token"];
    const allowed =
      expected !== null && typeof given === "string" && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!allowed) return reply.status(404).send(fail("NOT_FOUND", `Route POST ${request.url} not found`));
    const workspaceId = assertId(request.params.workspaceId, "This business");
    return ok(await setManualPlan(db, workspaceId, parse(manualPlanInput, request.body)));
  });
}
