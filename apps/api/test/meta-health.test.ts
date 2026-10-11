import type { MetaCompleteResult, MetaDeletionStatus, MetaStatus } from "@wedding-yantra/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OutageBreaker } from "../src/modules/meta/common.js";
import { fakeIds } from "../src/modules/meta/fake-graph.js";
import { GraphError } from "../src/modules/meta/graph.js";
import { redactUrl } from "../src/modules/meta/webhook.js";
import { metaHousekeeping } from "../src/modules/notifications/scheduler.js";
import { call, setup, type TestContext } from "./helpers.js";
import {
  alerts,
  businessWithTeam,
  connectMeta,
  fakeGraph,
  incoming,
  leadgenBody,
  META_ENV,
  pageRows,
  postSigned,
  postWebhook,
  signedRequest,
} from "./meta-helpers.js";

const fake = fakeGraph();
let t: TestContext;
beforeAll(async () => {
  t = await setup({ env: { ...META_ENV, BILLING_ENFORCED: "true" }, metaGraph: fake });
});
afterAll(async () => {
  await t.close();
});

async function connected(prefix: string, world: number) {
  const b = await businessWithTeam(t, prefix);
  const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, `fake:one-page:${world}`);
  expect(done.body.data.pages[0]!.active).toBe(true);
  return { ...b, ids: fakeIds(world), pageRowId: done.body.data.pages[0]!.id };
}

const problems = async (ws: string, token: string) => (await alerts(t.app, ws, token, "lead.source_problem")).map((a) => a.title);
const status = async (ws: string, token: string) => (await call<MetaStatus>(t.app, "GET", `/workspaces/${ws}/meta`, { token })).body.data;

/** 10:30 in India, `days` from today. */
function indiaMorning(days: number): Date {
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  return new Date(new Date(`${today}T10:30:00+05:30`).getTime() + days * 86_400_000);
}

