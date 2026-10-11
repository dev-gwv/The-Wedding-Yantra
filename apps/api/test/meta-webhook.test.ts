import { randomUUID } from "node:crypto";
import type { IncomingLeadItem, Lead, MetaCompleteResult, MetaStatus } from "@wedding-yantra/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { fakeIds } from "../src/modules/meta/fake-graph.js";
import { GraphError, metaGraphClient } from "../src/modules/meta/graph.js";
import { MAX_TRIES } from "../src/modules/meta/worker.js";
import { call, setup, type TestContext } from "./helpers.js";
import {
  alerts,
  businessWithTeam,
  connectMeta,
  fakeGraph,
  incoming,
  leadgenBody,
  META_APP_ID,
  META_APP_SECRET,
  META_ENV,
  META_VERIFY_TOKEN,
  pageRows,
  postWebhook,
  signMeta,
} from "./meta-helpers.js";

const fake = fakeGraph();
let t: TestContext;
beforeAll(async () => {
  t = await setup({ env: META_ENV, metaGraph: fake });
});
afterAll(async () => {
  await t.close();
});

const drain = (now?: Date) => t.app.leadWorker.drain(now ? { now } : {});
const later = (ms: number) => new Date(Date.now() + ms);

/** A business connected with one Page (world n), switched on. */
async function connected(prefix: string, world: number) {
  const b = await businessWithTeam(t, prefix);
  const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, `fake:one-page:${world}`);
  expect(done.body.data.pages[0]!.active).toBe(true);
  return { ...b, ids: fakeIds(world), pageRowId: done.body.data.pages[0]!.id };
}

