import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSchedule } from "../src/modules/notifications/scheduler.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Alert = { id: string; kind: string; title: string; body: string; link: string | null };
type Inbox = { items: Alert[]; unread: number };
type Match = {
  leads: { id: string | null; name: string; stageName: string | null; assignedToName: string | null; createdAt: string }[];
  clients: { id: string | null; name: string }[];
};

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

const LINES = [{ name: "Bridal HD makeup", unit: "event", quantity: 1, rate: 25000, taxRate: 18 }];

/** A business with an owner, two salespeople (in the Sales department), staff with no department, an accountant and a freelancer. */
async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const members = async () =>
    (await call<{ members: { id: string; userId: string; name: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const join = async (phone: string, name: string, role: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    const m = (await members()).find((x) => x.name === name)!;
    return { token, id: m.id, userId: m.userId };
  };
  const arfin = await join(`${prefix}0000002`, "Arfin Khan", "staff");
  const bina = await join(`${prefix}0000003`, "Bina Shah", "staff");
  const ravi = await join(`${prefix}0000004`, "Ravi Verma", "staff");
  const kavya = await join(`${prefix}0000005`, "Kavya Rao", "accountant");
  const fiza = await join(`${prefix}0000006`, "Fiza Freelance", "freelancer");
  for (const p of [arfin, bina]) {
    await call(t.app, "PUT", `/workspaces/${ws}/members/${p.id}/access`, { token: owner, body: { department: "sales" } });
  }
  const ownerId = (await members()).find((x) => x.name === "Riya Owner")!.userId;
  return { owner, ownerId, ws, arfin, bina, ravi, kavya, fiza };
}

const inbox = async (ws: string, token: string, kind?: string) => {
  const items = (await call<Inbox>(t.app, "GET", `/workspaces/${ws}/notifications`, { token })).body.data.items;
  return kind ? items.filter((a) => a.kind === kind) : items;
};
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

describe("new enquiry alerts", () => {
  it("the public form tells the owner once per enquiry, and a repeat once more", async () => {
    const { owner, ws } = await business("761");
    const { slug } = (await call<{ slug: string }>(t.app, "GET", `/workspaces/${ws}/lead-form`, { token: owner })).body.data;

    await call(t.app, "POST", `/public/forms/${slug}`, {
      body: { name: "Neha Sharma", phone: "9876512345", eventType: "wedding", eventDate: "2027-01-20", city: "Jaipur" },
    });
    let alerts = await inbox(ws, owner);
    expect(alerts).toHaveLength(1);
    const lead = (await call<{ leads: { id: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads[0]!;
    expect(alerts[0]).toMatchObject({ kind: "lead.new", title: "New enquiry: Neha Sharma", body: "Wedding · 20 Jan 2027 · Jaipur", link: `/app/leads/${lead.id}` });

    // The same-day follow-up the form sets doesn't buzz again a minute later.
    await runSchedule(t.db, inHours(0.02));
    expect(await inbox(ws, owner, "lead.follow_up")).toHaveLength(0);

    // The same number, typed differently, joins the open lead: one more alert, not two.
    await call(t.app, "POST", `/public/forms/${slug}`, { body: { name: "Neha S", phone: "+91 98765 12345", message: "Also the haldi" } });
    alerts = await inbox(ws, owner, "lead.new");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({ title: "Enquired again: Neha Sharma", body: "Also the haldi", link: `/app/leads/${lead.id}` });
    expect((await call<{ leads: unknown[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.leads).toHaveLength(1);

    // Switched off: nothing.
    await call(t.app, "PUT", `/workspaces/${ws}/notifications/prefs`, { token: owner, body: { off: ["sales"], push: true, quietFrom: null, quietTo: null } });
    await call(t.app, "POST", `/public/forms/${slug}`, { body: { name: "Pooja Jain", phone: "9876500011" } });
    expect(await inbox(ws, owner, "lead.new")).toHaveLength(2);
  });

  it("tells whoever a lead is given to, but not someone adding their own", async () => {
    const { owner, ws, arfin, bina } = await business("762");
    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Kapoor family", eventType: "sangeet", assignedToUserId: arfin.userId } });
    const mine = await inbox(ws, arfin.token, "lead.new");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: "New enquiry: Kapoor family", body: "Sangeet · from Riya" });
    expect(await inbox(ws, owner)).toHaveLength(0);

    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: bina.token, body: { name: "Mehra family" } });
    expect(await inbox(ws, bina.token)).toHaveLength(0);
    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Jain family" } });
    expect(await inbox(ws, owner)).toHaveLength(0);
  });
});

describe("quote answered alerts", () => {
  it("tells whoever made the quote and whoever has the lead, once", async () => {
    const { owner, ws, arfin } = await business("763");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Mehra family", assignedToUserId: arfin.userId },
    });
    const quote = await call<{ id: string; shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId: lead.body.data.id, title: "Wedding makeup", items: LINES, validUntil: "2099-01-01" },
    });
    const { id, shareToken } = quote.body.data;
    await call(t.app, "POST", `/public/quotes/${shareToken}/accept`, { body: { name: "Sunita Mehra" } });
    await call(t.app, "POST", `/public/quotes/${shareToken}/accept`, { body: { name: "Sunita Mehra" } });

    for (const token of [owner, arfin.token]) {
      const alerts = await inbox(ws, token, "quote.accepted");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ title: "Quote accepted by Mehra family", body: "Q-0001 · Wedding makeup", link: `/app/quotes/${id}` });
    }
  });

  it("tells the owner about a decline when nobody else is on it", async () => {
    const { owner, ws, arfin } = await business("764");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: arfin.token, body: { name: "Arjun Mehta" } });
    // Arfin's own lead and quote: the owner isn't told, Arfin is.
    const own = await call<{ shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: arfin.token,
      body: { leadId: lead.body.data.id, title: "Sangeet makeup", items: LINES },
    });
    await call(t.app, "POST", `/public/quotes/${own.body.data.shareToken}/decline`, { body: { reason: "Went with a cheaper option" } });
    expect(await inbox(ws, arfin.token, "quote.declined")).toMatchObject([
      { title: "Quote declined by Arjun Mehta", body: "Q-0001 · Sangeet makeup: Went with a cheaper option" },
    ]);
    expect(await inbox(ws, owner, "quote.declined")).toHaveLength(0);

    // Made by someone who has since left, for a client with no lead: the owner hears.
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Gupta family" } });
    const loose = await call<{ shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: arfin.token,
      body: { clientId: client.body.data.id, title: "Party makeup", items: LINES },
    });
    await call(t.app, "DELETE", `/workspaces/${ws}/members/${arfin.id}`, { token: owner });
    await call(t.app, "POST", `/public/quotes/${loose.body.data.shareToken}/decline`, { body: {} });
    await call(t.app, "POST", `/public/quotes/${loose.body.data.shareToken}/decline`, { body: {} });
    expect(await inbox(ws, owner, "quote.declined")).toMatchObject([{ title: "Quote declined by Gupta family", body: "Q-0002 · Party makeup" }]);
  });
});

