import { can } from "@wedding-yantra/core";
import { metaCompleteInput, metaConnectInput, metaTestLeadInput, updateMetaPageInput } from "@wedding-yantra/types";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Config } from "../../config.js";
import type { Db } from "../../db.js";
import { AppError, fail, forbidden, notFound, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import { openPageToken, openUserToken, type MetaEnv } from "./common.js";
import * as connect from "./connect.js";
import { createFakeGraph, type FakeGraph } from "./fake-graph.js";
import { GraphError, metaGraphClient, type MetaGraph } from "./graph.js";
import { dataDeletion, deauthorize, deletionStatus, handshake, receiveWebhook } from "./webhook.js";
import type { LeadWorker } from "./worker.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** Webhook posts can carry many leads at once. */
const BODY_LIMIT = 5 * 1024 * 1024;

/** The Graph client the config asks for: a pretend Facebook with META_FAKE, null when Meta isn't set up. */
export function metaGraphFor(config: Config): MetaGraph | null {
  const meta = config.meta;
  if (!meta) return null;
  if (meta.fake) return createFakeGraph({ appSecret: meta.appSecret, appId: meta.appId, version: meta.graphVersion });
  return metaGraphClient({ appId: meta.appId, appSecret: meta.appSecret, version: meta.graphVersion, loginConfigId: meta.loginConfigId });
}

interface Deps {
  db: Db;
  config: Config;
  graph: MetaGraph | null;
  worker: LeadWorker;
}

/**
 * Facebook and Instagram lead ads: the owner's screens (/workspaces/:id/meta…) and what Meta
 * calls (/integrations/meta/…). Meta's calls match no rate-limit rule (those cover /public/
 * and /auth/ only), so a burst of leads is never turned away.
 */
export function metaRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config, graph, worker } = deps;
  const service = (request: FastifyRequest): connect.MetaDeps => ({ db, config, graph, worker, log: request.log, checks });
  const checks = new Map<string, number>();
  const env = (request: FastifyRequest): MetaEnv | null =>
    config.meta && graph ? { db, config, meta: config.meta, graph, log: request.log } : null;

  // ---- The owner's screens --------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/meta", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.metaStatus(service(request), ctx));
  });

  app.post<Ws>("/workspaces/:workspaceId/meta/connect", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.startConnect(service(request), ctx, parse(metaConnectInput, request.body)));
  });

  app.post<Ws>("/workspaces/:workspaceId/meta/complete", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.completeConnect(service(request), ctx, parse(metaCompleteInput, request.body)));
  });

  app.patch<WsId>("/workspaces/:workspaceId/meta/pages/:id", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.updatePage(service(request), ctx, request.params.id, parse(updateMetaPageInput, request.body)));
  });

  app.post<WsId>("/workspaces/:workspaceId/meta/pages/:id/check", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.checkPage(service(request), ctx, request.params.id));
  });

  app.post<WsId>("/workspaces/:workspaceId/meta/pages/:id/test-lead", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.sendTestLead(service(request), ctx, request.params.id, parse(metaTestLeadInput, request.body)));
  });

  app.get<Ws>("/workspaces/:workspaceId/meta/recent", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.recentLeads(service(request), ctx));
  });

  app.delete<Ws>("/workspaces/:workspaceId/meta", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await connect.disconnect(service(request), ctx));
  });

  // ---- What Meta calls: checked against the raw bytes, so the body is kept as it came ----
  app.register(async (raw) => {
    const keep = (_request: FastifyRequest, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body);
    raw.addContentTypeParser("application/json", { parseAs: "buffer", bodyLimit: BODY_LIMIT }, keep);
    raw.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "buffer", bodyLimit: BODY_LIMIT }, keep);
    const bytes = (request: FastifyRequest) => (Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0));
    const notSetUp = () => new AppError(404, "NOT_FOUND", "Facebook leads aren't set up on this server");

    // Meta checking the address when the webhook is saved.
    raw.get("/integrations/meta/webhook", async (request, reply) => {
      if (!config.meta || !graph) throw notSetUp();
      const challenge = handshake(config.meta, request.query as Record<string, unknown>);
      if (challenge === null) return reply.status(403).send(fail("FORBIDDEN", "That verify token isn't ours"));
      return reply.type("text/plain; charset=utf-8").send(challenge);
    });

    raw.post("/integrations/meta/webhook", { bodyLimit: BODY_LIMIT }, async (request, reply) => {
      const e = env(request);
      if (!e) throw notSetUp();
      const signature = request.headers["x-hub-signature-256"];
      const result = await receiveWebhook(e, bytes(request), typeof signature === "string" ? signature : undefined, request.log);
      if (result.status !== 200) return reply.status(result.status).send(fail(result.code, result.message));
      worker.nudge();
      return ok({ received: result.received });
    });

    raw.post("/integrations/meta/deauthorize", { bodyLimit: BODY_LIMIT }, async (request) => {
      const e = env(request);
      if (!e) throw notSetUp();
      await deauthorize(e, bytes(request), request.headers["content-type"]);
      return ok({ done: true });
    });

    // Meta reads this answer as it is: { url, confirmation_code }.
    raw.post("/integrations/meta/data-deletion", { bodyLimit: BODY_LIMIT }, async (request, reply) => {
      const e = env(request);
      if (!e) throw notSetUp();
      return reply.send(await dataDeletion(e, bytes(request), request.headers["content-type"]));
    });

    raw.get<{ Params: { code: string } }>("/integrations/meta/deletion/:code", async (request) => ok(await deletionStatus(db, request.params.code)));
  });

  devRoutes(app, deps);
}