/** Gives someone open leads, so routing has a clear choice. */
async function busy(ws: string, owner: string, userId: string, n: number) {
  for (let i = 0; i < n; i++) {
    const res = await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: `Old lead ${i}` } });
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${res.body.data.id as string}`, { token: owner, body: { assignedToUserId: userId } });
  }
}

const getLead = async (ws: string, token: string, id: string) => (await call<Lead>(t.app, "GET", `/workspaces/${ws}/leads/${id}`, { token })).body.data;

describe("Meta checking the webhook address", () => {
  it("echoes the challenge for our verify token only", async () => {
    const ok = await t.app.inject({ method: "GET", url: `/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=${META_VERIFY_TOKEN}&hub.challenge=1158201444` });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/^text\/plain/);
    expect(ok.body).toBe("1158201444");
    const wrong = await t.app.inject({ method: "GET", url: "/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1" });
    expect(wrong.statusCode).toBe(403);
    const noMode = await t.app.inject({ method: "GET", url: `/api/v1/integrations/meta/webhook?hub.verify_token=${META_VERIFY_TOKEN}&hub.challenge=1` });
    expect(noMode.statusCode).toBe(403);
  });

  it("isn't there when Meta isn't set up", async () => {
    const off = await buildApp({ config: loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL!, NODE_ENV: "test", LOG_LEVEL: "silent" }), db: t.db, logger: false });
    const get = await off.inject({ method: "GET", url: `/api/v1/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1` });
    expect(get.statusCode).toBe(404);
    const body = leadgenBody([{ pageId: "1", leadgenId: "2" }]);
    const post = await off.inject({ method: "POST", url: "/api/v1/integrations/meta/webhook", headers: { "content-type": "application/json", "x-hub-signature-256": signMeta(body) }, payload: body });
    expect(post.statusCode).toBe(404);
    await off.close();
  });
});

describe("a lead from the webhook", () => {
  it("refuses a post that isn't signed with our app secret, before reading it", async () => {
    const b = await connected("981", 11);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    const body = leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id, formId: b.ids.formIds[0] }]);
    expect((await postWebhook(t.app, body, null)).statusCode).toBe(403);
    expect((await postWebhook(t.app, body, signMeta(body, "someone-else"))).statusCode).toBe(403);
    expect((await postWebhook(t.app, body, signMeta(`${body} `))).statusCode).toBe(403);
    // Not JSON at all, but signed: refused without a crash.
    expect((await postWebhook(t.app, "not json", signMeta("not json"))).statusCode).toBe(400);
    expect(await incoming(t, b.ws)).toEqual([]);
  });

  it("makes the lead as an Instagram ad, with its answers and campaign, for whoever has the fewest open leads", async () => {
    const b = await connected("982", 12);
    await busy(b.ws, b.owner, b.arfin.userId, 2);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], {
      platform: "ig",
      fieldData: [
        { name: "full_name", values: ["priya sharma"] },
        { name: "phone_number", values: ["+91 98765 43210"] },
        { name: "email", values: ["priya.sharma@example.com"] },
        { name: "city", values: ["Jaipur"] },
        { name: "wedding_date", values: ["14/12/2026"] },
        { name: "budget", values: ["5-10 lakh"] },
      ],
    });
    const body = leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id, formId: b.ids.formIds[0], adId: lead.adId }]);
    const res = await postWebhook(t.app, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ received: 1 });
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "queued", received_via: "webhook" });

    expect(await drain()).toMatchObject({ added: 1 });
    const row = (await incoming(t, b.ws))[0]!;
    expect(row).toMatchObject({ status: "added", created_lead: true, platform: "ig", campaign_name: "Winter weddings 2026", is_test: false });
    const made = await getLead(b.ws, b.owner, row.lead_id!);
    expect(made).toMatchObject({
      name: "Priya Sharma",
      phone: "+919876543210",
      email: "priya.sharma@example.com",
      city: "Jaipur",
      eventDate: "2026-12-14",
      eventType: "wedding",
      budget: 500000,
      source: "instagram_ad",
      assignedTo: { id: b.bina.userId },
    });
    expect(made.adEnquiries).toEqual([
      expect.objectContaining({
        platform: "instagram",
        pageName: "Shubh Vivah Weddings 12",
        formName: "Wedding enquiry",
        campaignName: "Winter weddings 2026",
        adsetName: "Jaipur 25-35",
        adName: "Wedding enquiries ad",
        merged: false,
      }),
    ]);
    expect(made.adEnquiries![0]!.answers.find((a) => a.key === "budget")).toMatchObject({ value: "5-10 lakh", usedFor: "budget" });
    expect(made.activities.find((a) => a.kind === "created")!.meta).toMatchObject({ source: "instagram_ad", via: "meta", platform: "ig", form: "Wedding enquiry" });

    const told = await alerts(t.app, b.ws, b.bina.token, "lead.new");
    expect(told).toHaveLength(1);
    expect(told[0]!.title).toContain("Priya Sharma");
    expect(told[0]!.body).toBe("Wedding · 14 Dec 2026 · Jaipur · Instagram ad · Wedding enquiry");
    expect(await alerts(t.app, b.ws, b.arfin.token, "lead.new")).toEqual([]);
    const page = (await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner })).body.data.pages[0]!;
    expect(page.lastWebhookAt).not.toBeNull();
    expect(page.lastLeadAt).not.toBeNull();
    expect(page.leadsThisWeek).toBe(1);

    // Meta sending it again: no second lead, no second alert.
    const again = await postWebhook(t.app, body);
    expect(again.json().data).toEqual({ received: 0 });
    await drain();
    expect(await incoming(t, b.ws)).toHaveLength(1);
    expect(await alerts(t.app, b.ws, b.bina.token, "lead.new")).toHaveLength(1);
  });

  it("sends each lead in a batch to the business that has its Page on; unknown Pages are fine", async () => {
    const a = await connected("983", 13);
    const b = await connected("984", 14);
    const la = fake.seedLead(a.ids.pageIds[0], a.ids.formIds[0]);
    const lb = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    const body = leadgenBody([
      { pageId: a.ids.pageIds[0], leadgenId: la.id, formId: a.ids.formIds[0] },
      { pageId: b.ids.pageIds[0], leadgenId: lb.id, formId: b.ids.formIds[0] },
      { pageId: "999999999", leadgenId: "888888888", formId: "1" },
    ]);
    const res = await postWebhook(t.app, body);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ received: 2 });
    await drain();
    expect((await incoming(t, a.ws)).map((r) => [r.external_id, r.status])).toEqual([[la.id, "added"]]);
    expect((await incoming(t, b.ws)).map((r) => [r.external_id, r.status])).toEqual([[lb.id, "added"]]);
    const unknown = await t.db.query(`SELECT 1 FROM incoming_leads WHERE external_id = '888888888'`);
    expect(unknown.rowCount).toBe(0);
  });

  it("adds the same phone within 30 days to the open lead (any form); after 31 days it's a new lead", async () => {
    const b = await connected("985", 15);
    const other = fake.addForm(b.ids.pageIds[0], { name: "Decor form" });
    const phone = [{ name: "full_name", values: ["Kavita Rao"] }, { name: "phone_number", values: ["9876511111"] }];
    const first = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: phone });
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: first.id }]));
    await drain();
    const second = fake.seedLead(b.ids.pageIds[0], other.id, { fieldData: [...phone, { name: "city", values: ["Udaipur"] }] });
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: second.id }]));
    await drain();
    const rows = await incoming(t, b.ws);
    expect(rows.map((r) => r.status)).toEqual(["added", "merged"]);
    expect(rows[1]!.lead_id).toBe(rows[0]!.lead_id);
    const lead = await getLead(b.ws, b.owner, rows[0]!.lead_id!);
    expect(lead.city).toBe("Udaipur");
    expect(lead.adEnquiries!.map((e) => [e.formName, e.merged])).toEqual([
      ["Decor form", true],
      ["Wedding enquiry", false],
    ]);
    const note = lead.activities.find((a) => a.kind === "note")!;
    expect(note.body).toBe("Sent the Facebook form again (Decor form)");
    expect(note.meta).toMatchObject({ via: "meta", form: "Decor form" });
    // The business's activity log names the ad and the form, not the enquiry form.
    type Feed = { items: { action: string; subject: string | null; other: string | null; detail: string | null }[] };
    const feed = (await call<Feed>(t.app, "GET", `/workspaces/${b.ws}/activity`, { token: b.owner })).body.data.items;
    expect(feed.find((i) => i.action === "lead.created" && i.subject === "Kavita Rao")).toMatchObject({ detail: "Facebook ad" });
    expect(feed.find((i) => i.action === "lead.note" && i.subject === "Kavita Rao")).toMatchObject({ other: "Facebook form", detail: null });
    expect(feed.find((i) => i.action === "meta.page_on")).toMatchObject({ subject: expect.stringContaining("Shubh Vivah Weddings") });
    expect(feed.find((i) => i.action === "meta.connected")!.detail).toBeTruthy();

    await t.db.query(`UPDATE leads SET created_at = now() - interval '31 days' WHERE id = $1`, [rows[0]!.lead_id]);
    const third = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: phone });
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: third.id }]));
    await drain();
    const after = await incoming(t, b.ws);
    expect(after[2]).toMatchObject({ status: "added", created_lead: true });
    expect(after[2]!.lead_id).not.toBe(rows[0]!.lead_id);
  });

  it("keeps two leads without a phone as two leads, and names one with no name", async () => {
    const b = await connected("986", 16);
    const noPhone = [{ name: "city", values: ["Jaipur"] }];
    const one = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: noPhone });
    const two = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: noPhone });
    await postWebhook(t.app, leadgenBody([one, two].map((l) => ({ pageId: b.ids.pageIds[0], leadgenId: l.id }))));
    await drain();
    const rows = await incoming(t, b.ws);
    expect(rows.map((r) => r.status)).toEqual(["added", "added"]);
    expect(rows[0]!.lead_id).not.toBe(rows[1]!.lead_id);
    expect((await getLead(b.ws, b.owner, rows[0]!.lead_id!)).name).toBe("Facebook lead");
  });

  it("labels Meta's test lead, which comes in even without a webhook", async () => {
    const b = await connected("987", 17);
    const res = await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}/test-lead`, { token: b.owner, body: { formId: b.ids.formIds[0] } });
    expect(res.body.data).toEqual({ queued: true });
    await drain();
    const recent = await call<IncomingLeadItem[]>(t.app, "GET", `/workspaces/${b.ws}/meta/recent`, { token: b.owner });
    expect(recent.body.data[0]).toMatchObject({ name: "Test lead", status: "added", receivedVia: "test", isTest: true, formName: "Wedding enquiry", pageName: "Shubh Vivah Weddings 17" });
    const lead = await getLead(b.ws, b.owner, recent.body.data[0]!.leadId!);
    expect(lead.adEnquiries![0]!.isTest).toBe(true);
    // It goes to the owner, not a salesperson: it isn't anyone's real work.
    expect(lead.assignedTo?.id).toBe(b.ownerId);
    expect(lead.activities.find((a) => a.kind === "created")!.meta).toMatchObject({ test: true });
    // A test lead isn't a lead from the ads.
    const page = (await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner })).body.data.pages[0]!;
    expect(page).toMatchObject({ lastLeadAt: null, leadsThisWeek: 0 });

    // Meta refusing a test lead: the steps for its testing tool instead.
    fake.failNext("createTestLead", new GraphError("other", "Meta: Delete the existing test lead first"));
    const manual = await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}/test-lead`, { token: b.owner, body: { formId: b.ids.formIds[0] } });
    expect(manual.body.data).toEqual({ manual: true, toolUrl: "https://developers.facebook.com/tools/lead-ads-testing" });
  });
});

describe("when Meta won't give the lead", () => {
  it("190: the Page needs a reconnect, the lead waits, and arrives after reconnecting", async () => {
    const b = await connected("988", 18);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    fake.failNext("getLead", new GraphError("token", "Meta: Error validating access token", { code: 190 }));
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id }]));
    expect(await drain()).toMatchObject({ parked: 1 });
    const row = (await incoming(t, b.ws))[0]!;
    expect(row).toMatchObject({ status: "queued", attempts: 0, error_kind: "token" });
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])!.status).toBe("needs_reconnect");
    const told = await alerts(t.app, b.ws, b.owner, "lead.source_problem");
    expect(told.map((a) => a.title)).toEqual(["Facebook leads stopped: log in again"]);
    // Nothing more is tried until the hour is up.
    expect(await drain()).toMatchObject({ parked: 0, added: 0 });

    await connectMeta(t.app, b.owner, b.ws, "fake:one-page:18");
    expect((await pageRows(t, b.ws)).get(b.ids.pageIds[0])!.status).toBe("ok");
    expect(await drain()).toMatchObject({ added: 1 });
  });

  it("100/33 from a Leads Access block: tried a few times, then parked as lead_access, never skipped", async () => {
    const b = await connected("989", 19);
    fake.setLeadAccess(b.ids.pageIds[0], { canAccess: false, failureReason: "The CRM isn't assigned" });
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id }]));
    let at = Date.now();
    for (let i = 0; i < 4; i++) {
      expect(await drain(new Date(at))).toMatchObject({ retried: 1 });
      at += 24 * 3_600_000;
    }
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "queued", attempts: 4, error_kind: "not_found" });
    expect(await drain(new Date(at))).toMatchObject({ parked: 1 });
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "queued", attempts: 4, error_kind: "lead_access" });
    const status = (await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner })).body.data;
    expect(status.pages[0]!.problems[0]).toMatchObject({ kind: "lead_access", metaSays: "The CRM isn't assigned" });
    expect(status.pages[0]!.problems[0]!.steps.join(" ")).toContain("Leads access");

    // Fixed on Facebook: "Check again" brings it in.
    fake.setLeadAccess(b.ids.pageIds[0], { canAccess: true });
    const checked = await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}/check`, { token: b.owner });
    expect(checked.body.data).toMatchObject({ status: "ok", recovered: 1, problems: [] });
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "added" });
    // Once a minute.
    expect((await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}/check`, { token: b.owner })).status).toBe(429);
  });

  it("retries a hiccup on the ladder, and after 12 tries shows it as not brought in", async () => {
    const b = await connected("990", 20);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    fake.failNext("getLead", new GraphError("transient", "Meta answered 500"));
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id }]));
    expect(await drain()).toMatchObject({ retried: 1 });
    const row = (await incoming(t, b.ws))[0]!;
    expect(row).toMatchObject({ attempts: 1, error_kind: "transient" });
    expect(Math.round((row.next_attempt_at.getTime() - Date.now()) / 1000)).toBeGreaterThan(25);
    expect(await drain()).toMatchObject({ retried: 0, added: 0 });
    expect(await drain(later(31_000))).toMatchObject({ added: 1 });

    const stuck = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    fake.failAlways("getLead", new GraphError("transient", "Meta answered 500"));
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: stuck.id }]));
    let at = Date.now();
    for (let i = 0; i < MAX_TRIES; i++) {
      await drain(new Date(at));
      at += 25 * 3_600_000;
    }
    fake.failAlways("getLead", null);
    const failed = (await incoming(t, b.ws))[1]!;
    expect(failed).toMatchObject({ status: "failed", attempts: 12, last_error: "Meta answered 500" });
    const page = (await call<MetaStatus>(t.app, "GET", `/workspaces/${b.ws}/meta`, { token: b.owner })).body.data.pages[0]!;
    expect(page.problems).toEqual([expect.objectContaining({ kind: "failed_leads", title: "Couldn't bring in 1 lead from “Shubh Vivah Weddings 20”" })]);
    expect((await alerts(t.app, b.ws, b.owner, "lead.source_problem")).map((a) => a.title)).toEqual(["Couldn't bring in 1 Facebook lead"]);
    // "Try again" gives it a fresh set of tries.
    await call(t.app, "POST", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}/check`, { token: b.owner });
    expect((await incoming(t, b.ws))[1]).toMatchObject({ status: "added" });
  });

  it("a rate limit leaves the Page alone for the time Meta asks", async () => {
    const b = await connected("991", 21);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    fake.failNext("getLead", new GraphError("rate_limit", "Meta: (#4) Application request limit reached", { code: 4, retryAfterMs: 10 * 60_000 }));
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id }]));
    await drain();
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "queued", attempts: 0, error_kind: "rate_limit" });
    expect(await drain(later(5 * 60_000))).toMatchObject({ added: 0 });
    expect(await drain(later(11 * 60_000))).toMatchObject({ added: 1 });
  });
});

