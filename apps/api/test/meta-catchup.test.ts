import type { MetaCompleteResult } from "@wedding-yantra/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeIds } from "../src/modules/meta/fake-graph.js";
import { GraphError } from "../src/modules/meta/graph.js";
import { runSchedule } from "../src/modules/notifications/scheduler.js";
import { MAX_READS_PER_FORM } from "../src/modules/meta/poller.js";
import { call, setup, type TestContext } from "./helpers.js";
import { alerts, businessWithTeam, connectMeta, fakeGraph, incoming, leadgenBody, META_ENV, postWebhook } from "./meta-helpers.js";

// Two leads per result page, so the read cap is reached with a handful of leads.
const PAGE_SIZE = 2;
const fake = fakeGraph({ pageSize: PAGE_SIZE });
let t: TestContext;
beforeAll(async () => {
  t = await setup({ env: META_ENV, metaGraph: fake });
});
afterAll(async () => {
  await t.close();
});

/** Past the next catch-up (every 30 minutes, give or take a tenth). */
const pollTime = (extraMinutes = 0) => new Date(Date.now() + (40 + extraMinutes) * 60_000);

async function connected(prefix: string, world: number) {
  const b = await businessWithTeam(t, prefix);
  const done = await connectMeta<MetaCompleteResult>(t.app, b.owner, b.ws, `fake:one-page:${world}`);
  expect(done.body.data.pages[0]!.active).toBe(true);
  return { ...b, ids: fakeIds(world), pageRowId: done.body.data.pages[0]!.id };
}

async function forms(ws: string) {
  const { rows } = await t.db.query<{ form_id: string; name: string; polled_through: Date | null; leads_count: number }>(
    `SELECT form_id, name, polled_through, leads_count FROM meta_forms WHERE workspace_id = $1 ORDER BY form_id`,
    [ws],
  );
  return new Map(rows.map((r) => [r.form_id, r]));
}

