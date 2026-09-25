import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Item = { id: string; name: string; unit: string; price: number; taxRate: number; active: boolean };
type Quote = {
  id: string;
  number: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  shareToken: string;
  terms: string | null;
  eventId: string | null;
  clientId: string | null;
  items: { amount: number }[];
};
type Event = {
  id: string;
  title: string;
  status: string;
  value: number | null;
  leadId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  clientId: string | null;
  clientName: string | null;
  functions: { name: string; date: string; startTime: string | null }[];
  clashes: { date: string; eventTitle: string }[];
};

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
  return {
    owner,
    ws,
    staff: await join(`${prefix}0000002`, "staff"),
    accountant: await join(`${prefix}0000003`, "accountant"),
    freelancer: await join(`${prefix}0000004`, "freelancer"),
  };
}

const LINES = [
  { name: "Bridal HD makeup", unit: "event", quantity: 1, rate: 25000, taxRate: 18 },
  { name: "Family makeup", unit: "person", quantity: 4, rate: 3500, taxRate: 18 },
  { name: "Draping", unit: "person", quantity: 2, rate: 999.99, taxRate: 0 },
];

describe("price list", () => {
  it("starts with the trade's services and lets owners, not staff, change it", async () => {
    const { owner, staff, ws } = await team("971");
    const list = await call<Item[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: staff });
    expect(list.body.data.map((i) => i.name)).toContain("Bridal HD makeup");

    const bad = await call(t.app, "POST", `/workspaces/${ws}/catalogue`, {
      token: owner,
      body: { name: "Mehendi add-on", unit: "person", price: 500, taxRate: 7 },
    });
    expect(bad.status).toBe(400);
    const made = await call<Item>(t.app, "POST", `/workspaces/${ws}/catalogue`, {
      token: owner,
      body: { name: "Mehendi add-on", unit: "person", price: "500", taxRate: 18 },
    });
    expect(made.body.data).toMatchObject({ price: 500, taxRate: 18, active: true });
    expect(
      (await call(t.app, "POST", `/workspaces/${ws}/catalogue`, { token: staff, body: { name: "No No", unit: "event", price: 1 } })).status,
    ).toBe(403);

    await call(t.app, "PATCH", `/workspaces/${ws}/catalogue/${made.body.data.id}`, { token: owner, body: { active: false } });
    const active = await call<Item[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: owner });
    expect(active.body.data.map((i) => i.name)).not.toContain("Mehendi add-on");
    const all = await call<Item[]>(t.app, "GET", `/workspaces/${ws}/catalogue?all=true`, { token: owner });
    expect(all.body.data.map((i) => i.name)).toContain("Mehendi add-on");
  });
});

