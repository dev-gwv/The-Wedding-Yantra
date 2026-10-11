import type { MetaCompleteResult, MetaStatus } from "@wedding-yantra/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { fakeIds } from "../src/modules/meta/fake-graph.js";
import { GraphError, metaGraphClient } from "../src/modules/meta/graph.js";
import { call, setup, type TestContext } from "./helpers.js";
import { alerts, businessWithTeam, connectMeta, fakeGraph, META_APP_ID, META_APP_SECRET, META_ENV, pageRows } from "./meta-helpers.js";

const fake = fakeGraph();
let t: TestContext;
beforeAll(async () => {
  t = await setup({ env: { ...META_ENV, BILLING_ENFORCED: "true" }, metaGraph: fake });
});
afterAll(async () => {
  await t.close();
});

const W1 = fakeIds(1);

/** Everything a response could leak a token through. */
function expectNoTokens(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toContain("fake-page-token");
  expect(json).not.toContain("fake-user-token");
  expect(json).not.toContain("fake-short-token");
  expect(json).not.toMatch(/"v1\.[\w-]+\./);
}

describe("who can connect Facebook", () => {
  it("is the owner only: managers and staff get 403 on every route", async () => {
    const b = await businessWithTeam(t, "961");
    const page = "00000000-0000-4000-8000-000000000001";
    for (const token of [b.manager.token, b.arfin.token]) {
      const tries = [
        await call(t.app, "GET", `/workspaces/${b.ws}/meta`, { token }),
        await call(t.app, "POST", `/workspaces/${b.ws}/meta/connect`, { token, body: {} }),
        await call(t.app, "POST", `/workspaces/${b.ws}/meta/complete`, { token, body: { code: "fake:one-page", state: "x.y" } }),
        await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${page}`, { token, body: { on: true } }),
        await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${page}/check`, { token }),
        await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${page}/test-lead`, { token, body: { formId: "1" } }),
        await call(t.app, "GET", `/workspaces/${b.ws}/meta/recent`, { token }),
        await call(t.app, "DELETE", `/workspaces/${b.ws}/meta`, { token }),
      ];
      for (const res of tries) {
        expect(res.status).toBe(403);
        expect(res.body.error.message).toBe("Only the owner connects Facebook");
      }
    }
    // Outsiders don't even learn the business exists.
    const stranger = await businessWithTeam(t, "962");
    expect((await call(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: stranger.owner })).status).toBe(404);
  });

  it("says when Facebook isn't set up on the server, or not switched on for the business", async () => {
    const b = await businessWithTeam(t, "963");
    const off = await buildApp({ config: loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL!, NODE_ENV: "test", LOG_LEVEL: "silent" }), db: t.db, logger: false, metaGraph: null });
    const res = await off.inject({ method: "GET", url: `/api/v1/workspaces/${b.ws}/meta`, headers: { authorization: `Bearer ${b.owner}` } });
    expect(res.json().data).toMatchObject({ available: false, reason: "not_configured", connections: [], pages: [] });
    const connect = await off.inject({ method: "POST", url: `/api/v1/workspaces/${b.ws}/meta/connect`, headers: { authorization: `Bearer ${b.owner}` }, payload: {} });
    expect(connect.statusCode).toBe(409);
    await off.close();

    const other = "11111111-1111-4111-8111-111111111111";
    const config = loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL!, NODE_ENV: "test", LOG_LEVEL: "silent", ...META_ENV, META_ENABLED_FOR: other });
    const later = await buildApp({ config, db: t.db, logger: false, metaGraph: fakeGraph() });
    const status = await later.inject({ method: "GET", url: `/api/v1/workspaces/${b.ws}/meta`, headers: { authorization: `Bearer ${b.owner}` } });
    expect(status.json().data).toMatchObject({ available: false, reason: "not_enabled", mode: "live" });
    await later.close();

    const on = await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner });
    expect(on.body.data).toMatchObject({ available: true, reason: null, mode: "live", connections: [], pages: [], problems: [] });
  });
});

describe("Continue with Facebook", () => {
  it("sends the owner to Facebook's dialog with everything it needs, and a single-use state", async () => {
    const b = await businessWithTeam(t, "964");
    const config = loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL!, NODE_ENV: "test", LOG_LEVEL: "silent", ...META_ENV, META_LOGIN_CONFIG_ID: "cfg-123" });
    const real = await buildApp({
      config,
      db: t.db,
      logger: false,
      metaGraph: metaGraphClient({ appId: META_APP_ID, appSecret: META_APP_SECRET, version: "v26.0", loginConfigId: "cfg-123" }),
    });
    const res = await real.inject({ method: "POST", url: `/api/v1/workspaces/${b.ws}/meta/connect`, headers: { authorization: `Bearer ${b.owner}` }, payload: {} });
    await real.close();
    const url = new URL(res.json().data.url);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: META_APP_ID,
      redirect_uri: "http://localhost:3000/connect/meta",
      response_type: "code",
      config_id: "cfg-123",
    });
    const state = url.searchParams.get("state")!;
    const nonce = JSON.parse(Buffer.from(state.split(".")[0]!, "base64url").toString()).n as string;
    const { rows } = await t.db.query<{ minutes: number; used_at: Date | null }>(
      `SELECT extract(epoch FROM expires_at - created_at) / 60 AS minutes, used_at FROM meta_oauth_states WHERE nonce = $1 AND workspace_id = $2`,
      [nonce, b.ws],
    );
    expect(Math.round(Number(rows[0]!.minutes))).toBe(15);
    expect(rows[0]!.used_at).toBeNull();
  });

  it("with one Page: switches it on, subscribed, its forms read, and tokens sealed and never shown", async () => {
    const b = await businessWithTeam(t, "965");
    const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:one-page");
    expect(done.status).toBe(200);
    expectNoTokens(done.body);
    const data = done.body.data;
    expect(data).toMatchObject({ available: true, added: 1, needsChoice: false });
    expect(data.connections).toEqual([
      expect.objectContaining({ fbUserName: "Asha Mehra", status: "ok", connectedByName: "Riya Owner", dataAccessExpiresAt: expect.any(String) }),
    ]);
    expect(data.pages).toHaveLength(1);
    const page = data.pages[0]!;
    expect(page).toMatchObject({ pageId: W1.pageIds[0], name: "Shubh Vivah Weddings", active: true, status: "ok", canAdvertise: true, canManage: true, problems: [] });
    expect(page.forms).toEqual([expect.objectContaining({ formId: W1.formIds[0], name: "Wedding enquiry", status: "ACTIVE" })]);
    // "How we read this form"
    const uses = Object.fromEntries(page.forms[0]!.questions.map((q) => [q.key, q.usedFor]));
    expect(uses).toMatchObject({ full_name: "name", phone_number: "phone", email: "email", city: "city", wedding_date: "eventDate", budget: "budget" });
    expect(fake.isSubscribed(W1.pageIds[0])).toBe(true);

    const rows = await pageRows(t, b.ws);
    expect(rows.get(W1.pageIds[0])!.page_token_enc).toMatch(/^v1\./);
    const conn = await t.db.query<{ user_token_enc: string; scopes: string[] }>(`SELECT user_token_enc, scopes FROM meta_connections WHERE workspace_id = $1`, [b.ws]);
    expect(conn.rows[0]!.user_token_enc).toMatch(/^v1\./);
    expect(conn.rows[0]!.scopes).toContain("leads_retrieval");
    const forms = await t.db.query<{ polled_through: Date | null }>(`SELECT polled_through FROM meta_forms WHERE workspace_id = $1`, [b.ws]);
    expect(forms.rows[0]!.polled_through).not.toBeNull();

    for (const res of [
      await call(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner }),
      await call(t.app, "GET", `/workspaces/${b.ws}/meta/recent`, { token: b.owner }),
      await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${page.id}`, { token: b.owner, body: { on: true } }),
    ]) {
      expect(res.status).toBe(200);
      expectNoTokens(res.body);
    }
    const log = await t.db.query<{ action: string; meta: Record<string, unknown> }>(
      `SELECT action, meta FROM activity_log WHERE workspace_id = $1 AND action LIKE 'meta.%' ORDER BY created_at`,
      [b.ws],
    );
    expect(log.rows.map((r) => r.action)).toEqual(["meta.connected", "meta.page_on"]);
    expect(log.rows[0]!.meta).toMatchObject({ fbUserName: "Asha Mehra" });
  });

  it("with several Pages: the owner picks; Pages switched on one by one", async () => {
    const b = await businessWithTeam(t, "966");
    const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:two-pages:2");
    expect(done.body.data).toMatchObject({ added: 2, needsChoice: true });
    expect(done.body.data.pages.map((p) => p.active)).toEqual([false, false]);
    const [first, second] = done.body.data.pages;
    expect((await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${first!.id}`, { token: b.owner, body: { on: true } })).body.data).toMatchObject({ active: true, status: "ok" });
    expect((await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${second!.id}`, { token: b.owner, body: { on: true } })).body.data).toMatchObject({ active: true });

    // Logging in again with only one of them ticked: the other can't be read any more.
    const again = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:one-page:2");
    expect(again.status).toBe(200);
    const byPage = new Map(again.body.data.pages.map((p) => [p.pageId, p]));
    expect(byPage.get(fakeIds(2).pageIds[0])!.status).toBe("ok");
    expect(byPage.get(fakeIds(2).pageIds[1])).toMatchObject({ active: true, status: "needs_reconnect" });
    expect(byPage.get(fakeIds(2).pageIds[1])!.problems[0]).toMatchObject({ kind: "needs_reconnect", metaSays: "Not ticked when Facebook was last connected" });
  });

  it("refuses a tampered, expired, reused or someone else's login, and answers a quick repeat the same", async () => {
    const b = await businessWithTeam(t, "967");
    const other = await businessWithTeam(t, "968");
    const started = await call<{ url: string }>(t.app, "POST", `/workspaces/${b.ws}/meta/connect`, { token: b.owner, body: {} });
    const state = new URL(started.body.data.url).searchParams.get("state")!;
    const [payload, sig] = state.split(".") as [string, string];
    const tampered = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), x: 9_999_999_999 })).toString("base64url")}.${sig}`;
    const complete = (ws: string, token: string, s: string) => call<MetaCompleteResult>(t.app, "POST", `/workspaces/${ws}/meta/complete`, { token, body: { code: "fake:one-page:3", state: s } });

    expect((await complete(b.ws, b.owner, tampered)).body.error.code).toBe("META_STATE_INVALID");
    expect((await complete(b.ws, b.owner, "junk")).body.error.code).toBe("META_STATE_INVALID");
    // Another business's owner with this login, on their own business.
    const wrong = await complete(other.ws, other.owner, state);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("META_WRONG_PERSON");

    const first = await complete(b.ws, b.owner, state);
    expect(first.status).toBe(200);
    const second = await complete(b.ws, b.owner, state);
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ added: first.body.data.added, needsChoice: first.body.data.needsChoice });
    expect(fake.calls.filter((c) => c.method === "exchangeCode" && c.args[0] === "fake:one-page:3")).toHaveLength(1);

    // Ten minutes later it's just used.
    await t.db.query(`UPDATE meta_oauth_states SET used_at = used_at - interval '11 minutes' WHERE workspace_id = $1`, [b.ws]);
    expect((await complete(b.ws, b.owner, state)).body.error.code).toBe("META_STATE_INVALID");

    // A state whose row has run out.
    const late = await call<{ url: string }>(t.app, "POST", `/workspaces/${b.ws}/meta/connect`, { token: b.owner, body: {} });
    await t.db.query(`UPDATE meta_oauth_states SET expires_at = now() - interval '1 minute' WHERE workspace_id = $1 AND used_at IS NULL`, [b.ws]);
    expect((await complete(b.ws, b.owner, new URL(late.body.data.url).searchParams.get("state")!)).body.error.code).toBe("META_STATE_INVALID");
  });

  it("says when permissions or Pages weren't given, and a repeat of a failed login fails the same", async () => {
    const b = await businessWithTeam(t, "969");
    const missing = await connectMeta(t.app, b.owner, b.ws, "fake:missing-leads-permission:4");
    expect(missing.status).toBe(422);
    expect(missing.body.error).toMatchObject({ code: "META_PERMISSIONS_MISSING", fields: { permissions: "leads_retrieval" } });
    const again = await call(t.app, "POST", `/workspaces/${b.ws}/meta/complete`, { token: b.owner, body: { code: "fake:missing-leads-permission:4", state: missing.state } });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe("META_PERMISSIONS_MISSING");

    const none = await connectMeta(t.app, b.owner, b.ws, "fake:no-pages:4");
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("META_NO_PAGES");
    expect((await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner })).body.data.connections).toEqual([]);
  });
});

describe("a login that fails after it was used", () => {
  it("is final: a repeat gets the same answer at once, and the owner starts again", async () => {
    const b = await businessWithTeam(t, "970");
    // Facebook didn't answer.
    fake.failNext("listPages", new GraphError("transient", "Meta is down"));
    const down = await connectMeta(t.app, b.owner, b.ws, "fake:one-page:20");
    expect(down.status).toBe(503);
    expect(down.body.error).toMatchObject({ code: "META_UNREACHABLE", message: expect.stringContaining("Continue with Facebook again") });
    const repeat = await call(t.app, "POST", `/workspaces/${b.ws}/meta/complete`, { token: b.owner, body: { code: "fake:one-page:20", state: down.state } });
    expect(repeat.status).toBe(503);
    expect(repeat.body.error.code).toBe("META_UNREACHABLE");

    // Something broke on our side: saved too, so a repeat doesn't wait and then say "still connecting".
    fake.failNext("listPages", new Error("boom") as GraphError);
    const broke = await connectMeta(t.app, b.owner, b.ws, "fake:one-page:20");
    expect(broke.status).toBe(500);
    expect(broke.body.error.code).toBe("META_CONNECT_FAILED");
    const started = Date.now();
    const again = await call(t.app, "POST", `/workspaces/${b.ws}/meta/complete`, { token: b.owner, body: { code: "fake:one-page:20", state: broke.state } });
    expect(again.status).toBe(500);
    expect(again.body.error.code).toBe("META_CONNECT_FAILED");
    expect(Date.now() - started).toBeLessThan(5_000);

    // Starting again works.
    const fresh = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:one-page:20");
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.pages[0]).toMatchObject({ active: true });
  });
});

describe("one Page, one business", () => {
  it("refuses a Page another business has on, unless the person has full control, who moves it here", async () => {
    const a = await businessWithTeam(t, "971");
    const b = await businessWithTeam(t, "972");
    const W5 = fakeIds(5);
    await connectMeta(t.app, a.owner, a.ws, "fake:one-page:5");
    expect((await pageRows(t, a.ws)).get(W5.pageIds[0])!.active).toBe(true);

    // B's person can make ads on the Page but doesn't have full control.
    fake.setTasks(W5.otherUserId, W5.pageIds[0], ["ADVERTISE", "ANALYZE"]);
    const joined = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:other-user:5");
    expect(joined.body.data).toMatchObject({ added: 1, needsChoice: false });
    const bPage = joined.body.data.pages[0]!;
    // B is told another business has it, never which one.
    expect(bPage).toMatchObject({ active: false, canAdvertise: true, canManage: false, inOtherBusiness: true });
    expect(JSON.stringify(joined.body.data)).not.toContain(a.ws);
    const refused = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${bPage.id}`, { token: b.owner, body: { on: true } });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: "PAGE_IN_OTHER_BUSINESS", fields: { canManage: "no" } });
    // Without full control, asking to move it is refused too.
    const notAllowed = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${bPage.id}`, { token: b.owner, body: { on: true, takeOver: true } });
    expect(notAllowed.status).toBe(409);
    expect(notAllowed.body.error).toMatchObject({ code: "PAGE_IN_OTHER_BUSINESS", fields: { canManage: "no" } });

    // With full control a plain "on" still doesn't move it: the owner is asked first.
    fake.setTasks(W5.otherUserId, W5.pageIds[0], ["ADVERTISE", "ANALYZE", "MANAGE"]);
    const ask = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${bPage.id}`, { token: b.owner, body: { on: true } });
    expect(ask.status).toBe(409);
    expect(ask.body.error).toMatchObject({ code: "PAGE_IN_OTHER_BUSINESS", fields: { canManage: "yes" } });
    expect((await pageRows(t, a.ws)).get(W5.pageIds[0])!.active).toBe(true);
    const asked = await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner });
    expect(asked.body.data.pages[0]).toMatchObject({ active: false, canManage: true, inOtherBusiness: true });

    // Moved when asked for, and A's owners hear about it.
    const moved = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${bPage.id}`, { token: b.owner, body: { on: true, takeOver: true } });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ active: true, status: "ok", inOtherBusiness: false });
    const aRow = (await pageRows(t, a.ws)).get(W5.pageIds[0])!;
    expect(aRow).toMatchObject({ active: false, status: "off", page_token_enc: null });
    const told = await alerts(t.app, a.ws, a.owner, "lead.source_problem");
    expect(told[0]).toMatchObject({ title: "Shubh Vivah Weddings 5 now sends leads to another business", link: "/app/settings/facebook-leads" });
    const aLog = await t.db.query<{ action: string; actor_user_id: string | null }>(`SELECT action, actor_user_id FROM activity_log WHERE workspace_id = $1 AND action = 'meta.page_taken_over'`, [a.ws]);
    expect(aLog.rows).toEqual([{ action: "meta.page_taken_over", actor_user_id: null }]);

    // A disconnecting now must not stop Meta sending the Page's leads to B.
    const unsubscribes = () => fake.calls.filter((c) => c.method === "unsubscribePage").length;
    const before = unsubscribes();
    expect((await call(t.app, "DELETE", `/workspaces/${a.ws}/meta`, { token: a.owner })).body.data).toEqual({ disconnected: true });
    expect(unsubscribes()).toBe(before);
    expect(fake.isSubscribed(W5.pageIds[0])).toBe(true);
    // B was the last one with it on: B disconnecting stops it.
    await call(t.app, "DELETE", `/workspaces/${b.ws}/meta`, { token: b.owner });
    expect(unsubscribes()).toBe(before + 1);
    expect(fake.isSubscribed(W5.pageIds[0])).toBe(false);
    const status = await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner });
    expect(status.body.data).toMatchObject({ connections: [], pages: [] });
    const left = await t.db.query(`SELECT 1 FROM meta_pages WHERE workspace_id = $1 AND page_token_enc IS NOT NULL`, [b.ws]);
    expect(left.rowCount).toBe(0);
  });

  it("needs access to make ads on a Page to switch it on", async () => {
    const b = await businessWithTeam(t, "973");
    const W6 = fakeIds(6);
    fake.setTasks(W6.userId, W6.pageIds[0], ["ANALYZE"]);
    const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:one-page:6");
    const page = done.body.data.pages[0]!;
    expect(page).toMatchObject({ active: false, canAdvertise: false });
    const res = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${page.id}`, { token: b.owner, body: { on: true } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PAGE_NO_ADVERTISE");
  });

  it("finds nothing of another business's by id", async () => {
    const a = await businessWithTeam(t, "974");
    const b = await businessWithTeam(t, "975");
    const done = await connectMeta<MetaCompleteResult>(t.app, a.owner, a.ws, "fake:one-page:7");
    const aPage = done.body.data.pages[0]!;
    for (const res of [
      await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${aPage.id}`, { token: b.owner, body: { on: false } }),
      await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${aPage.id}/check`, { token: b.owner }),
      await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${aPage.id}/test-lead`, { token: b.owner, body: { formId: fakeIds(7).formIds[0] } }),
      await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/not-an-id`, { token: b.owner, body: { on: true } }),
    ]) {
      expect(res.status).toBe(404);
    }
    expect((await pageRows(t, a.ws)).get(fakeIds(7).pageIds[0])!.active).toBe(true);
    // A form from another Page isn't this Page's.
    const wrongForm = await call(t.app, "POST", `/workspaces/${a.ws}/meta/pages/${aPage.id}/test-lead`, { token: a.owner, body: { formId: fakeIds(7).formIds[1] } });
    expect(wrongForm.status).toBe(404);
  });
});

