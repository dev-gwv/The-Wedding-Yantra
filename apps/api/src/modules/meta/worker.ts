import { randomUUID } from "node:crypto";
import { adPlatform, readLeadAnswers, sourceForPlatform } from "@wedding-yantra/core";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config.js";
import { withTransaction, type Db } from "../../db.js";
import { AppError } from "../../lib/http.js";
import { enquiryLine } from "../sales/alerts.js";
import { intakeLead } from "../sales/intake.js";
import {
  alertKey,
  clearPageProblem,
  heldAlert,
  leadAccessBlock,
  loadPage,
  openPageToken,
  OutageBreaker,
  ownerIds,
  pausePage,
  READ_PROBLEMS,
  setPageProblem,
  type PageProblem,
  type PageRow,
  type WorkerEnv,
} from "./common.js";
import { DEFAULT_RATE_LIMIT_WAIT_MS, isGraphError, type GraphLead, type MetaGraph } from "./graph.js";
import { pageHealth, runHealth, workspaceHealth } from "./health.js";
import { createPoller } from "./poller.js";

/**
 * Brings in the leads that wait in `incoming_leads`: reads each one from Meta with its Page's
 * token, reads the answers, and hands it to the shared intake (fewest open leads, merge a repeat,
 * alert). Nothing is lost silently: a lead that can't be read is retried, parked while its Page
 * has a problem, or shows as not brought in, with the reason.
 *
 * Runs inside the API process on its own timers (see index.ts); tests call `drain` and `tick`.
 */

export interface DrainOptions {
  /** The time to work at (tests); the clock otherwise */
  now?: Date;
  workspaceId?: string;
  /** A meta_pages row id */
  pageRowId?: string;
  /** Only leads that arrived before this */
  arrivedBefore?: Date;
  /** Give every waiting lead one go now, whatever its schedule (a Page being turned off) */
  force?: boolean;
}

export interface DrainResult {
  added: number;
  merged: number;
  /** Will be tried again later */
  retried: number;
  /** Waiting for the Page's problem to be fixed */
  parked: number;
  failed: number;
  skipped: number;
}

export type Outcome = "added" | "merged" | "retried" | "parked" | "failed" | "skipped" | "lost";

export interface ProcessResult {
  outcome: Outcome;
  leadId?: string;
  assignedTo?: string | null;
}

export interface ProcessOptions {
  /** The lead as already read from Meta (the catch-up), so it isn't read twice */
  lead?: GraphLead;
  /** Part of a batch: the caller sends one summary alert instead */
  quiet?: boolean;
}

export interface LeadWorker {
  /** Bring in waiting leads soon. Does nothing when automatic draining is off (tests drain themselves). */
  nudge(): void;
  /** Works through the leads that are due, within a time budget. */
  drain(options?: DrainOptions): Promise<DrainResult>;
  /** The clock's work: old leads given up on, catch-up polls, the daily health check, then a drain. */
  tick(now?: Date): Promise<void>;
  /** "Check again": the Page's health, a catch-up read, and its waiting and failed leads tried now. Returns the leads brought in. */
  checkPage(page: PageRow, now?: Date): Promise<number>;
  /** Health check of one Page now (no alerts). */
  checkHealth(page: PageRow, now?: Date): Promise<void>;
  /** The whole daily check for one business now, with its notices. */
  checkWorkspace(workspaceId: string, now?: Date): Promise<void>;
  /** One lead row, already claimed with `claim`. */
  process(rowId: string, claim: string, now: Date, options?: ProcessOptions): Promise<ProcessResult>;
  /** Many Pages failing the same way at once. */
  outage(now?: Date): boolean;
  stop(): Promise<void>;
}