describe("one lead, one enquiry", () => {
  it("processes a lead once, however many workers race for it", async () => {
    const b = await connected("992", 22);
    const leads = [0, 1, 2].map((i) => fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: [{ name: "full_name", values: [`Guest ${i}`] }] }));
    await postWebhook(t.app, leadgenBody(leads.map((l) => ({ pageId: b.ids.pageIds[0], leadgenId: l.id }))));
    const results = await Promise.all([drain(), drain(), drain()]);
    expect(results.reduce((n, r) => n + r.added, 0)).toBe(3);
    const made = await t.db.query(`SELECT 1 FROM leads WHERE workspace_id = $1 AND deleted_at IS NULL`, [b.ws]);
    expect(made.rowCount).toBe(3);

    // The same row handed to two workers (a lock that ran out): only the one holding it counts.
    const one = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: one.id }]));
    const claim = randomUUID();
    const { rows } = await t.db.query<{ id: string }>(
      `UPDATE incoming_leads SET claim_token = $2, locked_until = now() + interval '2 minutes' WHERE workspace_id = $1 AND status = 'queued' RETURNING id`,
      [b.ws, claim],
    );
    const now = new Date();
    expect(await t.app.leadWorker.process(rows[0]!.id, randomUUID(), now)).toEqual({ outcome: "lost" });
    const both = await Promise.all([t.app.leadWorker.process(rows[0]!.id, claim, now), t.app.leadWorker.process(rows[0]!.id, claim, now)]);
    expect(both.map((r) => r.outcome).sort()).toEqual(["added", "lost"]);
    expect((await t.db.query(`SELECT 1 FROM leads WHERE workspace_id = $1`, [b.ws])).rowCount).toBe(4);
  });
});