describe("the catch-up", () => {
  it("brings in a lead only Meta has, and the webhook arriving later changes nothing", async () => {
    const b = await connected("931", 31);
    const lead = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await t.app.leadWorker.tick(pollTime());
    const rows = await incoming(t, b.ws);
    expect(rows).toEqual([expect.objectContaining({ external_id: lead.id, received_via: "catch_up", status: "added", campaign_name: "Winter weddings 2026" })]);
    // One lead: its own "New enquiry" alert to whoever got it.
    const lateLead = await t.db.query<{ assigned_to: string }>(`SELECT assigned_to FROM leads WHERE id = $1`, [rows[0]!.lead_id]);
    const who = lateLead.rows[0]!.assigned_to === b.arfin.userId ? b.arfin : b.bina;
    expect(await alerts(t.app, b.ws, who.token, "lead.new")).toHaveLength(1);

    const res = await postWebhook(t.app, leadgenBody([{ pageId: b.ids.pageIds[0], leadgenId: lead.id }]));
    expect(res.json().data).toEqual({ received: 0 });
    await t.app.leadWorker.drain();
    expect(await incoming(t, b.ws)).toHaveLength(1);
    expect((await t.db.query(`SELECT 1 FROM leads WHERE workspace_id = $1`, [b.ws])).rowCount).toBe(1);
  });

  it("finds a new form through the Page's form list and reads it", async () => {
    const b = await connected("932", 32);
    const form = fake.addForm(b.ids.pageIds[0], { name: "Mehendi offer" });
    const lead = fake.seedLead(b.ids.pageIds[0], form.id);
    await t.app.leadWorker.tick(pollTime());
    expect((await forms(b.ws)).get(form.id)).toMatchObject({ name: "Mehendi offer", leads_count: 1 });
    expect(await incoming(t, b.ws)).toEqual([expect.objectContaining({ external_id: lead.id, status: "added" })]);
  });

  it("doesn't move the clock when it hits the read cap: it carries on next time", async () => {
    const b = await connected("933", 33);
    const before = (await forms(b.ws)).get(b.ids.formIds[0])!.polled_through!;
    const total = MAX_READS_PER_FORM * PAGE_SIZE + 2;
    for (let i = 0; i < total; i++) fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: [{ name: "full_name", values: [`Guest ${i}`] }] });
    const now = pollTime();
    await t.app.leadWorker.tick(now);
    expect(await incoming(t, b.ws)).toHaveLength(MAX_READS_PER_FORM * PAGE_SIZE);
    const capped = (await forms(b.ws)).get(b.ids.formIds[0])!;
    expect(capped.polled_through).toEqual(before);
    const { rows } = await t.db.query<{ next_poll_at: Date }>(`SELECT next_poll_at FROM meta_pages WHERE id = $1 AND workspace_id = $2`, [b.pageRowId, b.ws]);
    expect(rows[0]!.next_poll_at.getTime()).toBe(now.getTime());

    const next = new Date(now.getTime() + 60_000);
    await t.app.leadWorker.tick(next);
    expect(await incoming(t, b.ws)).toHaveLength(total);
    const done = (await forms(b.ws)).get(b.ids.formIds[0])!;
    // The clock moves to when this read began.
    expect(done.polled_through).toEqual(now);
    expect(done.leads_count).toBe(total);
  });

  it("brings in nothing from while the Page was off", async () => {
    const b = await connected("934", 34);
    await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}`, { token: b.owner, body: { on: false } });
    const whileOff = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { createdTime: new Date(Date.now() - 5_000).toISOString() });
    const on = await call(t.app, "PATCH", `/workspaces/${b.ws}/meta/pages/${b.pageRowId}`, { token: b.owner, body: { on: true } });
    expect(on.body.data).toMatchObject({ active: true });
    await t.app.leadWorker.tick(pollTime());
    // A full sweep of every form doesn't bring it in either.
    await t.db.query(`UPDATE meta_pages SET swept_at = NULL, next_poll_at = now() WHERE id = $1 AND workspace_id = $2`, [b.pageRowId, b.ws]);
    await t.app.leadWorker.tick(pollTime());
    expect(await incoming(t, b.ws)).toEqual([]);

    const afterOn = fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await t.app.leadWorker.tick(pollTime(40));
    expect((await incoming(t, b.ws)).map((r) => r.external_id)).toEqual([afterOn.id]);
    expect(whileOff.id).not.toBe(afterOn.id);
  });

  it("sends one summary instead of an alert for each when it brings in more than 3", async () => {
    const b = await connected("935", 35);
    const now = pollTime();
    for (let i = 0; i < 5; i++) fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0], { fieldData: [{ name: "full_name", values: [`Late guest ${i}`] }] });
    await t.app.leadWorker.tick(now);
    expect((await incoming(t, b.ws)).map((r) => r.status)).toEqual(["added", "added", "added", "added", "added"]);
    const owner = await alerts(t.app, b.ws, b.owner, "lead.source_problem");
    expect(owner.filter((a) => a.title.includes("brought in late"))).toEqual([
      expect.objectContaining({ title: "5 Facebook leads brought in late", body: expect.stringContaining("Shubh Vivah Weddings 35") }),
    ]);
    // Each person who got some hears once, with a link they can open (not the owner's settings).
    const got = await t.db.query<{ assigned_to: string; n: number }>(
      `SELECT assigned_to, count(*)::int AS n FROM leads WHERE workspace_id = $1 GROUP BY assigned_to`,
      [b.ws],
    );
    const people = new Map([b.arfin, b.bina, b.manager].map((p) => [p.userId, p]));
    expect(got.rows.reduce((sum, r) => sum + r.n, 0)).toBe(5);
    for (const r of got.rows) {
      const person = people.get(r.assigned_to)!;
      const told = await alerts(t.app, b.ws, person.token, "lead.new");
      expect(told).toEqual([
        r.n === 1
          ? expect.objectContaining({ title: expect.stringMatching(/^New enquiry: Late guest \d$/), link: expect.stringMatching(/^\/app\/leads\/[\w-]+$/) })
          : expect.objectContaining({ title: `${r.n} new enquiries`, link: "/app/leads?source=facebook_ad" }),
      ]);
      expect(told[0]!.body).toBe(`From Shubh Vivah Weddings 35. Facebook sent ${r.n === 1 ? "it" : "them"} late.`);
      expect(await alerts(t.app, b.ws, person.token, "lead.source_problem")).toEqual([]);
    }
    // That counts as their first follow-up alert, as a lead's own "New enquiry" does.
    await runSchedule(t.db, new Date(now.getTime() + 60_000));
    for (const person of people.values()) expect(await alerts(t.app, b.ws, person.token, "lead.follow_up")).toEqual([]);
  });

  it("keeps reading the other forms when one form keeps failing", async () => {
    const b = await connected("937", 37);
    const broken = fake.addForm(b.ids.pageIds[0], { name: "Broken form" });
    const good = fake.addForm(b.ids.pageIds[0], { name: "Good form" });
    // Seen once with no leads, so both forms are read when their counts go up.
    await t.app.leadWorker.tick(pollTime());
    fake.seedLead(b.ids.pageIds[0], broken.id);
    const lead = fake.seedLead(b.ids.pageIds[0], good.id);
    const realFormLeads = fake.formLeads.bind(fake);
    fake.formLeads = async (formId, token, since, after) => {
      if (formId === broken.id) throw new GraphError("other", "Meta: (#100) Please reduce the amount of data");
      return realFormLeads(formId, token, since, after);
    };
    try {
      await t.app.leadWorker.tick(pollTime(40));
      await t.app.leadWorker.tick(pollTime(80));
    } finally {
      fake.formLeads = realFormLeads;
    }
    expect((await incoming(t, b.ws)).map((r) => r.external_id)).toEqual([lead.id]);
    // The Page itself is fine.
    const { rows } = await t.db.query<{ status: string }>(`SELECT status FROM meta_pages WHERE id = $1 AND workspace_id = $2`, [b.pageRowId, b.ws]);
    expect(rows[0]!.status).toBe("ok");
  });

  it("asks Meta to send the Page's leads again after it missed two in a day, and says so once", async () => {
    const b = await connected("936", 36);
    await fake.unsubscribePage(b.ids.pageIds[0], `fake-page-token-${b.ids.pageIds[0]}`);
    expect(fake.isSubscribed(b.ids.pageIds[0])).toBe(false);
    fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await t.app.leadWorker.tick(pollTime());
    expect(fake.isSubscribed(b.ids.pageIds[0])).toBe(true);
    fake.seedLead(b.ids.pageIds[0], b.ids.formIds[0]);
    await t.app.leadWorker.tick(pollTime(40));
    expect(await incoming(t, b.ws)).toHaveLength(3);
    const said = (await alerts(t.app, b.ws, b.owner, "lead.source_problem")).filter((a) => a.title.startsWith("Facebook was slow"));
    expect(said).toHaveLength(1);
  });
});
