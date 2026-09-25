import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: `${role} Person`, phone, role },
    });
    const token = await signIn(t.app, phone);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  return { owner, ws, staff: await join(`${prefix}0000003`, "staff"), accountant: await join(`${prefix}0000004`, "accountant") };
}

/** YYYY-MM-DD, `days` from today in India. */
function day(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

type Portal = {
  business: { name: string; reviewUrl: string | null; formSlug: string | null; upiId?: string };
  client: { name: string; referralCode: string };
  events: { title: string; status: string; startDate: string | null; functions: { name: string; date: string }[] }[];
  quotes: { number: string; status: string; token: string }[];
  bills: { number: string; total: number; received: number; due: number; token: string }[];
  payments: { number: string; amount: number }[];
  totals: { billed: number; paid: number; due: number };
  eventOver: boolean;
};

describe("the client's own page", () => {
  it("shows a client their events, the quotes they were sent, their bills and payments, until the business stops sharing", async () => {
    const { owner, ws, staff, accountant } = await team("971");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Kavya Rao", phone: "9822200011", eventType: "wedding", eventDate: "2099-11-20" },
    });
    const items = [{ name: "Bridal HD makeup", unit: "event", quantity: 1, rate: 25000, taxRate: 0 }];
    const quote = await call<{ id: string; shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId: lead.body.data.id, title: "Wedding makeup", items },
    });
    await call(t.app, "POST", `/public/quotes/${quote.body.data.shareToken}/accept`, { body: { name: "Kavya Rao" } });
    const booked = await call<{ eventId: string; clientId: string }>(t.app, "GET", `/workspaces/${ws}/leads/${lead.body.data.id}`, {
      token: owner,
    });
    const { eventId, clientId } = booked.body.data;
    // A draft the client hasn't been sent stays private.
    await call(t.app, "POST", `/workspaces/${ws}/quotes`, { token: owner, body: { clientId, title: "Extra family makeup", items } });

    const draft = await call<{ billTo: unknown; issueDate: string; dueDate: string | null; items: unknown[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/bill-draft?eventId=${eventId}`,
      { token: owner },
    );
    const { billTo, issueDate, dueDate, items: lines } = draft.body.data;
    const bill = await call<{ id: string; number: string; total: number; shareToken: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId, quoteId: quote.body.data.id, billTo, issueDate, dueDate, items: lines },
    });
    expect(bill.status).toBe(201);
    await call(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { eventId, amount: 10000, paidOn: day(0), method: "upi" },
    });

    // Only the owner and managers share it: the page shows the client's bills.
    expect((await call(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: accountant })).status).toBe(403);
    const shared = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: owner });
    expect(shared.status).toBe(200);
    const token = shared.body.data.token;
    expect(token.length).toBeGreaterThanOrEqual(32);
    // Sharing again sends the same link, so the first message still works.
    const again = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: owner });
    expect(again.body.data.token).toBe(token);

    const asOwner = await call<{ portalToken: string | null }>(t.app, "GET", `/workspaces/${ws}/clients/${clientId}`, { token: owner });
    expect(asOwner.body.data.portalToken).toBe(token);
    const asAccountant = await call<{ portalToken: string | null }>(t.app, "GET", `/workspaces/${ws}/clients/${clientId}`, {
      token: accountant,
    });
    expect(asAccountant.body.data.portalToken).toBeNull();

    const page = await call<Portal>(t.app, "GET", `/public/clients/${token}`);
    expect(page.status).toBe(200);
    const p = page.body.data;
    expect(p.business).toMatchObject({ name: "971 Studio", reviewUrl: null });
    expect(p.business.formSlug).toBeTruthy();
    expect(p.client.name).toBe("Kavya Rao");
    expect(p.client.referralCode).toMatch(/^[a-z2-9]{10}$/);
    expect(p.events).toHaveLength(1);
    expect(p.events[0]).toMatchObject({ status: "confirmed", startDate: "2099-11-20" });
    expect(p.quotes).toEqual([expect.objectContaining({ number: "Q-0001", status: "accepted", token: quote.body.data.shareToken })]);
    expect(p.bills).toEqual([
      expect.objectContaining({ number: bill.body.data.number, total: 25000, received: 10000, due: 15000, token: bill.body.data.shareToken }),
    ]);
    expect(p.payments).toEqual([expect.objectContaining({ number: "R-0001", amount: 10000 })]);
    expect(p.totals).toEqual({ billed: 25000, paid: 10000, due: 15000 });
    expect(p.eventOver).toBe(false);
    // Nothing internal: no ids of the client, the event or the bill.
    const raw = JSON.stringify(p);
    for (const id of [clientId, eventId, bill.body.data.id, quote.body.data.id]) expect(raw).not.toContain(id);

    // Another business can't share this client.
    const other = await signIn(t.app, "9710000009");
    const otherWs = await createBusiness(t.app, other, "Other Studio");
    expect((await call(t.app, "POST", `/workspaces/${otherWs}/clients/${clientId}/portal`, { token: other })).status).toBe(404);

    // Stopping it: the old link dies at once, and sharing again makes a new one.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/clients/${clientId}/portal`, { token: owner })).body.data).toEqual({ stopped: true });
    expect((await call(t.app, "GET", `/public/clients/${token}`)).status).toBe(404);
    const renewed = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: owner });
    expect(renewed.body.data.token).not.toBe(token);
    // The "recommend us" code doesn't change: links friends already have keep working.
    const page2 = await call<Portal>(t.app, "GET", `/public/clients/${renewed.body.data.token}`);
    expect(page2.body.data.client.referralCode).toBe(p.client.referralCode);

    const log = await call<{ items: { action: string; subject: string | null; link: { kind: string; id: string | null } | null }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/activity`,
      { token: owner },
    );
    const actions = log.body.data.items.filter((i) => i.action.startsWith("client.")).map((i) => [i.action, i.subject, i.link?.kind]);
    expect(actions).toEqual([
      ["client.portal_shared", "Kavya Rao", "client"],
      ["client.portal_stopped", "Kavya Rao", "client"],
      ["client.portal_shared", "Kavya Rao", "client"],
    ]);
  });
});

describe("reviews", () => {
  it("asks once the event is over and the review link is set, and lists who is left to ask", async () => {
    const { owner, ws, staff } = await team("972");
    const event = async (title: string, name: string, phone: string, date: string) => {
      const res = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
        token: owner,
        body: { title, newClient: { name, phone }, functions: [{ name: "Wedding", date }] },
      });
      expect(res.status).toBe(201);
      return res.body.data.id;
    };
    const past = await event("Shah wedding", "Meera Shah", "9833300022", day(-1));
    const future = await event("Iyer wedding", "Anu Iyer", "9833300023", day(10));
    const ask = (id: string, token = owner) => call<{ reviewRequestedAt: string | null }>(t.app, "POST", `/workspaces/${ws}/events/${id}/review-request`, { token });

    expect((await ask(past)).body.error.code).toBe("NO_REVIEW_LINK");
    const bad = await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { reviewUrl: "g.page/r/abc/review" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields?.reviewUrl).toBeTruthy();
    const saved = await call<{ reviewUrl: string }>(t.app, "PATCH", `/workspaces/${ws}`, {
      token: owner,
      body: { reviewUrl: "https://g.page/r/abc123/review" },
    });
    expect(saved.body.data.reviewUrl).toBe("https://g.page/r/abc123/review");

    expect((await ask(future)).body.error.code).toBe("EVENT_NOT_OVER");
    expect((await ask(past, staff)).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/grow`, { token: staff })).status).toBe(403);

    type Grow = { reviewUrl: string | null; toAsk: { eventId: string; clientName: string; endDate: string }[]; askedRecently: number };
    const before = await call<Grow>(t.app, "GET", `/workspaces/${ws}/grow`, { token: owner });
    expect(before.body.data.reviewUrl).toBe("https://g.page/r/abc123/review");
    expect(before.body.data.toAsk).toEqual([{ eventId: past, title: "Shah wedding", clientName: "Meera Shah", clientPhone: "+919833300022", endDate: day(-1) }]);
    expect(before.body.data.askedRecently).toBe(0);

    const asked = await ask(past);
    expect(asked.status).toBe(200);
    expect(asked.body.data.reviewRequestedAt).toBeTruthy();
    const after = await call<Grow>(t.app, "GET", `/workspaces/${ws}/grow`, { token: owner });
    expect(after.body.data.toAsk).toEqual([]);
    expect(after.body.data.askedRecently).toBe(1);

    // Marked done early (the wedding was today): it can be asked about now.
    await call(t.app, "PATCH", `/workspaces/${ws}/events/${future}`, { token: owner, body: { status: "completed" } });
    expect((await ask(future)).status).toBe(200);

    const log = await call<{ items: { action: string; subject: string | null; other: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, {
      token: owner,
    });
    expect(log.body.data.items.find((i) => i.action === "event.review_requested" && i.subject === "Shah wedding")?.other).toBe("Meera Shah");
  });
});