describe("quotes and booking", () => {
  it("builds a quote, shares it, and books everything when the client accepts online", async () => {
    const { owner, staff, ws } = await team("972");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Neha Kapoor", phone: "9811122233", eventType: "wedding", eventDate: "2026-12-05", venue: "Rambagh Palace" },
    });
    const leadId = lead.body.data.id;

    const invalid = await call(t.app, "POST", `/workspaces/${ws}/quotes`, { token: owner, body: { title: "Empty", items: [] } });
    expect(invalid.status).toBe(400);
    expect(Object.keys(invalid.body.error.fields ?? {})).toEqual(expect.arrayContaining(["items"]));

    const created = await call<Quote>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId, title: "Wedding makeup", items: LINES, discount: 3900, validUntil: "2099-01-01" },
    });
    expect(created.status).toBe(201);
    const q = created.body.data;
    // Same numbers as the shared maths test in packages/core.
    expect(q).toMatchObject({ number: "Q-0001", status: "draft", subtotal: 40999.98, discount: 3900, tax: 6352.24, total: 43452.22 });
    expect(q.items.map((i) => i.amount)).toEqual([25000, 14000, 1999.98]);
    expect(q.terms).toMatch(/50% advance/);

    const second = await call<Quote>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId, title: "Option B", items: [LINES[0]] },
    });
    expect(second.body.data.number).toBe("Q-0002");

    const edited = await call<Quote>(t.app, "PATCH", `/workspaces/${ws}/quotes/${q.id}`, { token: owner, body: { discount: 0 } });
    expect(edited.body.data.total).toBe(48019.98);

    const sent = await call<Quote>(t.app, "POST", `/workspaces/${ws}/quotes/${q.id}/send`, { token: owner });
    expect(sent.body.data.status).toBe("sent");

    // The client's view hides internal links and numbers.
    const pub = await call<{ business: { name: string }; quote: Record<string, unknown> }>(t.app, "GET", `/public/quotes/${q.shareToken}`);
    expect(pub.body.data.business.name).toBe("972 Studio");
    expect(pub.body.data.quote).not.toHaveProperty("shareToken");
    expect(pub.body.data.quote).not.toHaveProperty("customerPhone");
    expect(pub.body.data.quote.total).toBe(48019.98);

    const accepted = await call<{ quote: { status: string; acceptedBy: string } }>(t.app, "POST", `/public/quotes/${q.shareToken}/accept`, {
      body: { name: "Neha Kapoor" },
    });
    expect(accepted.body.data.quote).toMatchObject({ status: "accepted", acceptedBy: "Neha Kapoor" });
    const again = await call(t.app, "POST", `/public/quotes/${q.shareToken}/accept`, { body: { name: "Neha Kapoor" } });
    expect(again.status).toBe(200);

    // Booked: lead won, client made, event made from the lead's date.
    type Activity = { kind: string; body: string | null; meta: Record<string, unknown>; actor: unknown };
    const bookedLead = await call<{ stageKind: string; clientId: string; eventId: string; activities: Activity[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/leads/${leadId}`,
      { token: owner },
    );
    expect(bookedLead.body.data.stageKind).toBe("won");
    expect(bookedLead.body.data.clientId).toBeTruthy();
    // The history says the client accepted it themselves, and that it was sent.
    expect(bookedLead.body.data.activities.find((a) => a.kind === "stage_changed")).toMatchObject({
      actor: null,
      meta: expect.objectContaining({ via: "quote", quote: "Q-0001", by: "Neha Kapoor" }),
    });
    expect(bookedLead.body.data.activities.map((a) => a.body)).toContain("Sent quote Q-0001");
    const full = await call<Quote>(t.app, "GET", `/workspaces/${ws}/quotes/${q.id}`, { token: owner });
    expect(full.body.data.eventId).toBe(bookedLead.body.data.eventId);
    const event = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${full.body.data.eventId}`, { token: owner });
    expect(event.body.data).toMatchObject({
      title: "Neha Kapoor · Wedding",
      value: 48019.98,
      clientName: "Neha Kapoor",
      leadId,
      quoteNumber: "Q-0001",
    });
    expect(event.body.data.functions).toEqual([expect.objectContaining({ name: "Wedding", date: "2026-12-05" })]);
    // Staff see the booking, but not its money or an enquiry that isn't theirs.
    const staffEvent = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${event.body.data.id}`, { token: staff });
    expect(staffEvent.body.data).toMatchObject({ title: "Neha Kapoor · Wedding", value: null, quoteId: null, quoteNumber: null, leadId: null });

    // Accepted quotes can't be edited; accepting option B later updates the same event.
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/quotes/${q.id}`, { token: owner, body: { discount: 1 } })).status).toBe(409);
    const b = await call<Quote>(t.app, "POST", `/workspaces/${ws}/quotes/${second.body.data.id}/accept`, { token: owner });
    expect(b.body.data.eventId).toBe(full.body.data.eventId);
    const updated = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${full.body.data.eventId}`, { token: owner });
    expect(updated.body.data.value).toBe(b.body.data.total);
  });

  it("handles declines and expired quotes", async () => {
    const { owner, ws } = await team("973");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Arjun Mehta" } });
    const q = await call<Quote>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId: lead.body.data.id, title: "Sangeet sound", items: [LINES[0]] },
    });
    const declined = await call<{ quote: { status: string } }>(t.app, "POST", `/public/quotes/${q.body.data.shareToken}/decline`, {
      body: { reason: "Went with a cheaper option" },
    });
    expect(declined.body.data.quote.status).toBe("declined");
    expect((await call(t.app, "POST", `/public/quotes/${q.body.data.shareToken}/accept`, { body: { name: "Arjun Mehta" } })).status).toBe(409);
    const leadView = await call<{ activities: { body: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/leads/${lead.body.data.id}`, {
      token: owner,
    });
    expect(leadView.body.data.activities[0]?.body).toMatch(/declined: Went with a cheaper option/);

    const old = await call<Quote>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId: lead.body.data.id, title: "Old quote", items: [LINES[0]], validUntil: "2020-01-01" },
    });
    await call(t.app, "POST", `/workspaces/${ws}/quotes/${old.body.data.id}/send`, { token: owner });
    const list = await call<{ number: string; expired: boolean }[]>(t.app, "GET", `/workspaces/${ws}/quotes?status=sent`, { token: owner });
    expect(list.body.data).toEqual([expect.objectContaining({ expired: true })]);
    expect((await call(t.app, "POST", `/public/quotes/${old.body.data.shareToken}/accept`, { body: { name: "Arjun Mehta" } })).status).toBe(410);
  });
});

