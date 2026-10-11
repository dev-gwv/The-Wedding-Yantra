import { createHash, timingSafeEqual } from "node:crypto";
import type { MetaDeletionStatus } from "@wedding-yantra/types";
import type { FastifyBaseLogger } from "fastify";
import type { MetaConfig } from "../../config.js";
import { withTransaction, type Db } from "../../db.js";
import { parseSignedRequest, randomToken, sha256, validMetaSignature } from "../../lib/crypto.js";
import { AppError, notFound } from "../../lib/http.js";
import { failLeftovers, sourceAlert, type MetaEnv } from "./common.js";

/**
 * What Meta sends us, unasked and unsigned-in: the webhook (a lead was filled), and the two
 * calls when someone removes Wedding Yantra on Facebook (deauthorize) or asks for their data to
 * be deleted. Each is checked against the app secret before anything is read.
 */

/** Takes Meta's verify token out of a URL before it's logged. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]hub(?:\.|%2E)verify_token=)[^&#]*/gi, "$1[redacted]");
}

/** Compares in constant time, whatever the lengths. */
function sameText(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** Meta checking the webhook address: echo the challenge when the verify token is ours. */
export function handshake(meta: MetaConfig, query: Record<string, unknown>): string | null {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode !== "subscribe" || typeof token !== "string" || typeof challenge !== "string") return null;
  return sameText(token, meta.verifyToken) ? challenge : null;
}

interface LeadEvent {
  leadgenId: string;
  pageId: string;
  formId: string | null;
  adId: string | null;
  createdTime: Date | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Every `leadgen` change in a webhook post. */
function leadEvents(body: unknown): LeadEvent[] {
  if (!isRecord(body) || !Array.isArray(body.entry)) return [];
  const out = new Map<string, LeadEvent>();
  for (const entry of body.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "leadgen" || !isRecord(change.value)) continue;
      const v = change.value;
      const leadgenId = text(v.leadgen_id);
      const pageId = text(v.page_id) ?? text(entry.id);
      if (!leadgenId || !pageId || leadgenId.length > 64 || pageId.length > 64) continue;
      const seconds = typeof v.created_time === "number" ? v.created_time : Number(text(v.created_time));
      out.set(leadgenId, {
        leadgenId,
        pageId,
        formId: text(v.form_id)?.slice(0, 64) ?? null,
        adId: text(v.ad_id)?.slice(0, 64) ?? null,
        createdTime: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null,
      });
    }
  }
  return [...out.values()];
}

/**
 * A signed webhook post: each lead is queued for the business that has its Page on (once, however
 * often Meta sends it), and the worker picks it up straight after. Unknown Pages are noted by id only.
 */
export async function receiveWebhook(
  env: MetaEnv,
  raw: Buffer,
  signature: string | undefined,
  log: Pick<FastifyBaseLogger, "warn">,
): Promise<{ status: 200; received: number } | { status: 400 | 403; code: string; message: string }> {
  if (!validMetaSignature(raw, signature, env.meta.appSecret)) return { status: 403, code: "BAD_SIGNATURE", message: "This message isn't from Meta" };
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return { status: 400, code: "BAD_REQUEST", message: "That wasn't valid JSON" };
  }
  const events = leadEvents(body);
  if (!events.length) return { status: 200, received: 0 };
  const pageIds = [...new Set(events.map((e) => e.pageId))];
  const { rows } = await env.db.query<{ meta_page_id: string }>(
    `INSERT INTO incoming_leads (workspace_id, channel, external_id, meta_page_id, received_via, form_id, ad_id, submitted_at)
     SELECT p.workspace_id, 'meta', x.leadgen_id, p.id, 'webhook', x.form_id, x.ad_id, x.created
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[]) AS x(leadgen_id, page_id, form_id, ad_id, created)
       JOIN meta_pages p ON p.page_id = x.page_id AND p.active
       JOIN workspaces w ON w.id = p.workspace_id AND w.deleted_at IS NULL
     ON CONFLICT (workspace_id, channel, external_id) DO NOTHING
     RETURNING meta_page_id`,
    [events.map((e) => e.leadgenId), events.map((e) => e.pageId), events.map((e) => e.formId), events.map((e) => e.adId), events.map((e) => e.createdTime)],
  );
  const known = await env.db.query<{ page_id: string }>(
    `UPDATE meta_pages p SET last_webhook_at = now()
       FROM workspaces w
      WHERE w.id = p.workspace_id AND w.deleted_at IS NULL AND p.page_id = ANY($1::text[]) AND p.active
      RETURNING p.page_id`,
    [pageIds],
  );
  const knownIds = new Set(known.rows.map((r) => r.page_id));
  const unknown = pageIds.filter((id) => !knownIds.has(id));
  if (unknown.length) log.warn({ pageIds: unknown }, "meta: leads for Pages no business has on");
  return { status: 200, received: rows.length };
}

