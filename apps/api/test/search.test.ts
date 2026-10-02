import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Result = { kind: string; id: string; title: string; subtitle: string | null; href: string };
type Member = { id: string; name: string | null };

const LINES = [{ name: "Bridal HD makeup", unit: "event", quantity: 1, rate: 25000, taxRate: 18 }];

/** A business with an owner and one staff member, who isn't in a department yet. */
async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
    token: owner,
    body: { name: "Arfin Khan", phone: `${prefix}0000002`, role: "staff" },
  });
  const staff = await signIn(t.app, `${prefix}0000002`, "Arfin Khan");
  await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
  const members = (await call<{ members: Member[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const staffId = members.find((m) => m.name === "Arfin Khan")!.id;
  return { owner, ws, staff, staffId };
}

const search = async (ws: string, token: string, q: string) => {
  const res = await call<{ q: string; results: Result[] }>(t.app, "GET", `/workspaces/${ws}/search?q=${encodeURIComponent(q)}`, { token });
  expect(res.status).toBe(200);
  return res.body.data.results;
};

/** One of each kind, all for "Ananya", each with its own phone. */
async function fill(ws: string, owner: string) {
  const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
    token: owner,
    body: { name: "Ananya Lead", phone: "9800011111" },
  });
  const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, {
    token: owner,
    body: { name: "Ananya Client", phone: "9800022222" },
  });
  const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
    token: owner,
    body: { clientId: client.body.data.id, title: "Ananya wedding", venue: "ITC Rajputana", functions: [{ name: "Wedding", date: "2026-12-05" }] },
  });
  const quote = await call<{ id: string; number: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
    token: owner,
    body: { leadId: lead.body.data.id, title: "Bridal package", items: LINES },
  });
  const bill = await call<{ id: string; number: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
    token: owner,
    body: { billTo: { name: "Ananya Bill", phone: "9800033333" }, issueDate: "2026-09-25", items: [{ name: "Party makeup", unit: "person", quantity: 2, rate: 2500 }] },
  });
  for (const res of [lead, client, event, quote, bill]) expect(res.status).toBe(201);
  return { lead: lead.body.data, client: client.body.data, event: event.body.data, quote: quote.body.data, bill: bill.body.data };
}

