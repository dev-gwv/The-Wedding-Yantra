import { randomUUID } from "node:crypto";
import { salesAlert } from "../sales/alerts.js";
import { alertKey, heldAlert, openPageToken, PAGE_COLUMNS, PAGE_JOINS, pageGraphError, setPageProblem, type PageRow, type WorkerEnv } from "./common.js";
import type { GraphErrorKind, GraphForm, GraphLead } from "./graph.js";
import type { ProcessOptions, ProcessResult } from "./worker.js";

/**
 * The catch-up: Meta's webhook sometimes doesn't arrive, so every active Page is also read
 * every META_POLL_MINUTES. Its forms (with their lead counts) are listed each time, so a new
 * form is found too; a form whose count rose is read from an hour before where the last read
 * got to, and every form is read once a day. A lead found here that we don't have is brought
 * in straight away, through the same path as the webhook's.
 */

type Process = (rowId: string, claim: string, now: Date, options: ProcessOptions) => Promise<ProcessResult>;

/** Result pages (100 leads each) read per form per run; a bigger backlog carries on next run. */
export const MAX_READS_PER_FORM = 3;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** More leads than this found at once: one summary alert instead of one each. */
const SUMMARY_OVER = 3;
/** This many leads the webhook missed in a day: ask Meta to send them again. */
const RESUBSCRIBE_AT = 2;
/** Pages polled per run. */
const PAGES_PER_RUN = 25;
/** Failures that stop the whole Page's catch-up; anything else only skips that one form this run. */
const PAGE_WIDE: readonly (GraphErrorKind | undefined)[] = ["token", "rate_limit", "permission"];

interface StoredForm {
  id: string;
  form_id: string;
  name: string;
  leads_count: number;
  polled_through: Date | null;
}

export interface PollResult {
  /** Leads Meta had that we didn't */
  found: number;
  /** Of those, brought into Leads */
  recovered: number;
}