/** Waits after each failed try: 30 s, 2 min, 10 min, 30 min, 1 h, 3 h, 6 h, 12 h, then daily. */
const LADDER_MS = [30e3, 120e3, 600e3, 1_800e3, 3_600e3, 10_800e3, 21_600e3, 43_200e3];
const DAY_MS = 86_400_000;
/** After this many tries a lead shows as not brought in. */
export const MAX_TRIES = 12;
/** Meta's "not found" is treated as a hiccup for this many tries before it's looked into. */
const AMBIGUOUS_TRIES = 4;
/** Meta keeps leads 90 days: a lead waiting longer than this is given up on. */
const GIVE_UP_DAYS = 80;
/** Leads per Page per batch, so one busy Page can't hold up the rest. */
const PER_PAGE = 5;
const BATCH = 50;
/** How long one drain may run. */
const BUDGET_MS = 20_000;
const HOUR_MS = 3_600_000;

type Row = {
  id: string;
  workspace_id: string;
  external_id: string;
  meta_page_id: string;
  received_via: "webhook" | "catch_up" | "test";
  attempts: number;
  received_at: Date;
  form_id: string | null;
  is_test: boolean;
};

const platformWord = (platform: string | null) => (adPlatform(platform) === "instagram" ? "Instagram" : "Facebook");

