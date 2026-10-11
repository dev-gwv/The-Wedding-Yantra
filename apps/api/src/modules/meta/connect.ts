import { can, META_TEST_TOOL_URL, metaProblem, readLeadAnswers, type MetaProblemFacts, type MetaProblemKind } from "@wedding-yantra/core";
import type {
  IncomingLeadItem,
  MetaCheckResult,
  MetaCompleteInput,
  MetaCompleteResult,
  MetaConnectInput,
  MetaConnection,
  MetaForm,
  MetaPage,
  MetaPageStatus,
  MetaProblem,
  MetaStatus,
  MetaTestLeadInput,
  MetaTestLeadResult,
  UpdateMetaPageInput,
} from "@wedding-yantra/types";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config.js";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { randomToken, sha256, signState, verifyState } from "../../lib/crypto.js";
import { AppError, assertId, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import {
  failLeftovers,
  leadAccessBlock,
  loadPage,
  openPageToken,
  openUserToken,
  PAGE_COLUMNS,
  PAGE_JOINS,
  sealPageToken,
  sealUserToken,
  sourceAlert,
  unsubscribeIfLast,
  type MetaEnv,
  type PageRow,
} from "./common.js";
import { isGraphError, type GraphPage, type MetaGraph } from "./graph.js";
import type { LeadWorker } from "./worker.js";

/**
 * The owner's side of Facebook and Instagram lead ads: connecting with "Continue with
 * Facebook", choosing which Pages send their leads here, checking them, sending a test lead,
 * and disconnecting. Only the owner does any of it.
 */

export interface MetaDeps {
  db: Db;
  config: Config;
  graph: MetaGraph | null;
  worker: LeadWorker;
  log: Pick<FastifyBaseLogger, "info" | "warn" | "error">;
  /** When each Page was last checked by hand (row id -> time): once a minute at most */
  checks?: Map<string, number>;
}

const requireOwner = (ctx: MemberContext) => {
  if (!can(ctx, "members.hr")) throw forbidden("Only the owner connects Facebook");
};

/** The permissions leads can't come in without. Ad names (ads_management) are best effort. */
export const REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval"];
const STATE_MINUTES = 15;
/** A second "complete" with the same login within this long gets the first one's answer. */
const REPLAY_MINUTES = 10;
const PROBLEM_STATUSES: readonly MetaPageStatus[] = ["needs_reconnect", "lead_access", "not_subscribed", "permission_missing"];
const QUIET_HOURS = 72;
const BUSY_LEADS = 5;

/** Whether this business can connect Facebook: set up on the server, and switched on for it. */
export function metaAvailability(config: Config, graph: MetaGraph | null, workspaceId: string): Pick<MetaStatus, "available" | "reason"> {
  if (!config.meta || !graph) return { available: false, reason: "not_configured" };
  if (config.meta.enabledFor !== "all" && !config.meta.enabledFor.has(workspaceId.toLowerCase())) return { available: false, reason: "not_enabled" };
  return { available: true, reason: null };
}

function requireEnv(deps: MetaDeps, workspaceId: string): MetaEnv {
  const { available, reason } = metaAvailability(deps.config, deps.graph, workspaceId);
  if (!available || !deps.config.meta || !deps.graph) {
    throw new AppError(
      409,
      "META_UNAVAILABLE",
      reason === "not_enabled" ? "Facebook leads aren't switched on for your business yet." : "Facebook leads aren't set up on this server.",
    );
  }
  return { db: deps.db, config: deps.config, meta: deps.config.meta, graph: deps.graph, log: deps.log };
}

/** Someone else's Facebook id, never stored in the activity log as it is: a hash finds it for a deletion request. */
export const fbUserHash = (fbUserId: string) => sha256(fbUserId);

const jitteredPoll = (pollMinutes: number, now: Date) => new Date(now.getTime() + pollMinutes * (0.9 + Math.random() * 0.2) * 60_000);

// ---- what the screen shows ------------------------------------------------------------

const PROBES = ["Priya Sharma", "+919876543210", "name@example.invalid", "14/12/2026", "250", "5 lakh", "Wedding"];

/**
 * Which enquiry field each question fills ("How we read this form"), worked out exactly the way
 * a lead's answers are read: the question is read with sample answers until one is taken.
 */
function questionUse(q: { key: string; label: string }, today: string): string | null {
  for (const value of PROBES) {
    const use = readLeadAnswers({ fields: [{ key: q.key, label: q.label, values: [value] }], today }).answers[0]?.usedFor;
    if (use) return use;
  }
  return null;
}

const problem = (kind: MetaProblemKind, facts: MetaProblemFacts, metaSays: string | null = null): MetaProblem => ({
  kind,
  ...metaProblem(kind, facts),
  metaSays: metaSays?.trim() || null,
});

type PageViewRow = {
  id: string;
  page_id: string;
  name: string;
  tasks: string[];
  active: boolean;
  status: MetaPageStatus;
  problem: string | null;
  last_lead_at: Date | null;
  last_webhook_at: Date | null;
  fb_user_name: string | null;
  elsewhere: boolean;
  week: number;
  failed: number;
  failed_error: string | null;
  busy: number;
};

async function pageViews(db: Queryable, workspaceId: string, now: Date, only?: string): Promise<MetaPage[]> {
  const { rows } = await db.query<PageViewRow>(
    `SELECT p.id, p.page_id, p.name, p.tasks, p.active, p.status, p.problem, p.last_lead_at, p.last_webhook_at, c.fb_user_name,
            -- Only whether another business has it on: never which one.
            (NOT p.active AND EXISTS (SELECT 1 FROM meta_pages o WHERE o.page_id = p.page_id AND o.active AND o.workspace_id <> p.workspace_id)) AS elsewhere,
            (SELECT count(*) FROM incoming_leads i
              WHERE i.workspace_id = p.workspace_id AND i.meta_page_id = p.id AND i.status IN ('added', 'merged') AND NOT i.is_test
                AND i.received_at > $2::timestamptz - interval '7 days')::int AS week,
            (SELECT count(*) FROM incoming_leads i
              WHERE i.workspace_id = p.workspace_id AND i.meta_page_id = p.id AND i.status = 'failed'
                AND coalesce(i.error_kind, '') NOT IN ('page_off', 'expired') AND i.received_at > $2::timestamptz - interval '30 days')::int AS failed,
            (SELECT i.last_error FROM incoming_leads i
              WHERE i.workspace_id = p.workspace_id AND i.meta_page_id = p.id AND i.status = 'failed' ORDER BY i.processed_at DESC NULLS LAST LIMIT 1) AS failed_error,
            (SELECT count(*) FROM incoming_leads i
              WHERE i.workspace_id = p.workspace_id AND i.meta_page_id = p.id AND i.status IN ('added', 'merged') AND NOT i.is_test
                AND i.processed_at BETWEEN p.last_lead_at - interval '14 days' AND p.last_lead_at)::int AS busy
       FROM meta_pages p
       LEFT JOIN meta_connections c ON c.id = p.connection_id AND c.workspace_id = p.workspace_id
      WHERE p.workspace_id = $1 AND ${only ? "p.id = $3" : "(p.connection_id IS NOT NULL OR p.active)"}
      ORDER BY p.active DESC, lower(p.name), p.id`,
    only ? [workspaceId, now, only] : [workspaceId, now],
  );
  if (!rows.length) return [];
  const forms = await db.query<{
    id: string;
    meta_page_id: string;
    form_id: string;
    name: string;
    status: string | null;
    leads_count: number;
    last_lead_at: Date | null;
    questions: { key?: unknown; label?: unknown; type?: unknown }[];
  }>(
    `SELECT id, meta_page_id, form_id, name, status, leads_count, last_lead_at, questions FROM meta_forms
      WHERE workspace_id = $1 AND meta_page_id = ANY($2::uuid[])
      ORDER BY (status IS NULL OR status = 'ACTIVE') DESC, lower(name), form_id`,
    [workspaceId, rows.map((r) => r.id)],
  );
  const today = now.toISOString().slice(0, 10);
  const formsBy = new Map<string, MetaForm[]>();
  for (const f of forms.rows) {
    const questions = (Array.isArray(f.questions) ? f.questions : []).flatMap((q) => {
      const key = typeof q?.key === "string" ? q.key : "";
      if (!key) return [];
      const label = typeof q.label === "string" && q.label ? q.label : key;
      return [{ key, label, type: typeof q.type === "string" ? q.type : "CUSTOM", usedFor: questionUse({ key, label }, today) }];
    });
    const list = formsBy.get(f.meta_page_id) ?? [];
    list.push({
      id: f.id,
      formId: f.form_id,
      name: f.name,
      status: f.status,
      leadsCount: f.leads_count,
      lastLeadAt: f.last_lead_at?.toISOString() ?? null,
      questions,
    });
    formsBy.set(f.meta_page_id, list);
  }
  return rows.map((r) => {
    const facts = { pageName: r.name, who: r.fb_user_name };
    const problems: MetaProblem[] = [];
    if (r.active && PROBLEM_STATUSES.includes(r.status)) problems.push(problem(r.status as MetaProblemKind, facts, r.problem));
    if (r.failed > 0) problems.push(problem("failed_leads", { ...facts, count: r.failed }, r.failed_error));
    const quietFor = r.last_lead_at ? now.getTime() - r.last_lead_at.getTime() : 0;
    if (r.active && r.status === "ok" && r.busy >= BUSY_LEADS && quietFor >= QUIET_HOURS * 3_600_000) {
      problems.push(problem("quiet", { ...facts, days: Math.floor(quietFor / 86_400_000) }));
    }
    return {
      id: r.id,
      pageId: r.page_id,
      name: r.name,
      active: r.active,
      status: r.active ? r.status : "off",
      canAdvertise: r.tasks.includes("ADVERTISE"),
      canManage: r.tasks.includes("MANAGE"),
      inOtherBusiness: r.elsewhere,
      problems,
      lastLeadAt: r.last_lead_at?.toISOString() ?? null,
      lastWebhookAt: r.last_webhook_at?.toISOString() ?? null,
      leadsThisWeek: r.week,
      forms: formsBy.get(r.id) ?? [],
    };
  });
}

async function buildStatus(deps: MetaDeps, workspaceId: string, now: Date): Promise<MetaStatus> {
  const conns = await deps.db.query<{
    id: string;
    fb_user_name: string | null;
    status: MetaConnection["status"];
    connected_at: Date;
    data_access_expires_at: Date | null;
    expires_on: string | null;
    connector_name: string | null;
    still_here: boolean;
  }>(
    `SELECT c.id, c.fb_user_name, c.status, c.connected_at, c.data_access_expires_at, u.name AS connector_name,
            ((c.data_access_expires_at AT TIME ZONE w.timezone)::date)::text AS expires_on,
            EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = c.workspace_id AND m.user_id = c.connected_by AND m.removed_at IS NULL) AS still_here
       FROM meta_connections c JOIN workspaces w ON w.id = c.workspace_id LEFT JOIN users u ON u.id = c.connected_by
      WHERE c.workspace_id = $1
      ORDER BY c.connected_at, c.id`,
    [workspaceId],
  );
  const problems: MetaProblem[] = [];
  for (const c of conns.rows) {
    if (c.status === "needs_reconnect" || c.status === "revoked") problems.push(problem("needs_reconnect", { who: c.fb_user_name }));
    else if (c.status === "reconnect_soon") problems.push(problem("reconnect_soon", { by: c.expires_on }));
    if (!c.still_here) problems.push(problem("connector_left", { who: c.connector_name }));
  }
  if (deps.worker.outage(now)) problems.push(problem("meta_outage", {}));
  return {
    ...metaAvailability(deps.config, deps.graph, workspaceId),
    mode: deps.config.meta?.fake ? "fake" : "live",
    connections: conns.rows.map((c) => ({
      id: c.id,
      fbUserName: c.fb_user_name,
      status: c.status,
      connectedByName: c.connector_name,
      connectedAt: c.connected_at.toISOString(),
      dataAccessExpiresAt: c.data_access_expires_at?.toISOString() ?? null,
    })),
    pages: await pageViews(deps.db, workspaceId, now),
    problems,
  };
}

async function pageView(deps: MetaDeps, workspaceId: string, id: string, now: Date): Promise<MetaPage> {
  const [page] = await pageViews(deps.db, workspaceId, now, id);
  if (!page) throw notFound("This Page");
  return page;
}

export async function metaStatus(deps: MetaDeps, ctx: MemberContext, now = new Date()): Promise<MetaStatus> {
  requireOwner(ctx);
  return buildStatus(deps, ctx.workspaceId, now);
}

// ---- Continue with Facebook --------------------------------------------------------------

/** Starts "Continue with Facebook": a single-use state for this business and person, and Facebook's address. */
export async function startConnect(deps: MetaDeps, ctx: MemberContext, input: MetaConnectInput, now = new Date()): Promise<{ url: string }> {
  requireOwner(ctx);
  const env = requireEnv(deps, ctx.workspaceId);
  const nonce = randomToken();
  const expires = new Date(now.getTime() + STATE_MINUTES * 60_000);
  await deps.db.query(`INSERT INTO meta_oauth_states (nonce, workspace_id, user_id, reconnect, expires_at) VALUES ($1, $2, $3, $4, $5)`, [
    nonce,
    ctx.workspaceId,
    ctx.userId,
    !!input.reconnect,
    expires,
  ]);
  const state = signState(
    { w: ctx.workspaceId, u: ctx.userId, n: nonce, x: Math.floor(expires.getTime() / 1000), ...(input.reconnect ? { r: "reconnect" } : {}) },
    env.meta.tokenKey,
  );
  // Logging in again asks again for any permission refused last time.
  return { url: env.graph.loginUrl({ state, redirectUri: env.meta.redirectUri, rerequest: !!input.reconnect }) };
}

type Stored = { added: number; needsChoice: boolean } | { error: { status: number; code: string; message: string; fields?: Record<string, string> } };

const stateInvalid = () => new AppError(400, "META_STATE_INVALID", "This Facebook login has expired. Please tap Continue with Facebook again.");

/** Facebook came back with a code: the connection and its Pages are saved, and a single Page is switched on. */
export async function completeConnect(deps: MetaDeps, ctx: MemberContext, input: MetaCompleteInput, now = new Date()): Promise<MetaCompleteResult> {
  requireOwner(ctx);
  const env = requireEnv(deps, ctx.workspaceId);
  const state = verifyState(input.state, env.meta.tokenKey, Math.floor(now.getTime() / 1000));
  if (!state) throw stateInvalid();
  if (state.w !== ctx.workspaceId || state.u !== ctx.userId) {
    throw new AppError(403, "META_WRONG_PERSON", "This Facebook login was started by someone else. Please start it again yourself.");
  }
  // Single use: only the first request gets to finish it.
  const taken = await deps.db.query(
    `UPDATE meta_oauth_states SET used_at = $4 WHERE nonce = $1 AND workspace_id = $2 AND user_id = $3 AND used_at IS NULL AND expires_at > $4 RETURNING nonce`,
    [state.n, ctx.workspaceId, ctx.userId, now],
  );
  if (!taken.rowCount) return replay(deps, ctx, state.n, now);

  // The state is used up now (and Facebook's code with it), so any failure is final: it's saved
  // for a repeat to get the same answer, and the owner starts again with Continue with Facebook.
  let stored: Stored;
  try {
    stored = await finishConnect(env, deps, ctx, input.code, now);
  } catch (err) {
    let e: AppError;
    if (err instanceof AppError) e = err;
    else if (isGraphError(err) && err.kind === "transient") {
      e = new AppError(503, "META_UNREACHABLE", "Couldn't reach Facebook. Please tap Continue with Facebook again.");
    } else if (isGraphError(err)) {
      e = new AppError(400, "META_LOGIN_FAILED", "Facebook didn't accept this login. Please tap Continue with Facebook again.");
    } else {
      deps.log.error({ message: (err as Error)?.message, code: (err as { code?: string })?.code }, "meta: couldn't finish connecting");
      e = new AppError(500, "META_CONNECT_FAILED", "Something went wrong on our side. Please tap Continue with Facebook again.");
    }
    await saveResult(deps.db, state.n, ctx.workspaceId, { error: { status: e.statusCode, code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } });
    throw e;
  }
  await saveResult(deps.db, state.n, ctx.workspaceId, stored);
  return { ...(await buildStatus(deps, ctx.workspaceId, now)), ...(stored as { added: number; needsChoice: boolean }) };
}

async function saveResult(db: Queryable, nonce: string, workspaceId: string, result: Stored): Promise<void> {
  await db.query(`UPDATE meta_oauth_states SET result = $3 WHERE nonce = $1 AND workspace_id = $2`, [nonce, workspaceId, result]);
}

/** The same login sent twice (a phone browser reloading, React running an effect twice): the first one's answer. */
async function replay(deps: MetaDeps, ctx: MemberContext, nonce: string, now: Date): Promise<MetaCompleteResult> {
  for (let i = 0; i < 80; i++) {
    const { rows } = await deps.db.query<{ used_at: Date | null; result: Stored | null }>(
      `SELECT used_at, result FROM meta_oauth_states WHERE nonce = $1 AND workspace_id = $2 AND user_id = $3`,
      [nonce, ctx.workspaceId, ctx.userId],
    );
    const r = rows[0];
    if (!r?.used_at || now.getTime() - r.used_at.getTime() > REPLAY_MINUTES * 60_000) throw stateInvalid();
    if (r.result) {
      if ("error" in r.result) throw new AppError(r.result.error.status, r.result.error.code, r.result.error.message, r.result.error.fields);
      return { ...(await buildStatus(deps, ctx.workspaceId, now)), ...r.result };
    }
    // The first request is still talking to Facebook.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new AppError(409, "META_BUSY", "Still connecting to Facebook. Please wait a moment and refresh.");
}

async function finishConnect(env: MetaEnv, deps: MetaDeps, ctx: MemberContext, code: string, now: Date): Promise<{ added: number; needsChoice: boolean }> {
  const ws = ctx.workspaceId;
  const short = await env.graph.exchangeCode(code, env.meta.redirectUri);
  const user = await env.graph.longLivedUserToken(short.accessToken);
  const me = await env.graph.me(user.accessToken);
  if (!me.id) throw new AppError(400, "META_LOGIN_FAILED", "Facebook didn't accept this login. Please tap Continue with Facebook again.");
  const info = await env.graph.debugToken(user.accessToken);
  const missing = REQUIRED_SCOPES.filter((s) => !info.scopes.includes(s));
  if (missing.length) {
    // The Pages this person connected before can't be read now either.
    await deps.db.query(
      `UPDATE meta_pages p SET status = 'permission_missing', problem = 'Some permissions were turned off on Facebook'
         FROM meta_connections c
        WHERE c.id = p.connection_id AND c.workspace_id = $1 AND c.fb_user_id = $2 AND p.workspace_id = $1 AND p.active`,
      [ws, me.id],
    );
    throw new AppError(422, "META_PERMISSIONS_MISSING", "Some Facebook permissions were not given. Tap Continue with Facebook again and keep every option switched on.", {
      permissions: missing.join(", "),
    });
  }
  // Only the Pages leads were allowed for (Facebook lets people untick some).
  const leadsGrant = info.granularScopes.find((g) => g.scope === "leads_retrieval");
  const granted = (pageId: string) => !leadsGrant || leadsGrant.targetIds.length === 0 || leadsGrant.targetIds.includes(pageId);
  const pages = (await env.graph.listPages(user.accessToken)).filter((p) => p.id && granted(p.id));
  if (!pages.length) {
    throw new AppError(422, "META_NO_PAGES", "No Facebook Page was shared. Tap Continue with Facebook again and tick the Page your lead forms are on.");
  }

  const saved = await withTransaction(deps.db, async (tx) => {
    const conn = await tx.query<{ id: string }>(
      `INSERT INTO meta_connections (workspace_id, fb_user_id, fb_user_name, user_token_enc, user_token_expires_at, data_access_expires_at, scopes,
                                     status, connected_by, connected_at, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ok', $8, $9, $9)
       ON CONFLICT (workspace_id, fb_user_id) DO UPDATE
         SET fb_user_name = EXCLUDED.fb_user_name, user_token_enc = EXCLUDED.user_token_enc, user_token_expires_at = EXCLUDED.user_token_expires_at,
             data_access_expires_at = EXCLUDED.data_access_expires_at, scopes = EXCLUDED.scopes, status = 'ok',
             connected_by = EXCLUDED.connected_by, connected_at = EXCLUDED.connected_at, checked_at = EXCLUDED.checked_at
       RETURNING id`,
      [
        ws,
        me.id,
        me.name || null,
        sealUserToken(env.meta, ws, me.id, user.accessToken),
        user.expiresAt ?? info.expiresAt,
        info.dataAccessExpiresAt,
        info.scopes,
        ctx.userId,
        now,
      ],
    );
    const connectionId = conn.rows[0]!.id;
    // Pages keep only their id, name and what this person may do on them; a token only once switched on.
    const rows = new Map<string, { id: string; active: boolean }>();
    for (const p of pages) {
      const r = await tx.query<{ id: string; active: boolean }>(
        `INSERT INTO meta_pages (workspace_id, connection_id, page_id, name, tasks) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workspace_id, page_id) DO UPDATE SET connection_id = EXCLUDED.connection_id, name = EXCLUDED.name, tasks = EXCLUDED.tasks
         RETURNING id, active`,
        [ws, connectionId, p.id, p.name, p.tasks],
      );
      rows.set(p.id, r.rows[0]!);
    }
    // A Page this person had on but didn't tick this time can't be read any more.
    await tx.query(
      `UPDATE meta_pages SET status = 'needs_reconnect', problem = 'Not ticked when Facebook was last connected'
        WHERE workspace_id = $1 AND connection_id = $2 AND active AND NOT (page_id = ANY($3::text[]))`,
      [ws, connectionId, pages.map((p) => p.id)],
    );
    // Pages already on get the fresh token, and leads that waited for it are tried now.
    for (const p of pages) {
      const row = rows.get(p.id)!;
      if (!row.active || !p.accessToken) continue;
      await tx.query(
        `UPDATE meta_pages
            SET page_token_enc = $3,
                status = CASE WHEN status IN ('needs_reconnect', 'permission_missing') THEN 'ok' ELSE status END,
                problem = CASE WHEN status IN ('needs_reconnect', 'permission_missing') THEN NULL ELSE problem END
          WHERE id = $1 AND workspace_id = $2`,
        [row.id, ws, sealPageToken(env.meta, ws, p.id, p.accessToken)],
      );
      await tx.query(`UPDATE incoming_leads SET next_attempt_at = $3 WHERE workspace_id = $1 AND meta_page_id = $2 AND status = 'queued'`, [ws, row.id, now]);
    }
    await logActivity(tx, {
      workspaceId: ws,
      actorUserId: ctx.userId,
      action: "meta.connected",
      entityType: "meta",
      entityId: connectionId,
      meta: { fbUserName: me.name || null, fbUser: fbUserHash(me.id) },
    });
    return { rows };
  });

  // Meta keeps sending leads for Pages already on (never stopped on a reconnect).
  for (const p of pages) {
    if (!saved.rows.get(p.id)?.active || !p.accessToken) continue;
    try {
      await env.graph.subscribePage(p.id, p.accessToken);
    } catch {
      // The daily check and "Check again" ask again.
    }
  }
  deps.worker.nudge();

  // One Page that can be switched on: switched on. Several: the owner picks.
  const activeHere = await deps.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM meta_pages WHERE workspace_id = $1 AND active`, [ws]);
  const elsewhere = await deps.db.query<{ page_id: string }>(
    `SELECT page_id FROM meta_pages WHERE page_id = ANY($1::text[]) AND active AND workspace_id <> $2`,
    [pages.map((p) => p.id), ws],
  );
  const taken = new Set(elsewhere.rows.map((r) => r.page_id));
  const candidates = pages.filter((p: GraphPage) => p.tasks.includes("ADVERTISE") && !taken.has(p.id) && !saved.rows.get(p.id)?.active);
  let anyOn = (activeHere.rows[0]?.n ?? 0) > 0;
  if (!anyOn && candidates.length === 1) {
    try {
      await setPageOn(deps, ctx, saved.rows.get(candidates[0]!.id)!.id, now);
      anyOn = true;
    } catch (err) {
      deps.log.warn({ pageId: candidates[0]!.id, code: (err as AppError).code }, "meta: couldn't switch on the only Page");
    }
  }
  return { added: pages.length, needsChoice: !anyOn && candidates.length > 1 };
}

// ---- Pages on and off --------------------------------------------------------------------

export async function updatePage(deps: MetaDeps, ctx: MemberContext, id: string, input: UpdateMetaPageInput, now = new Date()): Promise<MetaPage> {
  requireOwner(ctx);
  assertId(id, "This Page");
  return input.on ? setPageOn(deps, ctx, id, now, !!input.takeOver) : setPageOff(deps, ctx, id, now);
}

async function connectionOf(db: Queryable, page: PageRow) {
  if (!page.connection_id) return null;
  const { rows } = await db.query<{ id: string; workspace_id: string; fb_user_id: string; user_token_enc: string | null; status: string }>(
    `SELECT id, workspace_id, fb_user_id, user_token_enc, status FROM meta_connections WHERE id = $1 AND workspace_id = $2`,
    [page.connection_id, page.workspace_id],
  );
  return rows[0] ?? null;
}

const reconnectFirst = () => new AppError(409, "META_RECONNECT", "Log in to Facebook again to turn this Page on. Tap Reconnect.");
/** `canManage` says whether this person could move it here (with `takeOver`). */
const inOtherBusiness = (canManage: boolean) =>
  new AppError(
    409,
    "PAGE_IN_OTHER_BUSINESS",
    canManage
      ? "This Page already sends its leads to another business on Wedding Yantra. You have full control of it, so you can move it here."
      : "This Page already sends its leads to another business on Wedding Yantra. Someone with full control of the Page can move it here.",
    { canManage: canManage ? "yes" : "no" },
  );
const noAdvertise = () =>
  new AppError(400, "PAGE_NO_ADVERTISE", "You need access to make ads on this Page to get its leads. Ask whoever has full control of it to give you that, or to connect it.");

/**
 * Leads from this Page start coming here: a fresh Page token (sealed), Meta told to send its
 * leads, its forms saved, and nothing from before now brought in. A Page another business has
 * on is only moved here when asked for (`takeOver`) by someone with full control of it; that
 * business's owners are told.
 */
async function setPageOn(deps: MetaDeps, ctx: MemberContext, id: string, now: Date, takeOver = false): Promise<MetaPage> {
  const env = requireEnv(deps, ctx.workspaceId);
  const ws = ctx.workspaceId;
  const page = await loadPage(deps.db, ws, id, now);
  if (!page) throw notFound("This Page");
  if (page.active) return pageView(deps, ws, id, now);
  if (!page.tasks.includes("ADVERTISE")) throw noAdvertise();
  const conn = await connectionOf(deps.db, page);
  const userToken = conn && conn.status !== "revoked" ? openUserToken(env.meta, conn) : null;
  if (!conn || !userToken) throw reconnectFirst();

  let listed: GraphPage[];
  try {
    listed = await env.graph.listPages(userToken);
  } catch (err) {
    if (isGraphError(err) && err.kind === "token") {
      await deps.db.query(`UPDATE meta_connections SET status = 'needs_reconnect' WHERE id = $1 AND workspace_id = $2`, [conn.id, ws]);
      throw reconnectFirst();
    }
    throw new AppError(503, "META_UNREACHABLE", "Couldn't reach Facebook. Please try again.");
  }
  const fresh = listed.find((p) => p.id === page.page_id);
  if (!fresh?.accessToken) {
    throw new AppError(409, "META_PAGE_NOT_SHARED", "This Page wasn't ticked when you last logged in to Facebook. Tap Reconnect and tick it.");
  }
  if (!fresh.tasks.includes("ADVERTISE")) {
    await deps.db.query(`UPDATE meta_pages SET tasks = $3 WHERE id = $1 AND workspace_id = $2`, [page.id, ws, fresh.tasks]);
    throw noAdvertise();
  }
  const canManage = fresh.tasks.includes("MANAGE");
  const elsewhere = await deps.db.query<{ id: string; workspace_id: string; name: string }>(
    `SELECT id, workspace_id, name FROM meta_pages WHERE page_id = $1 AND active AND workspace_id <> $2`,
    [page.page_id, ws],
  );
  const other = elsewhere.rows[0] ?? null;
  if (other) {
    // What they may do on it now, so the screen offers "Move it here" only to those who can.
    await deps.db.query(`UPDATE meta_pages SET tasks = $3 WHERE id = $1 AND workspace_id = $2`, [page.id, ws, fresh.tasks]);
    // Never moved by a plain "on": the owner is asked first.
    if (!takeOver || !canManage) throw inOtherBusiness(canManage);
  }
  // Leads already waiting for the other business go there first.
  if (other) await deps.worker.drain({ workspaceId: other.workspace_id, pageRowId: other.id, arrivedBefore: now, force: true });

  try {
    await env.graph.subscribePage(page.page_id, fresh.accessToken);
  } catch (err) {
    if (isGraphError(err) && err.kind === "token") throw reconnectFirst();
    throw new AppError(503, "META_UNREACHABLE", "Facebook didn't switch on leads for this Page. Please try again.");
  }
  let forms: Awaited<ReturnType<MetaGraph["listForms"]>> = [];
  try {
    forms = await env.graph.listForms(page.page_id, fresh.accessToken);
  } catch {
    // The catch-up lists them.
  }
  const blocked = await leadAccessBlock(env, page, fresh.accessToken);

  try {
    await withTransaction(deps.db, async (tx) => {
      if (other) {
        const moved = await tx.query(
          `UPDATE meta_pages SET active = false, status = 'off', problem = NULL, page_token_enc = NULL, paused_until = NULL, next_poll_at = NULL
            WHERE id = $1 AND workspace_id = $2 AND active`,
          [other.id, other.workspace_id],
        );
        if (moved.rowCount) await failLeftovers(tx, other.workspace_id, [other.id]);
      }
      await tx.query(
        `UPDATE meta_pages
            SET active = true, page_token_enc = $3, tasks = $4, name = $5, status = $6, problem = $7, paused_until = NULL,
                leads_since = $8, next_poll_at = $9, swept_at = $8, checked_at = $8
          WHERE id = $1 AND workspace_id = $2`,
        [
          page.id,
          ws,
          sealPageToken(env.meta, ws, page.page_id, fresh.accessToken),
          fresh.tasks,
          fresh.name || page.name,
          blocked ? "lead_access" : "ok",
          blocked?.reason ?? null,
          now,
          jitteredPoll(env.meta.pollMinutes, now),
        ],
      );
      // Every form is read from now on: nothing from before (or from while it was off) comes in.
      for (const f of forms) {
        if (!f.id) continue;
        await tx.query(
          `INSERT INTO meta_forms (workspace_id, meta_page_id, form_id, name, status, questions, leads_count, polled_through)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
           ON CONFLICT (meta_page_id, form_id) DO UPDATE
             SET name = EXCLUDED.name, status = EXCLUDED.status, questions = EXCLUDED.questions, leads_count = EXCLUDED.leads_count,
                 polled_through = EXCLUDED.polled_through`,
          [ws, page.id, f.id, f.name, f.status, JSON.stringify(f.questions), f.leadsCount, now],
        );
      }
      await tx.query(`UPDATE meta_forms SET polled_through = $3 WHERE workspace_id = $1 AND meta_page_id = $2`, [ws, page.id, now]);
      await logActivity(tx, { workspaceId: ws, actorUserId: ctx.userId, action: "meta.page_on", entityType: "meta", entityId: page.id, meta: { pageName: page.name } });
      if (other) {
        await logActivity(tx, { workspaceId: ws, actorUserId: ctx.userId, action: "meta.page_taken_over", entityType: "meta", entityId: page.id, meta: { pageName: page.name } });
        await logActivity(tx, {
          workspaceId: other.workspace_id,
          actorUserId: null,
          action: "meta.page_taken_over",
          entityType: "meta",
          entityId: other.id,
          meta: { pageName: other.name },
        });
      }
    });
  } catch (err) {
    // Another business switched the same Page on at the same moment.
    if ((err as { code?: string }).code === "23505") throw inOtherBusiness(canManage);
    throw err;
  }
  if (other) {
    await sourceAlert(deps.db, {
      workspaceId: other.workspace_id,
      facts: { what: "taken_over", pageName: other.name },
      dedupeKey: `meta:${other.workspace_id}:${page.page_id}:taken_over:${now.toISOString()}`,
      entityId: other.id,
    });
  }
  return pageView(deps, ws, id, now);
}

/**
 * Leads from this Page stop: the ones already waiting are brought in first, Meta stops sending
 * them (unless another business has the Page on), and the Page token is wiped.
 */
async function setPageOff(deps: MetaDeps, ctx: MemberContext, id: string, now: Date): Promise<MetaPage> {
  const ws = ctx.workspaceId;
  const page = await loadPage(deps.db, ws, id, now);
  if (!page) throw notFound("This Page");
  if (!page.active) return pageView(deps, ws, id, now);
  await deps.worker.drain({ workspaceId: ws, pageRowId: page.id, arrivedBefore: now, force: true });
  const env = deps.config.meta && deps.graph ? { db: deps.db, config: deps.config, meta: deps.config.meta, graph: deps.graph, log: deps.log } : null;
  if (env) await unsubscribeIfLast(env, page, openPageToken(env.meta, page));
  await withTransaction(deps.db, async (tx) => {
    await tx.query(
      `UPDATE meta_pages SET active = false, status = 'off', problem = NULL, page_token_enc = NULL, paused_until = NULL, next_poll_at = NULL
        WHERE id = $1 AND workspace_id = $2`,
      [page.id, ws],
    );
    await failLeftovers(tx, ws, [page.id]);
    await logActivity(tx, { workspaceId: ws, actorUserId: ctx.userId, action: "meta.page_off", entityType: "meta", entityId: page.id, meta: { pageName: page.name } });
  });
  return pageView(deps, ws, id, now);
}

/** Facebook disconnected: waiting leads brought in, Meta told to stop (per Page, see unsubscribeIfLast), tokens gone. Leads stay. */
export async function disconnect(deps: MetaDeps, ctx: MemberContext, now = new Date()): Promise<{ disconnected: true }> {
  requireOwner(ctx);
  const ws = ctx.workspaceId;
  await deps.worker.drain({ workspaceId: ws, arrivedBefore: now, force: true });
  const env = deps.config.meta && deps.graph ? { db: deps.db, config: deps.config, meta: deps.config.meta, graph: deps.graph, log: deps.log } : null;
  const pages = await deps.db.query<PageRow>(`SELECT ${PAGE_COLUMNS} FROM meta_pages p ${PAGE_JOINS} WHERE p.workspace_id = $2`, [now, ws]);
  if (env) for (const page of pages.rows) await unsubscribeIfLast(env, page, openPageToken(env.meta, page));
  await withTransaction(deps.db, async (tx) => {
    await tx.query(
      `UPDATE meta_pages SET active = false, status = 'off', problem = NULL, page_token_enc = NULL, paused_until = NULL, next_poll_at = NULL
        WHERE workspace_id = $1`,
      [ws],
    );
    await failLeftovers(
      tx,
      ws,
      pages.rows.map((p) => p.id),
    );
    await tx.query(`DELETE FROM meta_connections WHERE workspace_id = $1`, [ws]);
    await tx.query(`DELETE FROM meta_oauth_states WHERE workspace_id = $1`, [ws]);
    await logActivity(tx, { workspaceId: ws, actorUserId: ctx.userId, action: "meta.disconnected", entityType: "meta", entityId: null });
  });
  return { disconnected: true };
}

// ---- Check again, test lead, recent ------------------------------------------------------

/** "Check again" (and "Try again"): the Page's health now, a catch-up read, and its waiting leads tried. Once a minute. */
export async function checkPage(deps: MetaDeps, ctx: MemberContext, id: string, now = new Date()): Promise<MetaCheckResult> {
  requireOwner(ctx);
  assertId(id, "This Page");
  requireEnv(deps, ctx.workspaceId);
  const page = await loadPage(deps.db, ctx.workspaceId, id, now);
  if (!page) throw notFound("This Page");
  if (!page.active) throw new AppError(409, "PAGE_OFF", "Turn this Page on first.");
  const checks = deps.checks ?? new Map<string, number>();
  const last = checks.get(page.id);
  if (last !== undefined && Math.abs(Date.now() - last) < 60_000) {
    throw new AppError(429, "TOO_SOON", "Checked a moment ago. Try again in a minute.");
  }
  checks.set(page.id, Date.now());
  const recovered = await deps.worker.checkPage(page, now);
  return { ...(await pageView(deps, ctx.workspaceId, id, now)), recovered };
}

/** Meta's own test lead for one of the Page's forms, queued here so it comes in even without a webhook. */
export async function sendTestLead(deps: MetaDeps, ctx: MemberContext, id: string, input: MetaTestLeadInput, now = new Date()): Promise<MetaTestLeadResult> {
  requireOwner(ctx);
  assertId(id, "This Page");
  const env = requireEnv(deps, ctx.workspaceId);
  const page = await loadPage(deps.db, ctx.workspaceId, id, now);
  if (!page) throw notFound("This Page");
  if (!page.active) throw new AppError(409, "PAGE_OFF", "Turn this Page on first.");
  const form = await deps.db.query(`SELECT 1 FROM meta_forms WHERE workspace_id = $1 AND meta_page_id = $2 AND form_id = $3`, [ctx.workspaceId, page.id, input.formId]);
  if (!form.rowCount) throw notFound("This form");
  const token = openPageToken(env.meta, page);
  if (!token) throw new AppError(409, "META_RECONNECT", "Log in to Facebook again first. Tap Reconnect.");
  const manual = { manual: true, toolUrl: META_TEST_TOOL_URL };
  let leadId: string | null;
  try {
    leadId = (await env.graph.createTestLead(input.formId, token)).id;
  } catch {
    // Meta refuses a second test lead until the first is deleted, among other things: do it by hand.
    return manual;
  }
  if (!leadId) return manual;
  await deps.db.query(
    `INSERT INTO incoming_leads (workspace_id, channel, external_id, meta_page_id, received_via, form_id, is_test, received_at, next_attempt_at)
     VALUES ($1, 'meta', $2, $3, 'test', $4, true, $5, $5)
     ON CONFLICT (workspace_id, channel, external_id) DO NOTHING`,
    [ctx.workspaceId, leadId, page.id, input.formId, now],
  );
  deps.worker.nudge();
  return { queued: true };
}

/** The last 20 leads that came in from Facebook, newest first. */
export async function recentLeads(deps: MetaDeps, ctx: MemberContext): Promise<IncomingLeadItem[]> {
  requireOwner(ctx);
  const { rows } = await deps.db.query<{
    id: string;
    name: string | null;
    page_row: string | null;
    page_name: string | null;
    form_name: string | null;
    status: IncomingLeadItem["status"];
    error_kind: string | null;
    received_via: IncomingLeadItem["receivedVia"];
    is_test: boolean;
    received_at: Date;
    lead_id: string | null;
  }>(
    `SELECT i.id, i.name, p.id AS page_row, p.name AS page_name, coalesce(nullif(i.form_name, ''), nullif(f.name, '')) AS form_name, i.status, i.error_kind,
            i.received_via, i.is_test, i.received_at, l.id AS lead_id
       FROM incoming_leads i
       LEFT JOIN meta_pages p ON p.id = i.meta_page_id AND p.workspace_id = i.workspace_id
       LEFT JOIN meta_forms f ON f.meta_page_id = i.meta_page_id AND f.form_id = i.form_id AND f.workspace_id = i.workspace_id
       LEFT JOIN leads l ON l.id = i.lead_id AND l.workspace_id = i.workspace_id AND l.deleted_at IS NULL
      WHERE i.workspace_id = $1
      ORDER BY i.received_at DESC, i.id DESC
      LIMIT 20`,
    [ctx.workspaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    pageId: r.page_row,
    pageName: r.page_name,
    formName: r.form_name,
    status: r.status,
    errorKind: r.error_kind,
    receivedVia: r.received_via,
    isTest: r.is_test,
    receivedAt: r.received_at.toISOString(),
    leadId: r.lead_id,
  }));
}