describe("events and calendar", () => {
  it("creates events, warns about clashes and fills the calendar", async () => {
    const { owner, staff, accountant, freelancer, ws } = await team("974");
    const first = await call<Event>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: {
        newClient: { name: "Sharma Family", phone: "9833344455" },
        title: "Sharma wedding",
        eventType: "wedding",
        value: "250000",
        functions: [
          { name: "Mehendi", date: "2026-12-04", startTime: "16:00" },
          { name: "Wedding", date: "2026-12-05", startTime: "19:30", venue: "ITC Rajputana" },
        ],
      },
    });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ clientName: "Sharma Family", value: 250000, clashes: [] });
    expect(first.body.data.functions.map((f) => f.startTime)).toEqual(["16:00", "19:30"]);

    const second = await call<Event>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { clientId: first.body.data.clientId, title: "Gupta reception", functions: [{ name: "Reception", date: "2026-12-05" }] },
    });
    expect(second.body.data.clashes).toEqual([expect.objectContaining({ date: "2026-12-05", eventTitle: "Sharma wedding" })]);

    const check = await call<{ eventTitle: string }[]>(t.app, "GET", `/workspaces/${ws}/event-clashes?dates=2026-12-04,2026-12-10`, {
      token: owner,
    });
    expect(check.body.data.map((c) => c.eventTitle)).toEqual(["Sharma wedding"]);

    const month = await call<{ date: string; functionName: string }[]>(t.app, "GET", `/workspaces/${ws}/calendar?month=2026-12`, { token: staff });
    expect(month.body.data.map((e) => `${e.date} ${e.functionName}`)).toEqual([
      "2026-12-04 Mehendi",
      "2026-12-05 Wedding",
      "2026-12-05 Reception",
    ]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/calendar?month=Dec`, { token: owner })).status).toBe(400);

    // Cancelling the second event removes the clash.
    await call(t.app, "PATCH", `/workspaces/${ws}/events/${second.body.data.id}`, { token: owner, body: { status: "cancelled" } });
    const firstAgain = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${first.body.data.id}`, { token: owner });
    expect(firstAgain.body.data.clashes).toEqual([]);

    const moved = await call<Event>(t.app, "PATCH", `/workspaces/${ws}/events/${first.body.data.id}`, {
      token: owner,
      body: { functions: [{ name: "Wedding", date: "2026-12-06" }] },
    });
    expect(moved.body.data.functions).toHaveLength(1);

    const range = await call<{ title: string }[]>(t.app, "GET", `/workspaces/${ws}/events?from=2026-12-06&to=2026-12-31&status=confirmed`, {
      token: accountant,
    });
    expect(range.body.data.map((e) => e.title)).toEqual(["Sharma wedding"]);

    // Staff and accountants can see events; only owners and managers change them.
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/events/${first.body.data.id}`, { token: staff, body: { title: "X Y" } })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/events`, { token: freelancer })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/quotes`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/quotes`, { token: accountant })).status).toBe(200);

    // Booking values are money: accountants see them, staff don't.
    const staffList = await call<{ title: string; value: number | null }[]>(t.app, "GET", `/workspaces/${ws}/events`, { token: staff });
    expect(staffList.body.data.map((e) => e.value)).toEqual([null, null]);
    const accountantView = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${first.body.data.id}`, { token: accountant });
    expect(accountantView.body.data.value).toBe(250000);
  });

  it("shows the next two weeks on Home", async () => {
    const { owner, ws } = await team("975");
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await call(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Soon Client" }, title: "Soon", functions: [{ name: "Haldi", date: inDays(3) }] },
    });
    await call(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Later Client" }, title: "Later", functions: [{ name: "Wedding", date: inDays(60) }] },
    });
    const home = await call<{ upcomingEvents: { title: string }[] }>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner });
    expect(home.body.data.upcomingEvents.map((e) => e.title)).toEqual(["Soon"]);
  });
});

describe("tenant isolation for quotes and events", () => {
  it("keeps quotes, events and prices inside their own business", async () => {
    const a = await team("976");
    const b = await team("977");
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${a.ws}/leads`, { token: a.owner, body: { name: "Private Lead" } });
    const q = await call<Quote>(t.app, "POST", `/workspaces/${a.ws}/quotes`, {
      token: a.owner,
      body: { leadId: lead.body.data.id, title: "Private quote", items: [LINES[0]] },
    });
    const ev = await call<Event>(t.app, "POST", `/workspaces/${a.ws}/events`, {
      token: a.owner,
      body: { newClient: { name: "Private Client" }, title: "Private event", functions: [{ name: "Wedding", date: "2026-12-05" }] },
    });
    const item = (await call<Item[]>(t.app, "GET", `/workspaces/${a.ws}/catalogue`, { token: a.owner })).body.data[0]!;

    const attempts = [
      call(t.app, "GET", `/workspaces/${b.ws}/quotes/${q.body.data.id}`, { token: b.owner }),
      call(t.app, "POST", `/workspaces/${b.ws}/quotes/${q.body.data.id}/accept`, { token: b.owner }),
      call(t.app, "GET", `/workspaces/${b.ws}/events/${ev.body.data.id}`, { token: b.owner }),
      call(t.app, "PATCH", `/workspaces/${b.ws}/events/${ev.body.data.id}`, { token: b.owner, body: { status: "cancelled" } }),
      call(t.app, "PATCH", `/workspaces/${b.ws}/catalogue/${item.id}`, { token: b.owner, body: { price: 1 } }),
      call(t.app, "GET", `/workspaces/${a.ws}/calendar?month=2026-12`, { token: b.owner }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);

    // B can't quote A's lead, or attach A's client to its own event.
    const crossQuote = await call(t.app, "POST", `/workspaces/${b.ws}/quotes`, {
      token: b.owner,
      body: { leadId: lead.body.data.id, title: "Sneaky", items: [LINES[0]] },
    });
    expect(crossQuote.status).toBe(400);
    const crossEvent = await call(t.app, "POST", `/workspaces/${b.ws}/events`, {
      token: b.owner,
      body: { clientId: ev.body.data.clientId, title: "Sneaky", functions: [{ name: "Wedding", date: "2026-12-05" }] },
    });
    expect(crossEvent.status).toBe(400);

    // B's calendar and clash check don't see A's event on the same date.
    const bClash = await call<unknown[]>(t.app, "GET", `/workspaces/${b.ws}/event-clashes?dates=2026-12-05`, { token: b.owner });
    expect(bClash.body.data).toEqual([]);
    expect((await call(t.app, "GET", "/public/quotes/not-a-real-token")).status).toBe(404);
  });
});
