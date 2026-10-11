import { leadSourceAlertText, type LeadSourceAlertFacts } from "@wedding-yantra/core";
import type { MetaPageStatus } from "@wedding-yantra/types";
import type { FastifyBaseLogger } from "fastify";
import type { Config, MetaConfig } from "../../config.js";
import type { Db, Queryable } from "../../db.js";
import { seal, unseal } from "../../lib/crypto.js";
import { notify } from "../notifications/service.js";
import type { GraphErrorKind, MetaGraph } from "./graph.js";

/** What the Meta modules work with once Meta is set up on the server. */
export interface MetaEnv {
  db: Db;
  config: Config;
  meta: MetaConfig;
  graph: MetaGraph;
  log: Pick<FastifyBaseLogger, "info" | "warn" | "error">;
}

/** Tokens are sealed to where they belong, so a value copied to another row won't open. */
export const userTokenAad = (workspaceId: string, fbUserId: string) => `meta_conn:${workspaceId}:${fbUserId}`;
export const pageTokenAad = (workspaceId: string, pageId: string) => `meta_page:${workspaceId}:${pageId}`;

export const sealPageToken = (meta: MetaConfig, workspaceId: string, pageId: string, token: string) =>
  seal(token, meta.tokenKey, pageTokenAad(workspaceId, pageId));
export const sealUserToken = (meta: MetaConfig, workspaceId: string, fbUserId: string, token: string) =>
  seal(token, meta.tokenKey, userTokenAad(workspaceId, fbUserId));

/** The Page token, or null when there is none or it won't open (another key, a copied value). */
export function openPageToken(meta: MetaConfig, page: { workspace_id: string; page_id: string; page_token_enc: string | null }): string | null {
  if (!page.page_token_enc) return null;
  try {
    return unseal(page.page_token_enc, meta.tokenKey, pageTokenAad(page.workspace_id, page.page_id));
  } catch {
    return null;
  }
}

export function openUserToken(meta: MetaConfig, c: { workspace_id: string; fb_user_id: string; user_token_enc: string | null }): string | null {
  if (!c.user_token_enc) return null;
  try {
    return unseal(c.user_token_enc, meta.tokenKey, userTokenAad(c.workspace_id, c.fb_user_id));
  } catch {
    return null;
  }
}

/** Problems that stop a Page's leads from being read: its waiting leads are parked and tried hourly. */
export const READ_PROBLEMS: readonly MetaPageStatus[] = ["needs_reconnect", "lead_access", "permission_missing"];
export type PageProblem = "needs_reconnect" | "lead_access" | "permission_missing" | "not_subscribed";

/** A Page row with what the worker needs to read its leads. */
export interface PageRow {
  id: string;
  workspace_id: string;
  connection_id: string | null;
  page_id: string;
  name: string;
  tasks: string[];
  page_token_enc: string | null;
  active: boolean;
  status: MetaPageStatus;
  problem: string | null;
  paused_until: Date | null;
  leads_since: Date | null;
  next_poll_at: Date | null;
  swept_at: Date | null;
  last_webhook_at: Date | null;
  last_lead_at: Date | null;
  checked_at: Date | null;
  /** The Facebook person who connected it */
  fb_user_id: string | null;
  fb_user_name: string | null;
  /** The business's local date at the time asked for, YYYY-MM-DD */
  today: string;
}

/** Select list for a PageRow: `meta_pages p`, `meta_connections c` (left join), `workspaces w`; $1 is now. */
export const PAGE_COLUMNS = `p.id, p.workspace_id, p.connection_id, p.page_id, p.name, p.tasks, p.page_token_enc, p.active, p.status, p.problem,
  p.paused_until, p.leads_since, p.next_poll_at, p.swept_at, p.last_webhook_at, p.last_lead_at, p.checked_at,
  c.fb_user_id, c.fb_user_name, (($1::timestamptz AT TIME ZONE w.timezone)::date)::text AS today`;
export const PAGE_JOINS = `JOIN workspaces w ON w.id = p.workspace_id AND w.deleted_at IS NULL
  LEFT JOIN meta_connections c ON c.id = p.connection_id AND c.workspace_id = p.workspace_id`;

export async function loadPage(db: Queryable, workspaceId: string, id: string, now = new Date()): Promise<PageRow | null> {
  const { rows } = await db.query<PageRow>(`SELECT ${PAGE_COLUMNS} FROM meta_pages p ${PAGE_JOINS} WHERE p.id = $2 AND p.workspace_id = $3`, [
    now,
    id,
    workspaceId,
  ]);
  return rows[0] ?? null;
}