describe("the daily check", () => {
  it("doesn't raise the alarm when only the person's own login runs out", async () => {
    const b = await connected("941", 41);
    fake.revokeToken(`fake-user-token-${b.ids.userId}`);
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect(await problems(b.ws, b.owner)).toEqual([]);
    const s = await status(b.ws, b.owner);
    expect(s.connections[0]!.status).toBe("ok");
    expect(s.pages[0]).toMatchObject({ status: "ok", problems: [] });
  });

  it("does when the Page's own login stops working", async () => {
    const b = await connected("942", 42);
    fake.revokeToken(`fake-page-token-${b.ids.pageIds[0]}`);
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect(await problems(b.ws, b.owner)).toEqual(["Facebook leads stopped: log in again"]);
    expect((await status(b.ws, b.owner)).pages[0]).toMatchObject({ status: "needs_reconnect", problems: [expect.objectContaining({ kind: "needs_reconnect" })] });
  });

  it("warns once, at 10 in the morning, that Facebook wants a login again within two weeks", async () => {
    const b = await connected("943", 43);
    const expiry = new Date(Date.now() + 10 * 86_400_000);
    fake.setTokenExpiry(`fake-page-token-${b.ids.pageIds[0]}`, { dataAccessExpiresAt: expiry });
    fake.setTokenExpiry(`fake-user-token-${b.ids.userId}`, { dataAccessExpiresAt: new Date(expiry.getTime() + 86_400_000) });
    // Not before 10.
    await t.app.leadWorker.tick(new Date(indiaMorning(1).getTime() - 2 * 3_600_000));
    expect(await problems(b.ws, b.owner)).toEqual([]);
    await t.app.leadWorker.tick(indiaMorning(1));
    await t.app.leadWorker.tick(new Date(indiaMorning(1).getTime() + 30 * 60_000));
    await t.app.leadWorker.tick(indiaMorning(2));
    const said = await problems(b.ws, b.owner);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/^Log in to Facebook again by \d+ \w+$/);
    const s = await status(b.ws, b.owner);
    expect(s.connections[0]).toMatchObject({ status: "reconnect_soon" });
    expect(new Date(s.connections[0]!.dataAccessExpiresAt!).getTime()).toBe(Math.floor(expiry.getTime() / 1000) * 1000);
    expect(s.problems).toEqual([expect.objectContaining({ kind: "reconnect_soon" })]);
    // Leads keep coming meanwhile.
    expect(s.pages[0]!.status).toBe("ok");
  });

  it("asks Meta again to send leads when it stopped, and says when Leads Access blocks them", async () => {
    const b = await connected("944", 44);
    await fake.unsubscribePage(b.ids.pageIds[0], `fake-page-token-${b.ids.pageIds[0]}`);
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect(fake.isSubscribed(b.ids.pageIds[0])).toBe(true);
    expect(await problems(b.ws, b.owner)).toEqual([]);

    await fake.unsubscribePage(b.ids.pageIds[0], `fake-page-token-${b.ids.pageIds[0]}`);
    fake.failNext("subscribePage", new GraphError("other", "Meta: (#200) Not allowed"));
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])!.status).toBe("not_subscribed");

    fake.setLeadAccess(b.ids.pageIds[0], { canAccess: false, failureReason: "No CRM assigned" });
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])).toMatchObject({ status: "lead_access", problem: "No CRM assigned" });
    expect(await problems(b.ws, b.owner)).toEqual(["Facebook leads stopped: Shubh Vivah Weddings 44", "Facebook isn't sending leads from Shubh Vivah Weddings 44"]);

    // Fixed: everything clears.
    fake.setLeadAccess(b.ids.pageIds[0], { canAccess: true });
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])).toMatchObject({ status: "ok", problem: null });
  });

  it("notices when whoever connected has left, and when a busy Page goes quiet", async () => {
    const b = await connected("945", 45);
    await t.db.query(`UPDATE meta_connections SET connected_by = $2 WHERE workspace_id = $1`, [b.ws, b.arfin.userId]);
    await t.db.query(`UPDATE memberships SET removed_at = now() WHERE workspace_id = $1 AND user_id = $2`, [b.ws, b.arfin.userId]);
    const quietSince = new Date(Date.now() - 4 * 86_400_000);
    await t.db.query(`UPDATE meta_pages SET last_lead_at = $3 WHERE id = $1 AND workspace_id = $2`, [b.pageRowId, b.ws, quietSince]);
    for (let i = 0; i < 5; i++) {
      await t.db.query(
        `INSERT INTO incoming_leads (workspace_id, external_id, meta_page_id, received_via, status, processed_at) VALUES ($1, $2, $3, 'webhook', 'added', $4)`,
        [b.ws, `old-${i}`, b.pageRowId, new Date(quietSince.getTime() - i * 3_600_000)],
      );
    }
    await t.app.leadWorker.checkWorkspace(b.ws);
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect((await problems(b.ws, b.owner)).sort()).toEqual(["Arfin connected Facebook and has left", "No Facebook leads for 4 days"]);
    const s = await status(b.ws, b.owner);
    expect(s.problems).toEqual([expect.objectContaining({ kind: "connector_left", title: "Arfin Khan has left the business" })]);
    expect(s.pages[0]!.problems).toEqual([expect.objectContaining({ kind: "quiet", title: "No leads from “Shubh Vivah Weddings 45” for 4 days" })]);
  });

  it("stops leads 30 days after a plan runs out unpaid", async () => {
    const b = await connected("946", 46);
    await t.db.query(`UPDATE workspaces SET trial_ends_at = now() - interval '31 days' WHERE id = $1`, [b.ws]);
    await t.app.leadWorker.checkWorkspace(b.ws);
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])).toMatchObject({ active: false, status: "off", page_token_enc: null });
    expect(await problems(b.ws, b.owner)).toEqual(["Facebook leads paused"]);
  });
});