describe("turning off and disconnecting", () => {
  it("brings in waiting leads first, stops Meta and wipes the token; leads stay", async () => {
    const b = await businessWithTeam(t, "976");
    const W8 = fakeIds(8);
    const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:one-page:8");
    const page = done.body.data.pages[0]!;
    const lead = fake.seedLead(W8.pageIds[0], W8.formIds[0]);
    await t.db.query(
      `INSERT INTO incoming_leads (workspace_id, external_id, meta_page_id, received_via, form_id) VALUES ($1, $2, $3, 'webhook', $4)`,
      [b.ws, lead.id, page.id, W8.formIds[0]],
    );
    const off = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${page.id}`, { token: b.owner, body: { on: false } });
    expect(off.body.data).toMatchObject({ active: false, status: "off" });
    const rows = await t.db.query<{ status: string; lead_id: string | null }>(`SELECT status, lead_id FROM incoming_leads WHERE workspace_id = $1`, [b.ws]);
    expect(rows.rows).toEqual([{ status: "added", lead_id: expect.any(String) }]);
    expect(fake.isSubscribed(W8.pageIds[0])).toBe(false);
    expect((await pageRows(t, b.ws)).get(W8.pageIds[0])!.page_token_enc).toBeNull();

    await call(t.app, "DELETE", `/workspaces/${b.ws}/meta`, { token: b.owner });
    const leads = await call<{ stages: { leadCount: number }[] }>(t.app, "GET", `/workspaces/${b.ws}/leads`, { token: b.owner });
    expect(leads.body.data.stages[0]!.leadCount).toBe(1);
    const log = await t.db.query<{ action: string }>(`SELECT action FROM activity_log WHERE workspace_id = $1 AND action LIKE 'meta.%' ORDER BY created_at`, [b.ws]);
    expect(log.rows.map((r) => r.action)).toEqual(["meta.connected", "meta.page_on", "meta.page_off", "meta.disconnected"]);
  });

  it("lets a business whose trial ran out turn leads off and disconnect, but not switch a Page on", async () => {
    const b = await businessWithTeam(t, "977");
    const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, "fake:two-pages:9");
    const [first, second] = done.body.data.pages;
    await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${first!.id}`, { token: b.owner, body: { on: true } });
    await t.db.query(`UPDATE workspaces SET trial_ends_at = now() - interval '1 day' WHERE id = $1`, [b.ws]);

    const on = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${second!.id}`, { token: b.owner, body: { on: true } });
    expect(on.status).toBe(402);
    const off = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${first!.id}`, { token: b.owner, body: { on: false } });
    expect(off.status).toBe(200);
    expect(off.body.data).toMatchObject({ active: false });
    const gone = await call(t.app, "DELETE", `/workspaces/${b.ws}/meta`, { token: b.owner });
    expect(gone.status).toBe(200);
    expect(gone.body.data).toEqual({ disconnected: true });
  });
});