describe("follow-up due", () => {
  it("alerts once when the time comes, and again after it's moved", async () => {
    const { owner, ws, arfin } = await business("765");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Kapoor family", assignedToUserId: arfin.userId, nextFollowUpAt: inHours(1).toISOString() },
    });
    const id = lead.body.data.id;
    const due = () => inbox(ws, arfin.token, "lead.follow_up");

    await runSchedule(t.db, inHours(0.5));
    expect(await due()).toHaveLength(0);
    await runSchedule(t.db, inHours(1.5));
    expect(await due()).toMatchObject([{ title: "Follow-up due: Kapoor family", body: "Time to get back to them", link: `/app/leads/${id}` }]);
    await runSchedule(t.db, inHours(1.6));
    await runSchedule(t.db, inHours(2));
    expect(await due()).toHaveLength(1);

    // Moved to later: alerts again at the new time, and only then.
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${id}`, { token: owner, body: { nextFollowUpAt: inHours(3).toISOString() } });
    await runSchedule(t.db, inHours(2.5));
    expect(await due()).toHaveLength(1);
    await runSchedule(t.db, inHours(3.5));
    await runSchedule(t.db, inHours(3.6));
    expect(await due()).toHaveLength(2);

    // Nobody on it: the owner. Booked or lost leads: nobody.
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${id}`, { token: owner, body: { assignedToUserId: null, nextFollowUpAt: inHours(4).toISOString() } });
    await runSchedule(t.db, inHours(4.5));
    expect(await inbox(ws, owner, "lead.follow_up")).toMatchObject([{ title: "Follow-up due: Kapoor family" }]);

    const stages = (await call<{ stages: { id: string; kind: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.stages;
    const other = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Lost family", assignedToUserId: arfin.userId, nextFollowUpAt: inHours(5).toISOString() },
    });
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${other.body.data.id}`, {
      token: owner,
      body: { stageId: stages.find((s) => s.kind === "lost")!.id, lostReason: "price" },
    });
    await runSchedule(t.db, inHours(6));
    expect(await due()).toHaveLength(2);
  });
});

describe("phone match", () => {
  it("finds a number however it's typed, and hides what the person can't open", async () => {
    const { owner, ws, arfin, bina, ravi, kavya, fiza } = await business("766");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: arfin.token,
      body: { name: "Neha Sharma", phone: "9811100011" },
    });
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Sharma family", phone: "9811100011" } });
    await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Someone Else", phone: "9811100099" } });
    const match = (token: string, phone: string) =>
      call<Match>(t.app, "GET", `/workspaces/${ws}/phone-match?phone=${encodeURIComponent(phone)}`, { token });

    for (const typed of ["+91 98111 00011", "098111-00011", "9811100011"]) {
      const r = await match(owner, typed);
      expect(r.status).toBe(200);
      expect(r.body.data.leads).toMatchObject([{ id: lead.body.data.id, name: "Neha Sharma", stageName: "New enquiry", assignedToName: "Arfin Khan" }]);
      expect(r.body.data.clients).toEqual([{ id: client.body.data.id, name: "Sharma family" }]);
    }

    // Arfin opens his own; Bina (also Sales) sees the name to ask about, with no id and no clients.
    expect((await match(arfin.token, "+919811100011")).body.data.leads[0]!.id).toBe(lead.body.data.id);
    const binas = await match(bina.token, "+91 98111 00011");
    expect(binas.body.data).toMatchObject({ leads: [{ id: null, name: "Neha Sharma", assignedToName: "Arfin Khan" }], clients: [] });
    expect((await match(ravi.token, "98111 00011")).body.data.leads[0]!.id).toBeNull();

    // View only: clients, and leads by name.
    const kavyas = await match(kavya.token, "9811100011");
    expect(kavyas.body.data).toMatchObject({ leads: [{ id: null }], clients: [{ id: client.body.data.id }] });

    expect((await match(fiza.token, "9811100011")).status).toBe(403);
    expect((await match(owner, "9811100022")).body.data).toEqual({ leads: [], clients: [] });
    expect((await match(owner, "12")).status).toBe(400);
  });
});
