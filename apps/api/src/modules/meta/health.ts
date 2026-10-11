import type { Queryable } from "../../db.js";
import { standing } from "../billing/service.js";
import {
  alertKey,
  clearPageProblem,
  failLeftovers,
  heldAlert,
  leadAccessBlock,
  openPageToken,
  openUserToken,
  PAGE_COLUMNS,
  PAGE_JOINS,
  pageGraphError,
  setPageProblem,
  unsubscribeIfLast,
  type PageRow,
  type WorkerEnv,
} from "./common.js";
import { isGraphError } from "./graph.js";

/**
 * The daily check of each business's Facebook connection, at 10:00 its time (once a day, through
 * `job_runs` like the other scheduled jobs). For every active Page: is its token still good, is
 * Meta still sending its leads (asked again if not), does Leads Access let us read them. Then
 * the notices: log in to Facebook again soon, whoever connected has left, a busy Page gone quiet.
 */

const JOB = "meta_health";
/** Local times the check runs in, and the latest it may still run after a restart. */
export const HEALTH_WINDOW = { from: "10:00", until: "13:00" } as const;
/** "Log in to Facebook again" this many days before Meta stops sharing data. */
const WARN_DAYS = 14;
/** A Page with this many leads in the two weeks before its last one is busy… */
export const BUSY_LEADS = 5;
/** …and quiet after this long without one. */
export const QUIET_HOURS = 72;
/** Leads stop this many days after a plan runs out unpaid. */
const PAUSE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