describe("the pretend Facebook", () => {
  it("has dev routes with META_FAKE only, for the business's owner", async () => {
    expect((await call(t.app, "POST", "/integrations/meta/dev/leads", { body: {} })).status).toBe(404);

    const config = loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL!, NODE_ENV: "test", LOG_LEVEL: "silent", META_FAKE: "true" });
    const local = await buildApp({ config, db: t.db, logger: false });
    const b = await businessWithTeam(t, "994");
    const dev = (path: string, body: unknown, token?: string) =>
      local.inject({ method: "POST", url: `/api/v1/integrations/meta/dev/${path}`, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: body as object });
    expect((await dev("leads", { workspaceId: b.ws })).statusCode).toBe(401);
    expect((await dev("leads", { workspaceId: b.ws }, b.arfin.token)).statusCode).toBe(403);
    expect((await dev("leads", { workspaceId: b.ws }, b.owner)).statusCode).toBe(404);

    // The pretend dialog comes straight back with a code; Page 1 of world 1 is switched on.
    const started = await local.inject({ method: "POST", url: `/api/v1/workspaces/${b.ws}/meta/connect`, headers: { authorization: `Bearer ${b.owner}` }, payload: {} });
    const url = new URL(started.json().data.url as string);
    expect(url.origin + url.pathname).toBe("http://localhost:3000/connect/meta");
    const done = await local.inject({
      method: "POST",
      url: `/api/v1/workspaces/${b.ws}/meta/complete`,
      headers: { authorization: `Bearer ${b.owner}` },
      payload: { code: "fake:one-page", state: url.searchParams.get("state") },
    });
    expect(done.json().data).toMatchObject({ mode: "fake", added: 1, pages: [expect.objectContaining({ active: true })] });

    const seeded = await dev("leads", { workspaceId: b.ws, name: "Dev Lead", phone: "9876522222", platform: "ig" }, b.owner);
    const { pageId, formId, leads } = seeded.json().data as { pageId: string; formId: string; leads: { leadgenId: string }[] };
    expect(pageId).toBe(fakeIds(1).pageIds[0]);
    const raw = leadgenBody([{ pageId, formId, leadgenId: leads[0]!.leadgenId }]);
    const hook = await local.inject({
      method: "POST",
      url: "/api/v1/integrations/meta/webhook",
      headers: { "content-type": "application/json", "x-hub-signature-256": signMeta(raw, "fake-app-secret") },
      payload: raw,
    });
    expect(hook.json().data).toEqual({ received: 1 });
    await local.leadWorker.drain();
    expect((await incoming(t, b.ws))[0]).toMatchObject({ status: "added", platform: "ig" });

    expect((await dev("fail", { workspaceId: b.ws, kind: "lead_access" }, b.owner)).statusCode).toBe(200);
    const status = await local.inject({ method: "GET", url: `/api/v1/workspaces/${b.ws}/meta`, headers: { authorization: `Bearer ${b.owner}` } });
    expect(status.json().data.pages[0]).toMatchObject({ status: "lead_access" });
    await local.close();
  });

  it("checks appsecret_proof like Meta does", async () => {
    const b = await connected("993", 23);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    const token = `fake-page-token-${b.ids.pageIds[0]}`;
    const right = metaGraphClient({ appId: META_APP_ID, appSecret: META_APP_SECRET, version: "v26.0", loginConfigId: null }, fake.fetch);
    expect((await right.getLead(lead.id, token)).id).toBe(lead.id);
    const wrong = metaGraphClient({ appId: META_APP_ID, appSecret: "not-our-secret", version: "v26.0", loginConfigId: null }, fake.fetch);
    await expect(wrong.getLead(lead.id, token)).rejects.toThrow(/appsecret_proof/);
  });
});