describe("when someone removes Wedding Yantra on Facebook", () => {
  it("deauthorize: the connection is revoked, the Page waits for a reconnect, and Meta isn't told to stop", async () => {
    const b = await connected("951", 51);
    const unsubscribes = fake.calls.filter((c) => c.method === "unsubscribePage").length;
    const res = await postSigned(t.app, "deauthorize", signedRequest({ user_id: b.ids.userId }));
    expect(res.statusCode).toBe(200);
    const s = await status(b.ws, b.owner);
    expect(s.connections[0]!.status).toBe("revoked");
    expect(s.pages[0]).toMatchObject({ active: true, status: "needs_reconnect" });
    expect(s.problems[0]).toMatchObject({ kind: "needs_reconnect" });
    expect(await problems(b.ws, b.owner)).toEqual(["Facebook was disconnected"]);
    expect(fake.calls.filter((c) => c.method === "unsubscribePage")).toHaveLength(unsubscribes);
    const conn = await t.db.query(`SELECT 1 FROM meta_connections WHERE workspace_id = $1 AND user_token_enc IS NOT NULL`, [b.ws]);
    expect(conn.rowCount).toBe(0);

    // Leads still queue meanwhile, and come in after a reconnect.
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id }]));
    await t.app.leadWorker.drain();
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "queued" });
    await connectMeta(t.app, b.owner, b.ws, "fake:one-page:51");
    await t.app.leadWorker.drain();
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "added" });
  });

  it("data deletion: their connection and tokens go, their name leaves the log, and the status page shows it", async () => {
    const b = await connected("952", 52);
    const res = await postSigned(t.app, "data-deletion", signedRequest({ user_id: b.ids.userId }));
    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toMatch(/^[\w-]{40,}$/);
    expect(body.url).toBe(`http://localhost:3000/meta-deletion?code=${body.confirmation_code}`);

    const shown = await call<MetaDeletionStatus>(t.app, "GET", `/integrations/meta/deletion/${body.confirmation_code}`);
    expect(shown.body.data).toMatchObject({ status: "done", requestedAt: expect.any(String), completedAt: expect.any(String) });
    expect((await call(t.app, "GET", "/integrations/meta/deletion/not-a-real-code-at-all")).status).toBe(404);

    expect((await status(b.ws, b.owner)).connections).toEqual([]);
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])).toMatchObject({ active: false, page_token_enc: null });
    expect(fake.isSubscribed(b.ids.pageIds[0])).toBe(true);
    const log = await t.db.query<{ meta: Record<string, unknown> }>(`SELECT meta FROM activity_log WHERE workspace_id = $1 AND action = 'meta.connected'`, [b.ws]);
    expect(log.rows[0]!.meta).not.toHaveProperty("fbUserName");
    const kept = await t.db.query<{ fb_user_hash: string }>(`SELECT fb_user_hash FROM meta_deletion_requests WHERE code = $1`, [body.confirmation_code]);
    expect(kept.rows[0]!.fb_user_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(kept.rows[0]!.fb_user_hash).not.toContain(b.ids.userId);
  });

  it("refuses a signed_request that isn't Meta's", async () => {
    const good = signedRequest({ user_id: "123" });
    const [sig, payload] = good.split(".") as [string, string];
    for (const bad of [`${sig.slice(0, 10)}.${payload}`, signedRequest({ user_id: "123" }, "another-secret"), "junk", "", `${sig}.${payload}x`]) {
      expect((await postSigned(t.app, "deauthorize", bad)).statusCode).toBe(400);
      expect((await postSigned(t.app, "data-deletion", bad)).statusCode).toBe(400);
    }
  });
});

describe("housekeeping and safety nets", () => {
  it("clears old sign-in attempts and leads not brought in after 90 days", async () => {
    const b = await connected("953", 53);
    await t.db.query(`UPDATE meta_oauth_states SET expires_at = now() - interval '2 days' WHERE workspace_id = $1`, [b.ws]);
    await t.db.query(
      `INSERT INTO incoming_leads (workspace_id, external_id, meta_page_id, received_via, status, received_at)
       VALUES ($1, 'old-failed', $2, 'webhook', 'failed', now() - interval '91 days'), ($1, 'new-failed', $2, 'webhook', 'failed', now()),
              ($1, 'old-added', $2, 'webhook', 'added', now() - interval '91 days')`,
      [b.ws, b.pageRowId],
    );
    await metaHousekeeping(t.db, new Date(), true);
    expect((await t.db.query(`SELECT 1 FROM meta_oauth_states WHERE workspace_id = $1`, [b.ws])).rowCount).toBe(0);
    expect((await incoming(t, b.ws)).map((r) => r.external_id).sort()).toEqual(["new-failed", "old-added"]);
  });

  it("holds owner alerts when many Pages fail the same way at once", async () => {
    let active = 10;
    const errors: string[] = [];
    const breaker = new OutageBreaker({ query: async () => ({ rows: [{ n: active }] }) } as never, { info: () => undefined, warn: () => undefined, error: (_o: unknown, m: string) => errors.push(m) } as never);
    const now = new Date();
    for (const page of ["p1", "p2", "p3"]) await breaker.record("token", page, now);
    // 3 of 10 isn't more than 30%.
    expect(breaker.tripped(now)).toBe(false);
    await breaker.record("token", "p4", now);
    expect(breaker.tripped(now)).toBe(true);
    expect(errors).toHaveLength(1);
    // An hour later it's over.
    expect(breaker.tripped(new Date(now.getTime() + 61 * 60_000))).toBe(false);
    // One small business alone never trips it.
    active = 1;
    const small = new OutageBreaker({ query: async () => ({ rows: [{ n: active }] }) } as never, { info: () => undefined, warn: () => undefined, error: () => undefined } as never);
    await small.record("token", "only", now);
    expect(small.tripped(now)).toBe(false);
  });

  it("never logs the webhook's verify token", () => {
    expect(redactUrl("/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=s3cret&hub.challenge=1")).toBe(
      "/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=[redacted]&hub.challenge=1",
    );
    expect(redactUrl("/x?hub%2Everify_token=s3cret")).not.toContain("s3cret");
    expect(redactUrl("/api/v1/leads?q=1")).toBe("/api/v1/leads?q=1");
  });
});