export function createLeadWorker(deps: {
  db: Db;
  config: Config;
  graph: MetaGraph | null;
  log: Pick<FastifyBaseLogger, "info" | "warn" | "error">;
  /** Alerts were made: push them to phones */
  onAlerts?: () => void;
}): LeadWorker {
  const { db, config, graph, log } = deps;
  const breaker = new OutageBreaker(db, log);
  const env: WorkerEnv | null = config.meta && graph ? { db, config, meta: config.meta, graph, log, breaker } : null;
  /** Pages with a problem get one probe lead an hour (row id -> when). */
  const probedAt = new Map<string, number>();
  const running = new Set<Promise<unknown>>();
  let stopped = false;
  let nudgeTimer: NodeJS.Timeout | null = null;
  let draining = false;
  let again = false;

  const track = <T>(p: Promise<T>): Promise<T> => {
    running.add(p);
    void p.finally(() => running.delete(p)).catch(() => undefined);
    return p;
  };

  // ---- one lead ---------------------------------------------------------------------

  async function release(
    e: WorkerEnv,
    row: Row,
    claim: string,
    now: Date,
    f: { status?: "failed" | "skipped"; errorKind: string; lastError: string | null; nextAt?: Date; attempts?: number },
  ): Promise<void> {
    await e.db.query(
      `UPDATE incoming_leads
          SET status = coalesce($4, status), error_kind = $5, last_error = $6, next_attempt_at = coalesce($7, next_attempt_at),
              attempts = coalesce($8, attempts), locked_until = NULL, claim_token = NULL,
              processed_at = CASE WHEN $4::text IS NULL THEN processed_at ELSE $9 END
        WHERE id = $1 AND workspace_id = $2 AND claim_token = $3 AND status = 'queued'`,
      [row.id, row.workspace_id, claim, f.status ?? null, f.errorKind, f.lastError ? f.lastError.slice(0, 500) : null, f.nextAt ?? null, f.attempts ?? null, now],
    );
  }

  /** Not brought in: visible on the screen, and the owners hear once a day per Page. */
  async function giveUp(e: WorkerEnv, row: Row, claim: string, page: PageRow, now: Date, errorKind: string, message: string | null, attempts?: number): Promise<ProcessResult> {
    await release(e, row, claim, now, { status: "failed", errorKind, lastError: message, attempts });
    await heldAlert(
      e,
      {
        workspaceId: row.workspace_id,
        facts: { what: "failed_leads", pageName: page.name, count: await failedToday(e, page, now) },
        dedupeKey: alertKey(row.workspace_id, page.page_id, "failed_leads", page.today),
        entityId: page.id,
      },
      now,
    );
    return { outcome: "failed" };
  }

  async function failedToday(e: WorkerEnv, page: PageRow, now: Date): Promise<number> {
    const { rows } = await e.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM incoming_leads
        WHERE workspace_id = $1 AND meta_page_id = $2 AND status = 'failed' AND processed_at > $3::timestamptz - interval '1 day'`,
      [page.workspace_id, page.id, now],
    );
    return Math.max(1, rows[0]?.n ?? 1);
  }

  /** Try again later, on the ladder; after MAX_TRIES it's not brought in. */
  async function retry(e: WorkerEnv, row: Row, claim: string, page: PageRow, now: Date, errorKind: string, message: string | null): Promise<ProcessResult> {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_TRIES) return giveUp(e, row, claim, page, now, errorKind, message, attempts);
    const wait = LADDER_MS[attempts - 1] ?? DAY_MS;
    await release(e, row, claim, now, { errorKind, lastError: message, nextAt: new Date(now.getTime() + wait), attempts });
    return { outcome: "retried" };
  }

  /** The Page can't be read until someone fixes it: no try is counted, and it's tried hourly. */
  async function park(e: WorkerEnv, row: Row, claim: string, page: PageRow, now: Date, problem: PageProblem, errorKind: string, message: string | null): Promise<ProcessResult> {
    if (row.received_at.getTime() < now.getTime() - GIVE_UP_DAYS * DAY_MS) {
      // Past what Meta keeps: no "Try again" can bring it in any more.
      return giveUp(e, row, claim, page, now, "expired", message ? `${message} (Meta keeps leads for 90 days.)` : "Meta keeps leads for 90 days.");
    }
    await setPageProblem(e, page, problem, message, now);
    await release(e, row, claim, now, { errorKind, lastError: message, nextAt: new Date(now.getTime() + HOUR_MS) });
    return { outcome: "parked" };
  }

  /** What a failed read means for the lead and its Page. */
  async function failure(e: WorkerEnv, row: Row, claim: string, page: PageRow, token: string, err: unknown, now: Date): Promise<ProcessResult> {
    if (!isGraphError(err)) {
      if (err instanceof AppError) return retry(e, row, claim, page, now, err.code === "NO_STAGES" ? "no_stages" : "internal", err.message);
      // Never the error's detail: it can hold the lead's answers.
      e.log.error({ incomingId: row.id, message: (err as Error)?.message, code: (err as { code?: string })?.code }, "meta: couldn't bring in a lead");
      return retry(e, row, claim, page, now, "internal", "Something went wrong on our side. It will be tried again.");
    }
    switch (err.kind) {
      case "token":
        return park(e, row, claim, page, now, "needs_reconnect", "token", err.message);
      case "rate_limit": {
        const until = new Date(now.getTime() + (err.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS));
        await pausePage(e, page, until);
        await release(e, row, claim, now, { errorKind: "rate_limit", lastError: err.message, nextAt: until });
        return { outcome: "retried" };
      }
      case "permission": {
        const blocked = await leadAccessBlock(e, page, token);
        if (blocked) return park(e, row, claim, page, now, "lead_access", "lead_access", blocked.reason ?? err.message);
        return park(e, row, claim, page, now, "permission_missing", "permission", err.message);
      }
      case "not_found": {
        // 100/33: a Leads Access block, a missing permission and a lead Meta hasn't finished
        // saving all look like this. Try a few times, then find out which.
        if (row.attempts + 1 <= AMBIGUOUS_TRIES) {
          await e.breaker.record("not_found", page.id, now);
          return retry(e, row, claim, page, now, "not_found", err.message);
        }
        const blocked = await leadAccessBlock(e, page, token);
        if (blocked) return park(e, row, claim, page, now, "lead_access", "lead_access", blocked.reason ?? err.message);
        try {
          const info = await e.graph.debugToken(token);
          if (!info.isValid) return park(e, row, claim, page, now, "needs_reconnect", "token", info.error?.message || err.message);
          if (info.scopes.length && !info.scopes.includes("leads_retrieval")) {
            return park(e, row, claim, page, now, "permission_missing", "permission", "The leads permission wasn't given");
          }
        } catch (checkErr) {
          if (isGraphError(checkErr) && checkErr.kind === "token") return park(e, row, claim, page, now, "needs_reconnect", "token", checkErr.message);
        }
        // Everything checks out: only Meta's own test lead may simply be gone.
        if (row.received_via === "test" || row.is_test) {
          await release(e, row, claim, now, { status: "skipped", errorKind: "not_found", lastError: "Meta no longer has this test lead", attempts: row.attempts + 1 });
          return { outcome: "skipped" };
        }
        return retry(e, row, claim, page, now, "not_found", err.message);
      }
      default:
        await e.breaker.record(err.kind, page.id, now);
        return retry(e, row, claim, page, now, err.kind, err.message);
    }
  }

  /** The form a lead came from, added when it's new (its questions label the answers). */
  async function ensureForm(e: WorkerEnv, page: PageRow, formId: string | null, token: string): Promise<{ id: string; name: string; questions: { key: string; label: string }[] } | null> {
    if (!formId) return null;
    const known = await e.db.query<{ id: string; name: string; questions: { key: string; label: string }[] }>(
      `SELECT id, name, questions FROM meta_forms WHERE workspace_id = $1 AND meta_page_id = $2 AND form_id = $3`,
      [page.workspace_id, page.id, formId],
    );
    if (known.rows[0]) return known.rows[0];
    let form: { name: string; status: string | null; questions: unknown[] } = { name: "", status: null, questions: [] };
    try {
      const f = await e.graph.getForm(formId, token);
      form = { name: f.name, status: f.status, questions: f.questions };
    } catch {
      // The lead still comes in; the form's name fills in at the next catch-up.
    }
    const { rows } = await e.db.query<{ id: string; name: string; questions: { key: string; label: string }[] }>(
      `INSERT INTO meta_forms (workspace_id, meta_page_id, form_id, name, status, questions, polled_through)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (meta_page_id, form_id) DO UPDATE SET name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE meta_forms.name END
       RETURNING id, name, questions`,
      [page.workspace_id, page.id, formId, form.name, form.status, JSON.stringify(form.questions), page.leads_since],
    );
    return rows[0] ?? null;
  }

  async function processRow(e: WorkerEnv, rowId: string, claim: string, now: Date, opts: ProcessOptions = {}): Promise<ProcessResult> {
    const found = await e.db.query<Row>(
      `SELECT id, workspace_id, external_id, meta_page_id, received_via, attempts, received_at, form_id, is_test
         FROM incoming_leads WHERE id = $1 AND claim_token = $2 AND status = 'queued' AND meta_page_id IS NOT NULL`,
      [rowId, claim],
    );
    const row = found.rows[0];
    if (!row) return { outcome: "lost" };
    const page = await loadPage(e.db, row.workspace_id, row.meta_page_id, now);
    if (!page?.active) {
      await e.db.query(`UPDATE incoming_leads SET locked_until = NULL, claim_token = NULL WHERE id = $1 AND workspace_id = $2 AND claim_token = $3`, [
        row.id,
        row.workspace_id,
        claim,
      ]);
      return { outcome: "lost" };
    }
    if (READ_PROBLEMS.includes(page.status)) probedAt.set(page.id, now.getTime());
    const token = openPageToken(e.meta, page);
    if (!token) return park(e, row, claim, page, now, "needs_reconnect", "token", "The Page's Facebook login has gone");

    let lead = opts.lead;
    if (!lead) {
      try {
        lead = await e.graph.getLead(row.external_id, token);
      } catch (err) {
        return failure(e, row, claim, page, token, err, now);
      }
    }

    try {
      const form = await ensureForm(e, page, lead.formId ?? row.form_id, token);
      const read = readLeadAnswers({
        fields: lead.fieldData.map((f) => ({ key: f.name, values: f.values })),
        questions: form?.questions ?? null,
        today: page.today,
      });
      const isTest = row.received_via === "test" || read.flags.includes("test");
      const platform = platformWord(lead.platform);
      const formName = form?.name || null;
      const via = `${platform} ${lead.isOrganic ? "form" : "ad"}${formName ? ` · ${formName}` : ""}`;
      const name = read.name ?? (isTest ? "Test lead" : `${platform} lead`);
      const activityMeta = Object.fromEntries(
        Object.entries({ platform: lead.platform, page: page.name, form: formName, campaign: lead.campaignName, ad: lead.adName }).filter(([, v]) => v),
      );

      const result = await withTransaction(e.db, async (tx) => {
        // Still ours and still waiting: a lead processed twice makes one enquiry.
        const mine = await tx.query(`SELECT 1 FROM incoming_leads WHERE id = $1 AND workspace_id = $2 AND status = 'queued' AND claim_token = $3 FOR UPDATE`, [
          row.id,
          row.workspace_id,
          claim,
        ]);
        if (!mine.rowCount) return null;
        // A test lead goes to the owner, so it never counts as a salesperson's work.
        const testOwner = isTest ? (await ownerIds(tx, row.workspace_id))[0] : undefined;
        const made = await intakeLead(
          tx,
          {
            workspaceId: row.workspace_id,
            source: sourceForPlatform(lead.platform),
            via: "meta",
            fields: {
              name,
              phone: read.phone,
              email: read.email,
              city: read.city,
              venue: read.venue,
              eventType: read.eventType,
              eventDate: read.eventDate,
              guestCount: read.guestCount,
              budget: read.budget,
              requirements: read.requirements,
            },
            repeatWindowDays: 30,
            fillBlanks: true,
            assignee: testOwner ? { userId: testOwner } : "routing",
            activityMeta,
            alertDetail: enquiryLine({ eventType: read.eventType, eventDate: read.eventDate, city: read.city }, via),
            againNote: `Sent the ${platform} form again${formName ? ` (${formName})` : ""}`,
            dedupeKey: `lead:meta:${row.workspace_id}:${row.external_id}`,
            incomingId: row.id,
            isTest,
            quiet: opts.quiet,
          },
          now,
        );
        await tx.query(
          `UPDATE incoming_leads
              SET status = $3, lead_id = $4, created_lead = $5, answers = $6::jsonb, name = $7, form_id = coalesce($8, form_id), form_name = $9,
                  campaign_id = $10, campaign_name = $11, adset_id = $12, adset_name = $13, ad_id = coalesce($14, ad_id), ad_name = $15,
                  platform = $16, is_test = $17, is_organic = $18, submitted_at = $19, processed_at = $20, attempts = attempts + 1,
                  error_kind = NULL, last_error = NULL, locked_until = NULL, claim_token = NULL
            WHERE id = $1 AND workspace_id = $2`,
          [
            row.id,
            row.workspace_id,
            made.merged ? "merged" : "added",
            made.leadId,
            !made.merged,
            JSON.stringify(read.answers),
            read.name,
            lead.formId,
            formName,
            lead.campaignId,
            lead.campaignName,
            lead.adsetId,
            lead.adsetName,
            lead.adId,
            lead.adName,
            lead.platform,
            isTest,
            lead.isOrganic,
            lead.createdTime && lead.createdTime !== new Date(0).toISOString() ? lead.createdTime : null,
            now,
          ],
        );
        // A test lead isn't a lead from the ads: "Last lead" and quiet Pages ignore it.
        if (!isTest) {
          await tx.query(`UPDATE meta_pages SET last_lead_at = greatest(last_lead_at, $3) WHERE id = $1 AND workspace_id = $2`, [page.id, page.workspace_id, now]);
          if (form) await tx.query(`UPDATE meta_forms SET last_lead_at = greatest(last_lead_at, $3) WHERE id = $1 AND workspace_id = $2`, [form.id, page.workspace_id, now]);
        }
        return made;
      });
      if (!result) return { outcome: "lost" };
      // A lead read fine: whatever stopped this Page's leads is fixed.
      await clearPageProblem(e, page, now);
      return { outcome: result.merged ? "merged" : "added", leadId: result.leadId, assignedTo: result.assignedTo };
    } catch (err) {
      return failure(e, row, claim, page, token, err, now);
    }
  }

  // ---- the queue --------------------------------------------------------------------

  /** Claims due leads: at most PER_PAGE per Page (one probe for a Page with a problem), skipping any another worker holds. */
  async function claimBatch(e: WorkerEnv, now: Date, claim: string, opts: DrainOptions, done: string[]): Promise<string[]> {
    const probed = [...probedAt].filter(([, at]) => Math.abs(now.getTime() - at) < HOUR_MS).map(([id]) => id);
    const { rows } = await e.db.query<{ id: string }>(
      `UPDATE incoming_leads i SET locked_until = $1::timestamptz + interval '2 minutes', claim_token = $2
        WHERE i.id IN (
          SELECT q.id FROM incoming_leads q
           WHERE q.id IN (
             SELECT d.id FROM (
               SELECT i2.id, p.status AS page_status,
                      row_number() OVER (PARTITION BY i2.meta_page_id ORDER BY i2.next_attempt_at, i2.received_at, i2.id) AS n
                 FROM incoming_leads i2
                 JOIN meta_pages p ON p.id = i2.meta_page_id AND p.workspace_id = i2.workspace_id
                 JOIN workspaces w ON w.id = i2.workspace_id AND w.deleted_at IS NULL
                WHERE i2.status = 'queued' AND (i2.locked_until IS NULL OR i2.locked_until < $1::timestamptz)
                  AND p.active AND p.page_token_enc IS NOT NULL
                  AND ($3::boolean OR (i2.next_attempt_at <= $1::timestamptz
                       AND (p.paused_until IS NULL OR p.paused_until <= $1::timestamptz)
                       AND NOT (p.status = ANY($9::text[]) AND p.id = ANY($4::uuid[]))))
                  AND ($5::uuid IS NULL OR i2.workspace_id = $5::uuid)
                  AND ($6::uuid IS NULL OR i2.meta_page_id = $6::uuid)
                  AND ($7::timestamptz IS NULL OR i2.received_at < $7::timestamptz)
                  AND NOT (i2.id = ANY($8::uuid[]))
             ) d
             WHERE d.n <= CASE WHEN NOT $3::boolean AND d.page_status = ANY($9::text[]) THEN 1 ELSE ${PER_PAGE} END
           )
             AND q.status = 'queued' AND (q.locked_until IS NULL OR q.locked_until < $1::timestamptz)
           ORDER BY q.next_attempt_at
           LIMIT ${BATCH}
           FOR UPDATE SKIP LOCKED
        )
        RETURNING i.id`,
      [now, claim, opts.force ?? false, probed, opts.workspaceId ?? null, opts.pageRowId ?? null, opts.arrivedBefore ?? null, done, [...READ_PROBLEMS]],
    );
    return rows.map((r) => r.id);
  }

  async function drainNow(opts: DrainOptions = {}): Promise<DrainResult> {
    const result: DrainResult = { added: 0, merged: 0, retried: 0, parked: 0, failed: 0, skipped: 0 };
    if (!env) return result;
    const started = Date.now();
    // Each lead gets one go per drain.
    const done: string[] = [];
    while (!stopped && Date.now() - started < BUDGET_MS) {
      const now = opts.now ?? new Date();
      const claim = randomUUID();
      const ids = await claimBatch(env, now, claim, opts, done);
      if (!ids.length) break;
      for (const id of ids) {
        done.push(id);
        const r = await processRow(env, id, claim, now);
        if (r.outcome !== "lost") result[r.outcome] += 1;
      }
    }
    if (result.added + result.merged + result.failed + result.parked) deps.onAlerts?.();
    return result;
  }

  /** Leads waiting longer than Meta keeps them (a Page that stayed broken) are given up on. */
  async function giveUpOld(e: WorkerEnv, now: Date): Promise<void> {
    await e.db.query(
      `UPDATE incoming_leads
          SET status = 'failed', error_kind = 'expired',
              last_error = 'Waited too long: Meta keeps leads for 90 days', locked_until = NULL, claim_token = NULL, processed_at = $1
        WHERE status = 'queued' AND received_at < $1::timestamptz - make_interval(days => $2)`,
      [now, GIVE_UP_DAYS],
    );
  }

  const poller = env ? createPoller(env, (rowId, claim, now, opts) => processRow(env, rowId, claim, now, opts)) : null;

  async function tickNow(now: Date): Promise<void> {
    if (!env || !poller) return;
    await giveUpOld(env, now);
    await poller.pollDue(now);
    await runHealth(env, now);
    await drainNow({ now });
    deps.onAlerts?.();
  }

  async function checkPageNow(page: PageRow, now: Date): Promise<number> {
    if (!env || !poller) return 0;
    const started = new Date();
    await pageHealth(env, page, now, { alert: false });
    // "Try again": leads that weren't brought in get a fresh set of tries; parked ones go now.
    await env.db.query(
      `UPDATE incoming_leads SET status = 'queued', attempts = 0, next_attempt_at = $3, processed_at = NULL
        WHERE workspace_id = $1 AND meta_page_id = $2 AND status = 'failed' AND coalesce(error_kind, '') NOT IN ('page_off', 'expired')
          AND received_at > $3::timestamptz - make_interval(days => $4)`,
      [page.workspace_id, page.id, now, GIVE_UP_DAYS],
    );
    await env.db.query(`UPDATE incoming_leads SET next_attempt_at = $3 WHERE workspace_id = $1 AND meta_page_id = $2 AND status = 'queued'`, [
      page.workspace_id,
      page.id,
      now,
    ]);
    probedAt.delete(page.id);
    const fresh = await loadPage(env.db, page.workspace_id, page.id, now);
    if (fresh?.active && !["needs_reconnect", "lead_access"].includes(fresh.status)) await poller.pollPage(fresh, now, { sweep: true });
    await drainNow({ now, pageRowId: page.id });
    const { rows } = await env.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM incoming_leads
        WHERE workspace_id = $1 AND meta_page_id = $2 AND status IN ('added', 'merged') AND updated_at >= $3`,
      [page.workspace_id, page.id, started],
    );
    deps.onAlerts?.();
    return rows[0]?.n ?? 0;
  }

  /** The timers' drain: never two at once; a nudge meanwhile runs it again after. */
  async function backgroundDrain(): Promise<void> {
    if (draining) {
      again = true;
      return;
    }
    draining = true;
    try {
      do {
        again = false;
        await drainNow();
      } while (again && !stopped);
    } catch (err) {
      log.warn({ message: (err as Error)?.message }, "meta: lead worker drain failed");
    } finally {
      draining = false;
    }
  }

  return {
    nudge() {
      if (!config.incoming.autoDrain || stopped || !env || nudgeTimer) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        void track(backgroundDrain());
      }, 25);
    },
    drain(options = {}) {
      return track(drainNow(options));
    },
    tick(now = new Date()) {
      return track(tickNow(now));
    },
    checkPage(page, now = new Date()) {
      return track(checkPageNow(page, now));
    },
    async checkHealth(page, now = new Date()) {
      if (env) await track(pageHealth(env, page, now, { alert: false }));
    },
    async checkWorkspace(workspaceId, now = new Date()) {
      if (env) await track(workspaceHealth(env, workspaceId, now));
    },
    process(rowId, claim, now, options) {
      if (!env) return Promise.resolve({ outcome: "lost" as const });
      return track(processRow(env, rowId, claim, now, options));
    },
    outage(now = new Date()) {
      return breaker.tripped(now);
    },
    async stop() {
      stopped = true;
      if (nudgeTimer) clearTimeout(nudgeTimer);
      nudgeTimer = null;
      await Promise.allSettled([...running]);
    },
  };
}