describe("referrals", () => {
  it("credits the client whose link brought the enquiry, and counts what they send", async () => {
    const { owner, ws, staff } = await team("973");
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, {
      token: owner,
      body: { name: "Kavya Rao", phone: "9844400011" },
    });
    const clientId = client.body.data.id;
    const shared = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: owner });
    const page = await call<Portal>(t.app, "GET", `/public/clients/${shared.body.data.token}`);
    const { formSlug } = page.body.data.business;
    const code = page.body.data.client.referralCode;

    const form = await call<{ referrer: string | null }>(t.app, "GET", `/public/forms/${formSlug}?ref=${code}`);
    expect(form.body.data.referrer).toBe("Kavya");
    expect((await call<{ referrer: string | null }>(t.app, "GET", `/public/forms/${formSlug}?ref=nope`)).body.data.referrer).toBeNull();

    const sent = await call(t.app, "POST", `/public/forms/${formSlug}`, {
      body: { name: "Neha Gupta", phone: "9844400033", eventType: "wedding", ref: code },
    });
    expect(sent.status).toBe(201);
    type Lead = { id: string; name: string; source: string; referredBy: string | null; referredByClient: { id: string; name: string } | null };
    const list = await call<{ leads: Lead[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner });
    const neha = list.body.data.leads.find((l) => l.name === "Neha Gupta")!;
    expect(neha.source).toBe("referral");
    const full = await call<Lead>(t.app, "GET", `/workspaces/${ws}/leads/${neha.id}`, { token: owner });
    expect(full.body.data).toMatchObject({ referredBy: "Kavya Rao", referredByClient: { id: clientId, name: "Kavya Rao" } });

    // Added by hand, naming the client.
    const ritu = await call<Lead>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Ritu Jain", source: "referral", referredByClientId: clientId },
    });
    expect(ritu.status).toBe(201);
    expect(ritu.body.data.referredByClient).toEqual({ id: clientId, name: "Kavya Rao" });
    // Staff can't see clients, so they can't name one; and it must be this business's client.
    const byStaff = await call(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: staff,
      body: { name: "Asha", source: "referral", referredByClientId: clientId },
    });
    expect(byStaff.status).toBe(403);
    const other = await signIn(t.app, "9730000009");
    const otherWs = await createBusiness(t.app, other, "Other Studio");
    const theirs = await call<{ id: string }>(t.app, "POST", `/workspaces/${otherWs}/clients`, { token: other, body: { name: "Someone Else" } });
    const foreign = await call(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Asha", referredByClientId: theirs.body.data.id },
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.fields?.referredByClientId).toBeTruthy();

    const c = await call<{ referredLeads: { name: string }[] }>(t.app, "GET", `/workspaces/${ws}/clients/${clientId}`, { token: owner });
    expect(c.body.data.referredLeads.map((l) => l.name).sort()).toEqual(["Neha Gupta", "Ritu Jain"]);

    const grow = await call<{ referrals: { enquiries: number; booked: number; top: unknown[] } }>(t.app, "GET", `/workspaces/${ws}/grow`, {
      token: owner,
    });
    expect(grow.body.data.referrals).toEqual({
      enquiries: 2,
      booked: 0,
      top: [{ clientId, name: "Kavya Rao", enquiries: 2, booked: 0 }],
    });

    const log = await call<{ items: { action: string; actor: unknown; subject: string | null; other: string | null; detail: string | null }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/activity`,
      { token: owner },
    );
    const fromForm = log.body.data.items.find((i) => i.action === "lead.created" && i.subject === "Neha Gupta");
    expect(fromForm).toMatchObject({ actor: null, detail: "enquiry form", other: "Kavya Rao" });
  });
});