/** The business's owners, oldest first: they hear about Facebook problems and get test leads. */
export async function ownerIds(db: Queryable, workspaceId: string): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'owner' AND removed_at IS NULL ORDER BY created_at`,
    [workspaceId],
  );
  return rows.map((r) => r.user_id);
}

/**
 * An alert about Facebook leads (`lead.source_problem`) to the owners, and anyone else named.
 * It can't be switched off. The key makes it once per problem per day (or per expiry date).
 */
export async function sourceAlert(
  db: Queryable,
  a: { workspaceId: string; facts: LeadSourceAlertFacts; dedupeKey: string; entityId?: string | null; also?: (string | null)[]; actorId?: string | null },
): Promise<number> {
  const people = new Set([...(await ownerIds(db, a.workspaceId)), ...(a.also ?? []).filter((id): id is string => !!id)]);
  const text = leadSourceAlertText(a.facts);
  return notify(
    db,
    [...people].map((userId) => ({
      workspaceId: a.workspaceId,
      userId,
      kind: "lead.source_problem" as const,
      ...text,
      link: "/app/settings/facebook-leads",
      entityType: "meta_page",
      entityId: a.entityId ?? null,
      actorId: a.actorId ?? null,
      dedupeKey: a.dedupeKey,
    })),
  );
}

/** "meta:<business>:<page>:<what>:<date>": one alert per problem per Page per day. */
export const alertKey = (workspaceId: string, pageId: string, what: string, date: string) => `meta:${workspaceId}:${pageId}:${what}:${date}`;

/**
 * Meta's subscription is per app and Page, shared by every business on Wedding Yantra: stop it
 * only when this business's row is the active one and no other business has the Page on.
 * Never called on deauthorize, data deletion or reconnect. A failure is logged and ignored.
 */
export async function unsubscribeIfLast(env: MetaEnv, page: { id: string; page_id: string; active: boolean }, token: string | null): Promise<boolean> {
  if (!page.active || !token) return false;
  const others = await env.db.query(`SELECT 1 FROM meta_pages WHERE page_id = $1 AND active AND id <> $2 LIMIT 1`, [page.page_id, page.id]);
  if (others.rowCount) return false;
  try {
    await env.graph.unsubscribePage(page.page_id, token);
    return true;
  } catch (err) {
    env.log.warn({ pageId: page.page_id, kind: (err as { kind?: string }).kind }, "meta: couldn't stop the Page's lead events");
    return false;
  }
}

/**
 * Leads still waiting for a Page whose leads are being turned off: they can't be read any more,
 * so they show as not brought in (never silently dropped).
 */
export async function failLeftovers(db: Queryable, workspaceId: string, pageRowIds: string[]): Promise<void> {
  if (!pageRowIds.length) return;
  await db.query(
    `UPDATE incoming_leads
        SET status = 'failed', error_kind = 'page_off', last_error = 'Leads from this Page were turned off before it came in',
            locked_until = NULL, claim_token = NULL, processed_at = now()
      WHERE workspace_id = $1 AND meta_page_id = ANY($2::uuid[]) AND status = 'queued'`,
    [workspaceId, pageRowIds],
  );
}

/** Kinds of failure the global breaker watches. */
export type OutageKind = GraphErrorKind | PageProblem;

/**
 * When many Pages fail the same way within an hour, the problem is Meta's (or ours), not each
 * business's: owners aren't alerted about it, the screen says we're fixing it, and the operator
 * sees an error in the log. Kept in memory: the API runs as one process.
 */
export class OutageBreaker {
  private readonly seen = new Map<string, Map<string, number>>();
  private activePages = 0;
  private countedAt = 0;
  private loggedAt = 0;

  constructor(
    private readonly db: Queryable,
    private readonly log: MetaEnv["log"],
    /** Share of active Pages failing the same way that counts as an outage */
    private readonly share = 0.3,
    /** Fewest Pages that can make an outage, so one business alone never silences its own alerts */
    private readonly fewest = 3,
  ) {}

  private prune(now: number): void {
    for (const [kind, pages] of this.seen) {
      for (const [page, at] of pages) if (now - at > 3_600_000) pages.delete(page);
      if (!pages.size) this.seen.delete(kind);
    }
  }

  /** One Page failing with this kind of problem. */
  async record(kind: OutageKind, pageRowId: string, now: Date): Promise<void> {
    const t = now.getTime();
    const pages = this.seen.get(kind) ?? new Map<string, number>();
    pages.set(pageRowId, t);
    this.seen.set(kind, pages);
    if (Math.abs(t - this.countedAt) > 300_000) {
      const { rows } = await this.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM meta_pages p JOIN workspaces w ON w.id = p.workspace_id AND w.deleted_at IS NULL WHERE p.active`,
      );
      this.activePages = rows[0]?.n ?? 0;
      this.countedAt = t;
    }
    if (this.tripped(now) && Math.abs(t - this.loggedAt) > 3_600_000) {
      this.loggedAt = t;
      const kinds = [...this.seen].map(([k, p]) => `${k}: ${p.size}`).join(", ");
      this.log.error({ kinds, activePages: this.activePages }, "meta: many Pages failing at once; owner alerts are held");
    }
  }

  tripped(now: Date = new Date()): boolean {
    this.prune(now.getTime());
    const limit = Math.max(this.fewest, Math.floor(this.activePages * this.share) + 1);
    for (const pages of this.seen.values()) if (pages.size >= limit) return true;
    return false;
  }
}

/** The worker's view: Meta plus the global breaker. */
export interface WorkerEnv extends MetaEnv {
  breaker: OutageBreaker;
}