const devLeadsInput = z.object({
  workspaceId: z.uuid(),
  /** Meta's Page id; the first Page that's on when not given */
  pageId: z.string().max(64).optional(),
  /** Meta's form id; the Page's first form when not given */
  formId: z.string().max(64).optional(),
  count: z.number().int().min(1).max(20).optional(),
  platform: z.enum(["fb", "ig"]).optional(),
  name: z.string().max(80).optional(),
  phone: z.string().max(20).optional(),
});

const devFailInput = z.object({
  workspaceId: z.uuid(),
  pageId: z.string().max(64).optional(),
  kind: z.enum(["lead_access", "token", "reconnect_soon", "transient", "rate_limit", "clear"]),
});

const isFake = (graph: MetaGraph | null): graph is FakeGraph => !!graph && "seedLead" in graph;

/**
 * Only with META_FAKE, never in production: leads filled on the pretend Facebook, and problems
 * made on purpose, for trying the screens out. The owner of the business only.
 */
function devRoutes(app: FastifyInstance, deps: Deps) {
  const { db, config, graph, worker } = deps;
  if (!config.meta?.fake || config.nodeEnv === "production" || !isFake(graph)) return;
  const fake = graph;
  const meta = config.meta;

  async function ownerPage(request: FastifyRequest, workspaceId: string, pageId: string | undefined) {
    const ctx = await requireMember(db, request, workspaceId);
    if (!can(ctx, "members.hr")) throw forbidden("Only the owner connects Facebook");
    const { rows } = await db.query<{ id: string; page_id: string; workspace_id: string; page_token_enc: string | null; connection_id: string | null }>(
      `SELECT id, page_id, workspace_id, page_token_enc, connection_id FROM meta_pages
        WHERE workspace_id = $1 AND active AND ($2::text IS NULL OR page_id = $2) ORDER BY lower(name), id LIMIT 1`,
      [workspaceId, pageId ?? null],
    );
    if (!rows[0]) throw notFound("A Page that's on");
    return { ctx, page: rows[0] };
  }

  app.post("/integrations/meta/dev/leads", async (request) => {
    const input = parse(devLeadsInput, request.body);
    const { page } = await ownerPage(request, input.workspaceId, input.pageId);
    const form = await db.query<{ form_id: string }>(
      `SELECT form_id FROM meta_forms WHERE workspace_id = $1 AND meta_page_id = $2 AND ($3::text IS NULL OR form_id = $3) ORDER BY created_at, form_id LIMIT 1`,
      [input.workspaceId, page.id, input.formId ?? null],
    );
    const formId = form.rows[0]?.form_id;
    if (!formId) throw notFound("A form on this Page");
    const leads = [];
    for (let i = 0; i < (input.count ?? 1); i++) {
      const fieldData = input.name || input.phone
        ? [
            ...(input.name ? [{ name: "full_name", values: [input.name] }] : []),
            ...(input.phone ? [{ name: "phone_number", values: [input.phone] }] : []),
            { name: "city", values: ["Jaipur"] },
          ]
        : undefined;
      const lead = fake.seedLead(page.page_id, formId, { platform: input.platform ?? "fb", ...(fieldData ? { fieldData } : {}) });
      leads.push({ leadgenId: lead.id, createdTime: lead.createdTime });
    }
    return ok({ pageId: page.page_id, formId, leads });
  });

  app.post("/integrations/meta/dev/fail", async (request) => {
    const input = parse(devFailInput, request.body);
    const { page } = await ownerPage(request, input.workspaceId, input.pageId);
    const now = new Date();
    switch (input.kind) {
      case "lead_access":
        fake.setLeadAccess(page.page_id, { canAccess: false, managerEnabled: true, failureReason: "Wedding Yantra isn't assigned to this Page in Leads access" });
        break;
      case "token": {
        const token = openPageToken(meta, page);
        if (token) fake.revokeToken(token);
        break;
      }
      case "reconnect_soon": {
        const soon = new Date(now.getTime() + 10 * 86_400_000);
        const token = openPageToken(meta, page);
        if (token) fake.setTokenExpiry(token, { dataAccessExpiresAt: soon });
        const conn = await db.query<{ workspace_id: string; fb_user_id: string; user_token_enc: string | null }>(
          `SELECT workspace_id, fb_user_id, user_token_enc FROM meta_connections WHERE id = $1 AND workspace_id = $2`,
          [page.connection_id, input.workspaceId],
        );
        const userToken = conn.rows[0] ? openUserToken(meta, conn.rows[0]) : null;
        if (userToken) fake.setTokenExpiry(userToken, { dataAccessExpiresAt: soon });
        break;
      }
      case "transient":
        fake.failNext("getLead", new GraphError("transient", "Meta took too long to answer"));
        return ok({ done: true });
      case "rate_limit":
        fake.failNext("getLead", new GraphError("rate_limit", "Meta: (#4) Application request limit reached", { code: 4, retryAfterMs: 60_000 }));
        return ok({ done: true });
      case "clear":
        fake.setLeadAccess(page.page_id, { canAccess: true, managerEnabled: false, failureReason: null });
        fake.failAlways("getLead", null);
        break;
    }
    await worker.checkWorkspace(input.workspaceId, now);
    return ok({ done: true });
  });
}
