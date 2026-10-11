import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTransaction } from "../src/db.js";
import { intakeLead, type IntakeFields, type IntakeInput } from "../src/modules/sales/intake.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Alert = { kind: string; title: string; body: string; link: string | null };
type Activity = { kind: string; body: string | null; meta: Record<string, unknown> };
type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  venue: string | null;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  budget: number | null;
  requirements: string | null;
  source: string;
  stageKind: string;
  followUpState: string;
  createdBy: { id: string } | null;
  assignedTo: { id: string } | null;
  activities: Activity[];
};

/** A business with an owner and two salespeople (staff have Leads). */
async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role: "staff" } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    const { rows } = await t.db.query<{ id: string }>(`SELECT id FROM users WHERE phone = $1`, [`+91${phone}`]);
    return { token, userId: rows[0]!.id };
  };
  const arfin = await join(`${prefix}0000002`, "Arfin Khan");
  const bina = await join(`${prefix}0000003`, "Bina Shah");
  return { owner, ws, arfin, bina };
}

const EMPTY: IntakeFields = {
  name: "Priya Sharma",
  phone: null,
  email: null,
  city: null,
  venue: null,
  eventType: null,
  eventDate: null,
  guestCount: null,
  budget: null,
  requirements: null,
};

/** One Facebook lead brought in, as the lead worker does it. */
function intake(ws: string, fields: Partial<IntakeFields>, over: Partial<IntakeInput> = {}, now = new Date()) {
  return withTransaction(t.db, (tx) =>
    intakeLead(
      tx,
      {
        workspaceId: ws,
        source: "facebook_ad",
        via: "meta",
        fields: { ...EMPTY, ...fields },
        repeatWindowDays: 30,
        fillBlanks: true,
        assignee: "routing",
        activityMeta: { platform: "fb", form: "Winter form" },
        alertDetail: "Facebook ad · Winter form",
        againNote: "Sent the Facebook form again",
        ...over,
      },
      now,
    ),
  );
}

const inbox = async (ws: string, token: string) =>
  (await call<{ items: Alert[] }>(t.app, "GET", `/workspaces/${ws}/notifications`, { token })).body.data.items.filter((a) => a.kind === "lead.new");