/** An owner alert from the worker, held back while many Pages fail the same way at once. */
export async function heldAlert(env: WorkerEnv, a: Parameters<typeof sourceAlert>[1], now: Date): Promise<number> {
  if (env.breaker.tripped(now)) return 0;
  return sourceAlert(env.db, a);
}

/** Waiting leads of a Page whose reads are blocked are tried again in an hour, not every few seconds. */
export async function parkRows(db: Queryable, page: { id: string; workspace_id: string }, now: Date): Promise<void> {
  await db.query(
    `UPDATE incoming_leads SET next_attempt_at = $3::timestamptz + interval '1 hour'
      WHERE workspace_id = $1 AND meta_page_id = $2 AND status = 'queued' AND next_attempt_at < $3::timestamptz + interval '1 hour'`,
    [page.workspace_id, page.id, now],
  );
}

/**
 * A Page has a problem: its status says which (with Meta's words), its waiting leads are parked
 * when they can't be read, and the owners hear about it once a day.
 */
export async function setPageProblem(
  env: WorkerEnv,
  page: PageRow,
  kind: PageProblem,
  message: string | null,
  now: Date,
  opts: { alert?: boolean } = {},
): Promise<void> {
  await env.breaker.record(kind, page.id, now);
  await env.db.query(`UPDATE meta_pages SET status = $3, problem = $4 WHERE id = $1 AND workspace_id = $2 AND active`, [
    page.id,
    page.workspace_id,
    kind,
    message ? message.slice(0, 500) : null,
  ]);
  page.status = kind;
  page.problem = message;
  if (READ_PROBLEMS.includes(kind)) await parkRows(env.db, page, now);
  if (opts.alert === false) return;
  await heldAlert(
    env,
    {
      workspaceId: page.workspace_id,
      facts: { what: kind, pageName: page.name, who: page.fb_user_name },
      dedupeKey: alertKey(page.workspace_id, page.page_id, kind, page.today),
      entityId: page.id,
    },
    now,
  );
}

/**
 * The Page works again (a lead was read, or every check passed): back to ok, and its parked
 * leads are tried now. `kinds` limits which problems this clears.
 */
export async function clearPageProblem(env: MetaEnv, page: PageRow, now: Date, kinds: readonly MetaPageStatus[] = READ_PROBLEMS): Promise<boolean> {
  if (!kinds.includes(page.status)) return false;
  const { rowCount } = await env.db.query(
    `UPDATE meta_pages SET status = 'ok', problem = NULL WHERE id = $1 AND workspace_id = $2 AND active AND status = ANY($3::text[])`,
    [page.id, page.workspace_id, [...kinds]],
  );
  if (!rowCount) return false;
  page.status = "ok";
  page.problem = null;
  await env.db.query(
    `UPDATE incoming_leads SET next_attempt_at = $3 WHERE workspace_id = $1 AND meta_page_id = $2 AND status = 'queued' AND next_attempt_at > $3`,
    [page.workspace_id, page.id, now],
  );
  return true;
}

/** Meta asked us to slow down: leave the Page alone until then. */
export async function pausePage(env: WorkerEnv, page: PageRow, until: Date): Promise<void> {
  await env.db.query(`UPDATE meta_pages SET paused_until = greatest(coalesce(paused_until, $3), $3) WHERE id = $1 AND workspace_id = $2`, [
    page.id,
    page.workspace_id,
    until,
  ]);
  page.paused_until = until;
}

/** Whether Leads Access stops this app reading the Page's leads; null when it couldn't be checked. */
export async function leadAccessBlock(env: MetaEnv, page: PageRow, token: string): Promise<{ reason: string | null } | null> {
  if (!page.fb_user_id) return null;
  try {
    const access = await env.graph.leadAccess(page.page_id, page.fb_user_id, token);
    return access.canAccess ? null : { reason: access.failureReason ?? access.failureResolution };
  } catch {
    return null;
  }
}

/**
 * A Graph call about a whole Page failed (its forms, the catch-up, the health check): what it
 * means for the Page. Transient trouble only counts towards the global breaker.
 */
export async function pageGraphError(env: WorkerEnv, page: PageRow, token: string, err: unknown, now: Date, opts: { alert?: boolean } = {}): Promise<void> {
  const kind = (err as { kind?: GraphErrorKind }).kind;
  const message = err instanceof Error ? err.message : null;
  if (kind === "token") return setPageProblem(env, page, "needs_reconnect", message, now, opts);
  if (kind === "rate_limit") {
    const wait = (err as { retryAfterMs?: number }).retryAfterMs ?? 15 * 60_000;
    return pausePage(env, page, new Date(now.getTime() + wait));
  }
  if (kind === "permission" || kind === "not_found") {
    // A Leads Access block looks like either of these.
    const blocked = await leadAccessBlock(env, page, token);
    if (blocked) return setPageProblem(env, page, "lead_access", blocked.reason ?? message, now, opts);
    if (kind === "permission") return setPageProblem(env, page, "permission_missing", message, now, opts);
    return;
  }
  if (kind) {
    await env.breaker.record(kind, page.id, now);
    return;
  }
  throw err;
}