export function createPoller(env: WorkerEnv, process: Process) {
  /** Where a capped read stopped, per form row: carried on at the next run. */
  const cursors = new Map<string, { since: Date; after: string; startedAt: Date }>();
  /** When each Page was last asked to send its leads again (row id -> time). */
  const resubscribed = new Map<string, number>();

  /** The Page's forms, saved; returns them with what we knew before this run. */
  async function saveForms(page: PageRow, forms: GraphForm[]): Promise<(StoredForm & { metaCount: number })[]> {
    const out: (StoredForm & { metaCount: number })[] = [];
    for (const f of forms) {
      if (!f.id) continue;
      // New forms start at the Page's switch-on time, so their leads since then are read.
      const { rows } = await env.db.query<StoredForm>(
        `INSERT INTO meta_forms (workspace_id, meta_page_id, form_id, name, status, questions, leads_count, polled_through)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, 0, $7)
         ON CONFLICT (meta_page_id, form_id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, questions = EXCLUDED.questions
         RETURNING id, form_id, name, leads_count, polled_through`,
        [page.workspace_id, page.id, f.id, f.name, f.status, JSON.stringify(f.questions), page.leads_since],
      );
      if (rows[0]) out.push({ ...rows[0], metaCount: f.leadsCount });
    }
    return out;
  }

  /**
   * One form's new leads, up to the cap. When Meta refuses, the Page's problem is recorded and
   * `stop` says whether it's the whole Page (the run ends) or only this form (the next is read).
   */
  async function readForm(
    page: PageRow,
    token: string,
    form: StoredForm & { metaCount: number },
    now: Date,
  ): Promise<{ leads: GraphLead[] } | { stop: boolean }> {
    // Nothing from before the Page was switched on (or back on) is brought in. Meta keeps
    // whole seconds, so the switch-on second itself counts.
    const floor = new Date(Math.floor((page.leads_since ?? new Date(now.getTime() - HOUR_MS)).getTime() / 1000) * 1000);
    const resume = cursors.get(form.id);
    const since = resume?.since ?? new Date(Math.max((form.polled_through ?? floor).getTime() - HOUR_MS, floor.getTime()) - 1000);
    let after = resume?.after;
    const leads: GraphLead[] = [];
    try {
      for (let i = 0; i < MAX_READS_PER_FORM; i++) {
        const res = await env.graph.formLeads(form.form_id, token, since, after);
        leads.push(...res.leads.filter((l) => new Date(l.createdTime).getTime() >= floor.getTime()));
        after = res.next ?? undefined;
        if (!after) break;
      }
    } catch (err) {
      // A saved place Meta no longer takes would fail every time: the next try starts afresh.
      cursors.delete(form.id);
      await pageGraphError(env, page, token, err, now);
      const kind = (err as { kind?: GraphErrorKind }).kind;
      return { stop: PAGE_WIDE.includes(kind) || page.status === "lead_access" };
    }
    if (after) {
      // Capped: the clock stays where it was, and the next run carries on from here.
      cursors.set(form.id, { since, after, startedAt: resume?.startedAt ?? now });
    } else {
      cursors.delete(form.id);
      await env.db.query(`UPDATE meta_forms SET polled_through = $3, leads_count = $4 WHERE id = $1 AND workspace_id = $2`, [
        form.id,
        page.workspace_id,
        resume?.startedAt ?? now,
        form.metaCount,
      ]);
    }
    return { leads };
  }

  /** Leads Meta has that we don't: saved as catch-up rows, already claimed, and brought in now. */
  async function bringIn(page: PageRow, leads: GraphLead[], now: Date): Promise<PollResult> {
    const unique = [...new Map(leads.filter((l) => l.id).map((l) => [l.id, l])).values()];
    if (!unique.length) return { found: 0, recovered: 0 };
    const claim = randomUUID();
    const { rows } = await env.db.query<{ id: string; external_id: string }>(
      `INSERT INTO incoming_leads (workspace_id, channel, external_id, meta_page_id, received_via, form_id, ad_id, submitted_at,
                                   claim_token, locked_until, received_at, next_attempt_at)
       SELECT $1, 'meta', x.id, $2, 'catch_up', x.form_id, x.ad_id, x.created, $3, $4::timestamptz + interval '2 minutes', $4, $4
         FROM unnest($5::text[], $6::text[], $7::text[], $8::timestamptz[]) AS x(id, form_id, ad_id, created)
       ON CONFLICT (workspace_id, channel, external_id) DO NOTHING
       RETURNING id, external_id`,
      [page.workspace_id, page.id, claim, now, unique.map((l) => l.id), unique.map((l) => l.formId), unique.map((l) => l.adId), unique.map((l) => l.createdTime)],
    );
    const byId = new Map(unique.map((l) => [l.id, l]));
    const quiet = rows.length > SUMMARY_OVER;
    const made: { leadId: string; assignedTo: string | null }[] = [];
    for (const r of rows) {
      const result = await process(r.id, claim, now, { lead: byId.get(r.external_id), quiet });
      if ((result.outcome === "added" || result.outcome === "merged") && result.leadId) {
        made.push({ leadId: result.leadId, assignedTo: result.assignedTo ?? null });
      }
    }
    if (quiet && made.length) {
      await tellAssignees(page, made, now);
      // And the owners hear the lot came in late (held back while Facebook itself is failing).
      await heldAlert(
        env,
        {
          workspaceId: page.workspace_id,
          facts: { what: "recovered", pageName: page.name, count: made.length },
          dedupeKey: alertKey(page.workspace_id, page.page_id, "recovered", now.toISOString()),
          entityId: page.id,
        },
        now,
      );
    }
    return { found: rows.length, recovered: made.length };
  }

  /**
   * A batch brought in quietly: each person who got some of it hears once, straight away, with
   * a link to them. Never held back, since the leads' own alerts were skipped. Like a lead's
   * "New enquiry" alert, this counts as the alert for their first follow-up.
   */
  async function tellAssignees(page: PageRow, made: { leadId: string; assignedTo: string | null }[], now: Date): Promise<void> {
    const ws = page.workspace_id;
    const { rows } = await env.db.query<{ id: string; name: string; source: string }>(
      `SELECT id, name, source FROM leads WHERE workspace_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL`,
      [ws, made.map((m) => m.leadId)],
    );
    const leads = new Map(rows.map((r) => [r.id, r]));
    const byPerson = new Map<string | null, { id: string; name: string; source: string }[]>();
    for (const m of made) {
      const lead = leads.get(m.leadId);
      if (!lead) continue;
      const list = byPerson.get(m.assignedTo) ?? [];
      if (!list.some((l) => l.id === lead.id)) list.push(lead);
      byPerson.set(m.assignedTo, list);
    }
    for (const [person, list] of byPerson) {
      const detail = `From ${page.name}. Facebook sent ${list.length === 1 ? "it" : "them"} late.`;
      const sources = new Set(list.map((l) => l.source));
      const link =
        list.length === 1 ? `/app/leads/${list[0]!.id}` : sources.size === 1 ? `/app/leads?source=${encodeURIComponent([...sources][0]!)}` : "/app/leads";
      await salesAlert(env.db, {
        workspaceId: ws,
        kind: "lead.new",
        to: [person],
        facts: list.length === 1 ? { name: list[0]!.name, detail } : { name: "", count: list.length, detail },
        link,
        entityType: "lead",
        entityId: list[0]!.id,
        dedupeKey: `lead:meta:${ws}:${page.page_id}:late:${now.toISOString()}`,
      });
    }
  }

  /** Two or more leads the webhook missed in a day: ask Meta again to send this Page's leads. */
  async function resubscribeIfMissing(page: PageRow, token: string, now: Date): Promise<void> {
    const last = resubscribed.get(page.id);
    if (last !== undefined && Math.abs(now.getTime() - last) < DAY_MS) return;
    // A lead filled minutes ago may simply not have arrived yet: it doesn't count as missed.
    const { rows } = await env.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM incoming_leads
        WHERE workspace_id = $1 AND meta_page_id = $2 AND received_via = 'catch_up' AND received_at > $3::timestamptz - interval '24 hours'
          AND (submitted_at IS NULL OR submitted_at < received_at - interval '5 minutes')`,
      [page.workspace_id, page.id, now],
    );
    if ((rows[0]?.n ?? 0) < RESUBSCRIBE_AT) return;
    resubscribed.set(page.id, now.getTime());
    try {
      await env.graph.subscribePage(page.page_id, token);
    } catch (err) {
      await setPageProblem(env, page, "not_subscribed", err instanceof Error ? err.message : null, now);
      return;
    }
    await heldAlert(
      env,
      {
        workspaceId: page.workspace_id,
        facts: { what: "resubscribed", pageName: page.name },
        dedupeKey: alertKey(page.workspace_id, page.page_id, "resubscribed", page.today),
        entityId: page.id,
      },
      now,
    );
  }

  /** One Page's catch-up. `sweep` reads every form, not only those whose lead count changed. */
  async function pollPage(page: PageRow, now: Date, opts: { sweep?: boolean } = {}): Promise<PollResult> {
    const token = openPageToken(env.meta, page);
    if (!token) return { found: 0, recovered: 0 };
    let forms: GraphForm[];
    try {
      forms = await env.graph.listForms(page.page_id, token);
    } catch (err) {
      await pageGraphError(env, page, token, err, now);
      await schedule(page, now, { capped: false, swept: false });
      return { found: 0, recovered: 0 };
    }
    const stored = await saveForms(page, forms);
    const sweep = opts.sweep || !page.swept_at || now.getTime() - page.swept_at.getTime() >= DAY_MS;
    // A changed count: new leads (or old ones Meta deleted after 90 days, which can hide new ones).
    const due = stored.filter((f) => sweep || cursors.has(f.id) || f.metaCount !== f.leads_count);
    const found: GraphLead[] = [];
    const failed: string[] = [];
    for (const form of due) {
      const read = await readForm(page, token, form, now);
      if ("leads" in read) {
        found.push(...read.leads);
        continue;
      }
      failed.push(form.form_id);
      // One form Meta won't read doesn't hold up the others; trouble with the whole Page does.
      if (read.stop) break;
    }
    const complete = failed.length === 0;
    if (!complete) env.log.warn({ pageId: page.page_id, formIds: failed }, "meta: catch-up couldn't read some forms");
    const capped = due.some((f) => cursors.has(f.id));
    const result = await bringIn(page, found, now);
    if (result.found) await resubscribeIfMissing(page, token, now);
    await schedule(page, now, { capped, swept: sweep && complete && !capped });
    return { found: result.found, recovered: result.recovered };
  }

  async function schedule(page: PageRow, now: Date, s: { capped: boolean; swept: boolean }): Promise<void> {
    // A capped read carries on at the next run; otherwise every META_POLL_MINUTES, give or take a tenth.
    const minutes = env.meta.pollMinutes * (0.9 + Math.random() * 0.2);
    const next = s.capped ? now : new Date(now.getTime() + minutes * 60_000);
    await env.db.query(
      `UPDATE meta_pages SET next_poll_at = $3, swept_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE swept_at END WHERE id = $1 AND workspace_id = $2`,
      [page.id, page.workspace_id, next, s.swept, now],
    );
  }

  /** Every active Page whose catch-up is due, unless its token is dead or Leads Access blocks it. */
  async function pollDue(now: Date): Promise<number> {
    const { rows } = await env.db.query<PageRow>(
      `SELECT ${PAGE_COLUMNS} FROM meta_pages p ${PAGE_JOINS}
        WHERE p.active AND p.page_token_enc IS NOT NULL AND p.status NOT IN ('needs_reconnect', 'lead_access')
          AND (p.paused_until IS NULL OR p.paused_until <= $1) AND (p.next_poll_at IS NULL OR p.next_poll_at <= $1)
        ORDER BY p.next_poll_at NULLS FIRST LIMIT ${PAGES_PER_RUN}`,
      [now],
    );
    let found = 0;
    for (const page of rows) {
      try {
        found += (await pollPage(page, now)).found;
      } catch (err) {
        env.log.warn({ pageId: page.page_id, message: (err as Error)?.message }, "meta: catch-up failed");
      }
    }
    return found;
  }

  return { pollPage, pollDue };
}