const getLead = async (ws: string, token: string, id: string) => (await call<Lead>(t.app, "GET", `/workspaces/${ws}/leads/${id}`, { token })).body.data;
const backdate = (id: string, days: number) => t.db.query(`UPDATE leads SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [id, days]);

describe("bringing in a lead from an ad", () => {
  it("makes a new lead that wants a reply today, given by routing, with its alert", async () => {
    const { owner, ws, arfin } = await business("771");
    const incomingId = randomUUID();
    const made = await intake(
      ws,
      { name: "Neha Gupta", phone: "+919876500001", eventType: "wedding", eventDate: "2026-12-14", city: "Jaipur", requirements: "Haldi: yes" },
      { incomingId, isTest: true },
    );
    expect(made).toMatchObject({ merged: false, assignedTo: arfin.userId });

    const lead = await getLead(ws, owner, made.leadId);
    expect(lead).toMatchObject({
      name: "Neha Gupta",
      phone: "+919876500001",
      source: "facebook_ad",
      city: "Jaipur",
      requirements: "Haldi: yes",
      stageKind: "open",
      followUpState: "today",
      createdBy: null,
      assignedTo: { id: arfin.userId },
    });
    expect(lead.activities.map((a) => a.kind)).toEqual(["follow_up_set", "created"]);
    expect(lead.activities[1]!.meta).toEqual({ source: "facebook_ad", via: "meta", platform: "fb", form: "Winter form", incomingId, test: true });
    const { rows } = await t.db.query<{ same: boolean }>(`SELECT next_follow_up_at = follow_up_alerted_for AS same FROM leads WHERE id = $1`, [made.leadId]);
    expect(rows[0]!.same).toBe(true);

    expect(await inbox(ws, arfin.token)).toEqual([
      expect.objectContaining({ title: "New enquiry: Neha Gupta", body: "Facebook ad · Winter form", link: `/app/leads/${made.leadId}` }),
    ]);
    expect(await inbox(ws, owner)).toHaveLength(0);
  });

  it("adds the same phone within 30 days to the open lead, and makes a new one after 31", async () => {
    const { ws } = await business("772");
    const first = await intake(ws, { phone: "+919876500002" });
    await backdate(first.leadId, 29);
    // Typed differently, the same number.
    const again = await intake(ws, { name: "Priya S", phone: "098765 00002" });
    expect(again).toMatchObject({ leadId: first.leadId, merged: true });

    await backdate(first.leadId, 31);
    const later = await intake(ws, { phone: "+919876500002" });
    expect(later.merged).toBe(false);
    expect(later.leadId).not.toBe(first.leadId);

    // A booked or lost enquiry is never reopened by a repeat.
    await t.db.query(
      `UPDATE leads SET stage_id = (SELECT id FROM pipeline_stages WHERE workspace_id = $1 AND kind = 'won' LIMIT 1) WHERE id = $2`,
      [ws, later.leadId],
    );
    const afterBooking = await intake(ws, { phone: "+919876500002" });
    expect(afterBooking.merged).toBe(false);
    expect(new Set([first.leadId, later.leadId, afterBooking.leadId]).size).toBe(3);
  });

  it("never merges leads without a full phone number", async () => {
    const { ws } = await business("773");
    const a = await intake(ws, { name: "No Phone One" });
    const b = await intake(ws, { name: "No Phone Two" });
    const c = await intake(ws, { name: "Short One", phone: "12345" });
    const d = await intake(ws, { name: "Short Two", phone: "12345" });
    for (const r of [a, b, c, d]) expect(r.merged).toBe(false);
    expect(new Set([a.leadId, b.leadId, c.leadId, d.leadId]).size).toBe(4);
  });

  it("a repeat fills what the lead didn't know and alerts whoever has it, once", async () => {
    const { owner, ws, arfin, bina } = await business("774");
    const first = await intake(ws, { name: "Kavita Rao", phone: "+919876500004", eventType: "wedding" });
    expect(first.assignedTo).toBe(arfin.userId);

    const incomingId = randomUUID();
    const again = await intake(
      ws,
      {
        name: "Kavita R",
        phone: "+91 98765 00004",
        email: "kavita@example.com",
        city: "Udaipur",
        venue: "Lake Palace lawns",
        eventType: "engagement",
        eventDate: "2027-02-10",
        guestCount: 300,
        budget: 500000,
        requirements: "Need mehendi too",
      },
      { incomingId, alertDetail: "Instagram ad · Spring form", againDetail: "Instagram ad · Spring form", activityMeta: { platform: "ig", form: "Spring form" } },
    );
    expect(again).toMatchObject({ leadId: first.leadId, merged: true, assignedTo: arfin.userId });

    const lead = await getLead(ws, owner, first.leadId);
    expect(lead).toMatchObject({
      name: "Kavita Rao",
      email: "kavita@example.com",
      city: "Udaipur",
      venue: "Lake Palace lawns",
      // Already known: kept.
      eventType: "wedding",
      eventDate: "2027-02-10",
      guestCount: 300,
      budget: 500000,
      requirements: null,
      source: "facebook_ad",
    });
    expect(lead.activities[0]).toMatchObject({
      kind: "note",
      body: "Sent the Facebook form again",
      meta: { via: "meta", platform: "ig", form: "Spring form", incomingId },
    });

    // Arfin hears twice (new, then again); Bina, who'd be next in turn, hears nothing.
    const alerts = await inbox(ws, arfin.token);
    expect(alerts.map((a) => a.title)).toEqual(["Enquired again: Kavita Rao", "New enquiry: Kavita Rao"]);
    expect(alerts[0]).toMatchObject({ body: "Instagram ad · Spring form", link: `/app/leads/${first.leadId}` });
    expect(await inbox(ws, bina.token)).toHaveLength(0);
  });

  it("the public enquiry form's repeat only adds a note: nothing on the lead changes", async () => {
    const { owner, ws } = await business("778");
    const { slug } = (await call<{ slug: string }>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner })).body.data;
    await call(t.app, "POST", `/public/forms/${slug}`, { body: { name: "Neha Sharma", phone: "9876512399" } });
    const before = (await call<{ leads: Lead[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads[0]!;
    // Anyone who knows the number could send this.
    await call(t.app, "POST", `/public/forms/${slug}`, {
      body: { name: "Someone", phone: "9876512399", city: "Elsewhere", eventType: "engagement", eventDate: "2027-03-01", message: "Changed plans" },
    });
    const lead = await getLead(ws, owner, before.id);
    expect(lead).toMatchObject({ name: "Neha Sharma", city: null, eventType: null, eventDate: null });
    expect(lead.activities[0]).toMatchObject({ kind: "note", body: "Changed plans\nEvent date: 2027-03-01", meta: { via: "enquiry_form" } });
  });

  it("a dedupe key stops a second alert for the same lead form", async () => {
    const { ws, arfin } = await business("775");
    const key = `lead:meta:${ws}:900001`;
    const made = await intake(ws, { phone: "+919876500005" }, { dedupeKey: key });
    expect(await inbox(ws, arfin.token)).toHaveLength(1);
    const again = await intake(ws, { phone: "+919876500005" }, { dedupeKey: key });
    expect(again).toMatchObject({ leadId: made.leadId, merged: true });
    expect(await inbox(ws, arfin.token)).toHaveLength(1);
  });

  it("the lead page shows the lead forms behind it, and Leads can be filtered by where they came from", async () => {
    const { owner, ws, arfin } = await business("777");
    const made = await intake(ws, { name: "Sana Ali", phone: "+919876500007" });
    const again = await intake(ws, { name: "Sana Ali", phone: "+919876500007" }, { source: "instagram_ad" });
    const typed = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Walk In", source: "walk_in" } });

    const page = await t.db.query<{ id: string }>(`INSERT INTO meta_pages (workspace_id, page_id, name) VALUES ($1, '5550001', 'Riya Bridal') RETURNING id`, [ws]);
    await t.db.query(
      `INSERT INTO meta_forms (workspace_id, meta_page_id, form_id, name, questions) VALUES ($1, $2, '7770001', 'Winter form', $3)`,
      [ws, page.rows[0]!.id, JSON.stringify([{ key: "wedding_city", label: "Which city is the wedding in?", type: "CUSTOM" }])],
    );
    const row = (externalId: string, status: string, platform: string | null, answers: unknown, receivedAt: string, campaign: string | null) =>
      t.db.query<{ id: string }>(
        `INSERT INTO incoming_leads (workspace_id, external_id, meta_page_id, received_via, status, platform, form_id, campaign_name, answers, lead_id, received_at, submitted_at)
         VALUES ($1, $2, $3, 'webhook', $4, $5, '7770001', $6, $7, $8, $9, $9) RETURNING id`,
        [ws, externalId, page.rows[0]!.id, status, platform, campaign, JSON.stringify(answers), made.leadId, receivedAt],
      );
    // As Meta sent it, read again with the form's labels; and as already read.
    const first = await row(
      "100001",
      "added",
      "fb",
      [
        { name: "full_name", values: ["Sana Ali"] },
        { name: "wedding_city", values: ["Lucknow"] },
      ],
      "2026-10-01T10:00:00Z",
      "Winter offer",
    );
    const second = await row("100002", "merged", "ig", [{ key: "budget", label: "Budget", value: "5 lakh", usedFor: "budget" }], "2026-10-02T10:00:00Z", null);
    // Not brought in (yet): not shown.
    await row("100003", "failed", "fb", [], "2026-10-03T10:00:00Z", null);

    const lead = (await call<{ adEnquiries: Record<string, unknown>[] }>(t.app, "GET", `/workspaces/${ws}/leads/${made.leadId}`, { token: arfin.token })).body.data;
    expect(lead.adEnquiries).toEqual([
      expect.objectContaining({
        id: second.rows[0]!.id,
        platform: "instagram",
        pageName: "Riya Bridal",
        formName: "Winter form",
        campaignName: null,
        merged: true,
        answers: [{ key: "budget", label: "Budget", value: "5 lakh", usedFor: "budget" }],
      }),
      expect.objectContaining({
        id: first.rows[0]!.id,
        platform: "facebook",
        campaignName: "Winter offer",
        isTest: false,
        receivedAt: "2026-10-01T10:00:00.000Z",
        submittedAt: "2026-10-01T10:00:00.000Z",
        merged: false,
        answers: [
          { key: "full_name", label: expect.any(String), value: "Sana Ali", usedFor: "name" },
          { key: "wedding_city", label: "Which city is the wedding in?", value: "Lucknow", usedFor: "city" },
        ],
      }),
    ]);
    expect(again.leadId).toBe(made.leadId);

    const list = async (source: string) =>
      (await call<{ leads: { id: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads?source=${source}`, { token: owner })).body.data.leads.map((l) => l.id);
    expect(await list("facebook_ad")).toEqual([made.leadId]);
    expect(await list("instagram_ad")).toEqual([]);
    expect(await list("walk_in")).toEqual([typed.body.data.id]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/leads?source=carrier_pigeon`, { token: owner })).status).toBe(400);
  });

  it("goes to a fixed person when asked, as the enquiry form does", async () => {
    const { owner, ws, bina } = await business("776");
    const made = await intake(ws, { phone: "+919876500006" }, { assignee: { userId: bina.userId }, source: "enquiry_form", via: "enquiry_form" });
    expect(made.assignedTo).toBe(bina.userId);
    expect(await inbox(ws, bina.token)).toHaveLength(1);
    expect(await inbox(ws, owner)).toHaveLength(0);
  });
});