/** The `signed_request` Meta posts, as a form field (or JSON). */
function signedRequestOf(raw: Buffer, contentType: string | undefined): string {
  const body = raw.toString("utf8");
  if ((contentType ?? "").includes("json")) {
    try {
      const parsed = JSON.parse(body) as unknown;
      return isRecord(parsed) && typeof parsed.signed_request === "string" ? parsed.signed_request : "";
    } catch {
      return "";
    }
  }
  return new URLSearchParams(body).get("signed_request") ?? "";
}

function facebookUserOf(env: MetaEnv, raw: Buffer, contentType: string | undefined): string {
  const data = parseSignedRequest(signedRequestOf(raw, contentType), env.meta.appSecret);
  const userId = data ? text(data.user_id) : null;
  if (!userId || userId.length > 64) throw new AppError(400, "BAD_SIGNED_REQUEST", "This request isn't signed by Meta");
  return userId;
}

/**
 * Someone removed Wedding Yantra on Facebook: their connections are revoked and their Pages
 * wait for a reconnect (leads keep queuing meanwhile). Meta's subscription is left alone: it's
 * shared by every business with the Page.
 */
export async function deauthorize(env: MetaEnv, raw: Buffer, contentType: string | undefined, now = new Date()): Promise<void> {
  const fbUserId = facebookUserOf(env, raw, contentType);
  const conns = await env.db.query<{ id: string; workspace_id: string }>(`SELECT id, workspace_id FROM meta_connections WHERE fb_user_id = $1`, [fbUserId]);
  for (const c of conns.rows) {
    await withTransaction(env.db, async (tx) => {
      await tx.query(`UPDATE meta_connections SET status = 'revoked', user_token_enc = NULL WHERE id = $1 AND workspace_id = $2`, [c.id, c.workspace_id]);
      await tx.query(
        `UPDATE meta_pages
            SET page_token_enc = NULL,
                status = CASE WHEN active THEN 'needs_reconnect' ELSE status END,
                problem = CASE WHEN active THEN 'Wedding Yantra was removed on Facebook' ELSE problem END
          WHERE connection_id = $1 AND workspace_id = $2`,
        [c.id, c.workspace_id],
      );
      await sourceAlert(tx, {
        workspaceId: c.workspace_id,
        facts: { what: "removed" },
        dedupeKey: `meta:${c.workspace_id}:conn:${c.id}:removed:${now.toISOString().slice(0, 10)}`,
      });
    });
  }
}

/**
 * Someone asked Facebook to delete their data: their connections and tokens go, their Pages stop
 * sending leads here, and their name leaves the activity log. Only a hash of their Facebook id is
 * kept, with a code for the public status page.
 */
export async function dataDeletion(env: MetaEnv, raw: Buffer, contentType: string | undefined): Promise<{ url: string; confirmation_code: string }> {
  const fbUserId = facebookUserOf(env, raw, contentType);
  const code = randomToken();
  const hash = sha256(fbUserId);
  await env.db.query(`INSERT INTO meta_deletion_requests (code, fb_user_hash) VALUES ($1, $2)`, [code, hash]);
  const conns = await env.db.query<{ id: string; workspace_id: string }>(`SELECT id, workspace_id FROM meta_connections WHERE fb_user_id = $1`, [fbUserId]);
  for (const c of conns.rows) {
    await withTransaction(env.db, async (tx) => {
      const pages = await tx.query<{ id: string }>(
        `UPDATE meta_pages SET active = false, status = 'off', problem = NULL, page_token_enc = NULL, paused_until = NULL, next_poll_at = NULL
          WHERE connection_id = $1 AND workspace_id = $2
          RETURNING id`,
        [c.id, c.workspace_id],
      );
      await failLeftovers(
        tx,
        c.workspace_id,
        pages.rows.map((p) => p.id),
      );
      await tx.query(`DELETE FROM meta_connections WHERE id = $1 AND workspace_id = $2`, [c.id, c.workspace_id]);
      await sourceAlert(tx, {
        workspaceId: c.workspace_id,
        facts: { what: "removed" },
        dedupeKey: `meta:${c.workspace_id}:conn:${c.id}:removed:${code}`,
      });
    });
  }
  // Their Facebook name, wherever "connected Facebook as …" was logged (in any business).
  await env.db.query(`UPDATE activity_log SET meta = meta - 'fbUserName' WHERE action = 'meta.connected' AND meta->>'fbUser' = $1`, [hash]);
  await env.db.query(`UPDATE meta_deletion_requests SET completed_at = now() WHERE code = $1`, [code]);
  return { url: `${env.config.webAppUrl ?? ""}/meta-deletion?code=${encodeURIComponent(code)}`, confirmation_code: code };
}

/** The public page for a deletion request. */
export async function deletionStatus(db: Db, code: string): Promise<MetaDeletionStatus> {
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(code)) throw notFound("This request");
  const { rows } = await db.query<{ requested_at: Date; completed_at: Date | null }>(
    `SELECT requested_at, completed_at FROM meta_deletion_requests WHERE code = $1`,
    [code],
  );
  const r = rows[0];
  if (!r) throw notFound("This request");
  return { status: r.completed_at ? "done" : "pending", requestedAt: r.requested_at.toISOString(), completedAt: r.completed_at?.toISOString() ?? null };
}