describe("search", () => {
  it("finds every kind by name, phone digits and number, best matches first", async () => {
    const { owner, ws } = await business("951");
    const made = await fill(ws, owner);

    const byName = await search(ws, owner, "anan");
    expect(new Set(byName.map((r) => r.kind))).toEqual(new Set(["lead", "client", "event", "quote", "bill"]));
    expect(byName.find((r) => r.kind === "lead")).toMatchObject({ id: made.lead.id, title: "Ananya Lead", href: `/app/leads/${made.lead.id}` });
    // The quote made a client of the lead too, so look for this one.
    expect(byName.find((r) => r.id === made.client.id)).toMatchObject({ kind: "client", title: "Ananya Client", href: `/app/clients/${made.client.id}` });
    const event = byName.find((r) => r.kind === "event")!;
    expect(event).toMatchObject({ id: made.event.id, title: "Ananya wedding", href: `/app/events/${made.event.id}` });
    expect(event.subtitle).toContain("ITC Rajputana");
    expect(event.subtitle).toContain("5 Dec");
    expect(byName.find((r) => r.kind === "quote")).toMatchObject({ id: made.quote.id, href: `/app/quotes/${made.quote.id}` });
    const bill = byName.find((r) => r.kind === "bill")!;
    expect(bill).toMatchObject({ id: made.bill.id, href: `/app/bills/${made.bill.id}` });
    expect(bill.title).toContain(made.bill.number);
    expect(bill.subtitle).toMatch(/₹5,000/);

    // By the last digits of a phone, however it was saved.
    expect((await search(ws, owner, "11111")).filter((r) => r.kind === "lead").map((r) => r.id)).toEqual([made.lead.id]);
    const byClientPhone = await search(ws, owner, "98000 22222");
    expect(byClientPhone.find((r) => r.kind === "client")?.id).toBe(made.client.id);
    expect(byClientPhone.find((r) => r.kind === "event")?.id).toBe(made.event.id);
    // The invoice also saved its customer as a client.
    expect((await search(ws, owner, "33333")).map((r) => r.kind).sort()).toEqual(["bill", "client"]);
    expect((await search(ws, owner, "33333")).find((r) => r.kind === "bill")?.id).toBe(made.bill.id);
    // Three digits aren't a phone search.
    expect(await search(ws, owner, "333")).toEqual([]);

    // Quote and invoice numbers.
    expect((await search(ws, owner, made.quote.number)).map((r) => r.id)).toContain(made.quote.id);
    expect((await search(ws, owner, made.bill.number)).map((r) => r.id)).toContain(made.bill.id);

    // Starts-with comes before a word inside, which comes before anywhere inside.
    for (const name of ["Kananya Bose", "Riya Ananya", "Ananya Mehra"]) {
      await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name } });
    }
    const leads = (await search(ws, owner, "ananya")).filter((r) => r.kind === "lead").map((r) => r.title);
    expect(leads.slice(0, 2).sort()).toEqual(["Ananya Lead", "Ananya Mehra"]);
    expect(leads.slice(2)).toEqual(["Riya Ananya", "Kananya Bose"]);

    // At most five of a kind.
    for (let i = 0; i < 4; i++) await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: `Ananya Extra ${i}` } });
    expect((await search(ws, owner, "ananya")).filter((r) => r.kind === "lead")).toHaveLength(5);

    // % and _ are letters, not wildcards; too short or too long is refused.
    expect(await search(ws, owner, "%%")).toEqual([]);
    expect(await search(ws, owner, "a_a")).toEqual([]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/search?q=a`, { token: owner })).status).toBe(400);
  });

  it("keeps sales staff to their own leads and quotes, with no clients or invoices", async () => {
    const { owner, ws, staff, staffId } = await business("952");
    const made = await fill(ws, owner);
    expect((await call(t.app, "PUT", `/workspaces/${ws}/members/${staffId}/access`, { token: owner, body: { department: "sales" } })).status).toBe(200);

    const mine = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: staff,
      body: { name: "Ananya Mine", phone: "9800055555" },
    });
    const myQuote = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: staff,
      body: { leadId: mine.body.data.id, title: "My quote", items: LINES },
    });
    expect(myQuote.status).toBe(201);

    const found = await search(ws, staff, "anan");
    expect(found.some((r) => r.kind === "bill" || r.kind === "client")).toBe(false);
    expect(found.filter((r) => r.kind === "lead").map((r) => r.id)).toEqual([mine.body.data.id]);
    expect(found.filter((r) => r.kind === "quote").map((r) => r.id)).toEqual([myQuote.body.data.id]);
    // Sales has the events screen: every event.
    expect(found.filter((r) => r.kind === "event").map((r) => r.id)).toEqual([made.event.id]);
    // Nor by phone or number.
    expect(await search(ws, staff, "11111")).toEqual([]);
    expect(await search(ws, staff, "33333")).toEqual([]);
    expect((await search(ws, staff, made.bill.number)).some((r) => r.kind === "bill")).toBe(false);

    // Without the events screen, only the events they're on the team for.
    await call(t.app, "PUT", `/workspaces/${ws}/departments/sales/access`, { token: owner, body: { areas: ["leads", "quotes"] } });
    expect((await search(ws, staff, "anan")).some((r) => r.kind === "event")).toBe(false);
  });

  it("never shows another business's records", async () => {
    const a = await business("953");
    const b = await business("954");
    await fill(a.ws, a.owner);
    await call(t.app, "POST", `/workspaces/${b.ws}/leads`, { token: b.owner, body: { name: "Ananya Elsewhere", phone: "9800066666" } });

    const fromB = await search(b.ws, b.owner, "anan");
    expect(fromB.map((r) => r.title)).toEqual(["Ananya Elsewhere"]);
    expect(await search(b.ws, b.owner, "11111")).toEqual([]);
    expect((await search(a.ws, a.owner, "Elsewhere"))).toEqual([]);
    expect(await search(a.ws, a.owner, "66666")).toEqual([]);
    // And someone outside the business can't search it.
    expect((await call(t.app, "GET", `/workspaces/${a.ws}/search?q=anan`, { token: b.owner })).status).toBe(404);
  });
});