/** Every business due its check now: claims today's run for each and checks it. Returns how many. */
export async function runHealth(env: WorkerEnv, now: Date): Promise<number> {
  const { rows } = await env.db.query<{ id: string; clock: string; today: string }>(
    `SELECT w.id, to_char($1::timestamptz AT TIME ZONE w.timezone, 'HH24:MI') AS clock, (($1::timestamptz AT TIME ZONE w.timezone)::date)::text AS today
       FROM workspaces w
      WHERE w.deleted_at IS NULL AND EXISTS (SELECT 1 FROM meta_connections c WHERE c.workspace_id = w.id)`,
    [now],
  );
  let checked = 0;
  for (const ws of rows) {
    if (ws.clock < HEALTH_WINDOW.from || ws.clock >= HEALTH_WINDOW.until) continue;
    const { rowCount } = await env.db.query(`INSERT INTO job_runs (job, workspace_id, run_date) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
      JOB,
      ws.id,
      ws.today,
    ]);
    if (!rowCount) continue;
    try {
      await workspaceHealth(env, ws.id, now);
      checked += 1;
    } catch (err) {
      env.log.warn({ workspaceId: ws.id, message: (err as Error)?.message }, "meta: daily check failed");
    }
  }
  return checked;
}

/**
 * One Page: its token, Meta's lead events and Leads Access. Sets its status (with an alert
 * unless `alert` is false) and returns when Meta stops sharing data for its token.
 */
export async function pageHealth(env: WorkerEnv, page: PageRow, now: Date, opts: { alert?: boolean } = {}): Promise<Date | null> {
  const token = openPageToken(env.meta, page);
  if (!token) {
    await setPageProblem(env, page, "needs_reconnect", "The Page's Facebook login has gone", now, opts);
    return null;
  }
  await env.db.query(`UPDATE meta_pages SET checked_at = $3 WHERE id = $1 AND workspace_id = $2`, [page.id, page.workspace_id, now]);
  let dataAccessExpiresAt: Date | null = null;
  try {
    const info = await env.graph.debugToken(token);
    if (!info.isValid) {
      await setPageProblem(env, page, "needs_reconnect", info.error?.message || "Facebook says this Page's login is no longer valid", now, opts);
      return null;
    }
    if (info.scopes.length && !info.scopes.includes("leads_retrieval")) {
      await setPageProblem(env, page, "permission_missing", "The leads permission wasn't given", now, opts);
      return info.dataAccessExpiresAt;
    }
    dataAccessExpiresAt = info.dataAccessExpiresAt;

    if (!(await env.graph.pageSubscribed(page.page_id, token))) {
      try {
        await env.graph.subscribePage(page.page_id, token);
      } catch (err) {
        if (isGraphError(err) && err.kind === "token") throw err;
        await setPageProblem(env, page, "not_subscribed", err instanceof Error ? err.message : null, now, opts);
        return dataAccessExpiresAt;
      }
    }

    const blocked = await leadAccessBlock(env, page, token);
    if (blocked) {
      await setPageProblem(env, page, "lead_access", blocked.reason, now, opts);
      return dataAccessExpiresAt;
    }
  } catch (err) {
    await pageGraphError(env, page, token, err, now, opts);
    return dataAccessExpiresAt;
  }
  // Everything checks out.
  await clearPageProblem(env, page, now, ["needs_reconnect", "lead_access", "permission_missing", "not_subscribed"]);
  return dataAccessExpiresAt;
}

/** The business's local date of a moment, YYYY-MM-DD. */
async function localDate(db: Queryable, workspaceId: string, at: Date): Promise<string> {
  const { rows } = await db.query<{ d: string }>(`SELECT (($2::timestamptz AT TIME ZONE timezone)::date)::text AS d FROM workspaces WHERE id = $1`, [workspaceId, at]);
  return rows[0]?.d ?? at.toISOString().slice(0, 10);
}

/** The whole daily check for one business. */
export async function workspaceHealth(env: WorkerEnv, workspaceId: string, now: Date): Promise<void> {
  if (await pauseIfLapsed(env, workspaceId, now)) return;

  const pages = await env.db.query<PageRow & { busy: number }>(
    `SELECT ${PAGE_COLUMNS},
            (SELECT count(*) FROM incoming_leads i
              WHERE i.workspace_id = p.workspace_id AND i.meta_page_id = p.id AND i.status IN ('added', 'merged') AND NOT i.is_test
                AND i.processed_at BETWEEN p.last_lead_at - interval '14 days' AND p.last_lead_at)::int AS busy
       FROM meta_pages p ${PAGE_JOINS}
      WHERE p.workspace_id = $2 AND p.active`,
    [now, workspaceId],
  );
  const pageExpiry = new Map<string, Date>();
  for (const page of pages.rows) {
    const at = await pageHealth(env, page, now);
    if (at && page.connection_id) {
      const known = pageExpiry.get(page.connection_id);
      if (!known || at < known) pageExpiry.set(page.connection_id, at);
    }
    // A busy Page that has gone quiet: are the ads still running?
    if (page.status === "ok" && page.last_lead_at && page.busy >= BUSY_LEADS && now.getTime() - page.last_lead_at.getTime() >= QUIET_HOURS * 3_600_000) {
      const days = Math.floor((now.getTime() - page.last_lead_at.getTime()) / DAY_MS);
      await heldAlert(
        env,
        {
          workspaceId,
          facts: { what: "quiet", pageName: page.name, days },
          dedupeKey: alertKey(workspaceId, page.page_id, "quiet", page.last_lead_at.toISOString().slice(0, 10)),
          entityId: page.id,
        },
        now,
      );
    }
  }

  const conns = await env.db.query<{
    id: string;
    workspace_id: string;
    fb_user_id: string;
    user_token_enc: string | null;
    data_access_expires_at: Date | null;
    status: string;
    connected_by: string | null;
    connector_name: string | null;
    still_here: boolean;
  }>(
    `SELECT c.id, c.workspace_id, c.fb_user_id, c.user_token_enc, c.data_access_expires_at, c.status, c.connected_by, u.name AS connector_name,
            EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = c.workspace_id AND m.user_id = c.connected_by AND m.removed_at IS NULL) AS still_here
       FROM meta_connections c LEFT JOIN users u ON u.id = c.connected_by
      WHERE c.workspace_id = $1 AND c.status <> 'revoked'`,
    [workspaceId],
  );
  for (const c of conns.rows) {
    // The user token: when it expires is only for information (Page tokens keep working).
    let expiry = pageExpiry.get(c.id) ?? null;
    let userExpiresAt: Date | null | undefined;
    const userToken = openUserToken(env.meta, c);
    if (userToken) {
      try {
        const info = await env.graph.debugToken(userToken);
        if (info.isValid) {
          userExpiresAt = info.expiresAt;
          if (info.dataAccessExpiresAt && (!expiry || info.dataAccessExpiresAt < expiry)) expiry = info.dataAccessExpiresAt;
        }
      } catch {
        // Information only.
      }
    }
    expiry ??= c.data_access_expires_at;
    const soon = !!expiry && expiry.getTime() - now.getTime() <= WARN_DAYS * DAY_MS;
    const status = c.status === "needs_reconnect" ? c.status : soon ? "reconnect_soon" : "ok";
    await env.db.query(
      `UPDATE meta_connections
          SET data_access_expires_at = $3, status = $4, checked_at = $5,
              user_token_expires_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE user_token_expires_at END
        WHERE id = $1 AND workspace_id = $2`,
      [c.id, workspaceId, expiry, status, now, userExpiresAt !== undefined, userExpiresAt ?? null],
    );
    if (soon && expiry) {
      const by = await localDate(env.db, workspaceId, expiry);
      await heldAlert(env, { workspaceId, facts: { what: "reconnect_soon", by }, dedupeKey: `meta:${workspaceId}:conn:${c.id}:reconnect_soon:${by}` }, now);
    }
    if (!c.still_here) {
      await heldAlert(
        env,
        { workspaceId, facts: { what: "connector_left", who: c.connector_name }, dedupeKey: `meta:${workspaceId}:conn:${c.id}:connector_left` },
        now,
      );
    }
  }
}

/**
 * A plan that ran out unpaid more than 30 days ago: leads stop (every Page is turned off) and
 * the owners are told. Only while billing is enforced. Returns whether it paused.
 */
async function pauseIfLapsed(env: WorkerEnv, workspaceId: string, now: Date): Promise<boolean> {
  if (!env.config.billing.enforced) return false;
  if ((await standing(env.db, workspaceId)).status !== "expired") return false;
  const { rows } = await env.db.query<{ ended: Date }>(
    `SELECT greatest(w.trial_ends_at, (SELECT max(s.current_period_end) FROM subscriptions s WHERE s.workspace_id = w.id)) AS ended
       FROM workspaces w WHERE w.id = $1`,
    [workspaceId],
  );
  const ended = rows[0]?.ended;
  if (!ended || now.getTime() - ended.getTime() < PAUSE_AFTER_DAYS * DAY_MS) return false;
  const pages = await env.db.query<PageRow>(`SELECT ${PAGE_COLUMNS} FROM meta_pages p ${PAGE_JOINS} WHERE p.workspace_id = $2 AND p.active`, [now, workspaceId]);
  if (!pages.rowCount) return true;
  for (const page of pages.rows) await unsubscribeIfLast(env, page, openPageToken(env.meta, page));
  await env.db.query(
    `UPDATE meta_pages SET active = false, status = 'off', problem = NULL, page_token_enc = NULL, paused_until = NULL, next_poll_at = NULL
      WHERE workspace_id = $1 AND active`,
    [workspaceId],
  );
  await failLeftovers(
    env.db,
    workspaceId,
    pages.rows.map((p) => p.id),
  );
  await heldAlert(env, { workspaceId, facts: { what: "paused" }, dedupeKey: `meta:${workspaceId}:all:paused:${pages.rows[0]!.today}` }, now);
  return true;
}
