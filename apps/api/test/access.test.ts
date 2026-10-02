import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLE_GRANTS } from "@wedding-yantra/core";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Access = {
  role: string;
  permissions: string[];
  areas: string[];
  accessSource: string;
  department: string | null;
  departmentLabel: string | null;
  departmentOn: boolean;
};
type Member = Access & { id: string; userId: string; name: string | null; extraAreas: string[]; departmentAreas: string[]; savedExtraAreas: string[] };
type Person = { token: string; id: string; userId: string };
type Invitation = { id: string; department: string | null; departmentLabel: string | null };
type Item = { id: string; name: string; unit: string; price: number };

const LINES = [{ name: "Bridal HD makeup", unit: "event", quantity: 1, rate: 25000, taxRate: 18 }];

/**
 * A business with an owner, a manager, staff and a View only member. Nobody is in a
 * department until a test puts them in one.
 */
async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const members = async () => (await call<{ members: Member[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const join = async (phone: string, name: string, role: string): Promise<Person> => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    const m = (await members()).find((x) => x.name === name)!;
    return { token, id: m.id, userId: m.userId };
  };
  const mona = await join(`${prefix}0000002`, "Mona Manager", "manager");
  const arfin = await join(`${prefix}0000003`, "Arfin Khan", "staff");
  const bina = await join(`${prefix}0000004`, "Bina Shah", "staff");
  const kavya = await join(`${prefix}0000005`, "Kavya Rao", "staff");
  const ravi = await join(`${prefix}0000006`, "Ravi Verma", "staff");
  /** The owner sets someone's department or extra screens. */
  const access = (who: Person, body: { department?: string | null; extraAreas?: string[] }) =>
    call<Member>(t.app, "PUT", `/workspaces/${ws}/members/${who.id}/access`, { token: owner, body });
  /** What the app is told about someone's access when they sign in. */
  const me = async (token: string) =>
    (await call<{ workspaces: (Access & { id: string })[] }>(t.app, "GET", "/auth/me", { token })).body.data.workspaces.find((w) => w.id === ws)!;
  return { owner, ws, members, mona, arfin, bina, kavya, ravi, access, me };
}

type Business = Awaited<ReturnType<typeof business>>;

const get = (b: Business, token: string, url: string) => call(t.app, "GET", `/workspaces/${b.ws}${url}`, { token });

async function billAndPayment(b: Business, token: string) {
  const bill = await call<{ id: string }>(t.app, "POST", `/workspaces/${b.ws}/bills`, {
    token,
    body: { billTo: { name: "Walk In" }, issueDate: "2026-09-25", items: [{ name: "Party makeup", unit: "person", quantity: 2, rate: 2500 }] },
  });
  const payment = await call<{ id: string }>(t.app, "POST", `/workspaces/${b.ws}/payments`, {
    token,
    body: { billId: bill.body.data.id, amount: 2000, paidOn: "2026-09-26", method: "cash" },
  });
  return { bill, payment };
}

describe("Staff in Sales", () => {
  it("works their own leads and quotes, and sees no money", async () => {
    const b = await business("941");
    const { owner, ws, arfin, bina } = b;
    expect((await b.access(arfin, { department: "sales" })).status).toBe(200);
    await b.access(bina, { department: "sales" });

    // Their own lead, and a quote on it.
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: arfin.token,
      body: { name: "Neha Kapoor", phone: "9811122233", eventType: "wedding", eventDate: "2026-12-05" },
    });
    expect(lead.status).toBe(201);
    const quote = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: arfin.token,
      body: { leadId: lead.body.data.id, title: "Wedding makeup", items: LINES },
    });
    expect(quote.status).toBe(201);

    // A colleague's quote and lead stay theirs.
    const binaLead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: bina.token,
      body: { name: "Pooja Jain", phone: "9811122244", eventType: "wedding" },
    });
    const binaQuote = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: bina.token,
      body: { leadId: binaLead.body.data.id, title: "Engagement makeup", items: LINES },
    });
    expect(binaQuote.status).toBe(201);
    expect((await get(b, arfin.token, `/quotes/${binaQuote.body.data.id}`)).status).toBe(404);
    expect((await call(t.app, "POST", `/workspaces/${ws}/quotes/${binaQuote.body.data.id}/send`, { token: arfin.token })).status).toBe(404);
    const list = await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/quotes`, { token: arfin.token });
    expect(list.body.data.map((q) => q.id)).toEqual([quote.body.data.id]);
    const onTheirs = await call(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: arfin.token,
      body: { leadId: binaLead.body.data.id, title: "Sneaky", items: LINES },
    });
    expect(onTheirs.status).toBe(404);
    // The owner sees both.
    expect((await call<unknown[]>(t.app, "GET", `/workspaces/${ws}/quotes`, { token: owner })).body.data).toHaveLength(2);

    // No money anywhere.
    for (const url of ["/payments", "/bills", "/money", "/reports/month?month=2026-10", "/vendors"]) {
      expect((await get(b, arfin.token, url)).status, url).toBe(403);
    }
    // Only their own expenses.
    const binaSpent = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: bina.token,
      body: { category: "travel", amount: 500, spentOn: "2026-09-28" },
    });
    const mine = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: arfin.token,
      body: { category: "food", amount: 300, spentOn: "2026-09-28" },
    });
    const expenses = await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/expenses`, { token: arfin.token });
    expect(expenses.body.data.map((x) => x.id)).toEqual([mine.body.data.id]);
    expect((await get(b, arfin.token, `/expenses/${binaSpent.body.data.id}`)).status).toBe(404);

    // Events without what they're worth.
    const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Sharma Family", phone: "9833344455" }, title: "Sharma wedding", value: "50000", functions: [{ name: "Wedding", date: "2026-12-10" }] },
    });
    const seen = await call<{ value: number | null }>(t.app, "GET", `/workspaces/${ws}/events/${event.body.data.id}`, { token: arfin.token });
    expect(seen.status).toBe(200);
    expect(seen.body.data.value).toBeNull();
    const listed = await call<{ id: string; value: number | null }[]>(t.app, "GET", `/workspaces/${ws}/events`, { token: arfin.token });
    expect(listed.body.data.find((e) => e.id === event.body.data.id)?.value).toBeNull();
    expect((await call<{ value: number | null }>(t.app, "GET", `/workspaces/${ws}/events/${event.body.data.id}`, { token: owner })).body.data.value).toBe(50000);

    // Home has their leads but no money.
    const home = await call<{ money: unknown; sales: { monthEnquiries: number } }>(t.app, "GET", `/workspaces/${ws}/home`, { token: arfin.token });
    expect(home.body.data.money).toBeNull();
    expect(home.body.data.sales.monthEnquiries).toBe(1);
    expect((await call<{ money: unknown }>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner })).body.data.money).not.toBeNull();

    // The client page shows bills: even with the Clients screen, no link without money.
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Walk In", phone: "9844455566" } });
    const clientId = client.body.data.id;
    expect((await call(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: owner })).status).toBe(200);
    expect((await get(b, arfin.token, `/clients/${clientId}`)).status).toBe(403);
    await b.access(arfin, { extraAreas: ["clients"] });
    const asArfin = await call<{ portalToken: string | null }>(t.app, "GET", `/workspaces/${ws}/clients/${clientId}`, { token: arfin.token });
    expect(asArfin.status).toBe(200);
    expect(asArfin.body.data.portalToken).toBeNull();
    expect((await call(t.app, "POST", `/workspaces/${ws}/clients/${clientId}/portal`, { token: arfin.token })).status).toBe(403);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/clients/${clientId}/portal`, { token: arfin.token })).status).toBe(403);
  });
});

describe("Staff in Accountant", () => {
  it("records payments, makes invoices, pays vendors and approves others' expenses, but never their own", async () => {
    const b = await business("942");
    const { owner, ws, arfin, kavya } = b;
    await b.access(kavya, { department: "accountant" });

    // An invoice with an item from the price list, and a payment on it.
    const prices = await call<Item[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: kavya.token });
    expect(prices.status).toBe(200);
    const item = prices.body.data[0]!;
    const bill = await call<{ id: string; items: { catalogueItemId: string | null }[] }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: kavya.token,
      body: {
        billTo: { name: "Walk In" },
        issueDate: "2026-09-25",
        items: [{ catalogueItemId: item.id, name: item.name, unit: item.unit, quantity: 1, rate: item.price }],
      },
    });
    expect(bill.status).toBe(201);
    expect(bill.body.data.items[0]!.catalogueItemId).toBe(item.id);
    const paid = await call(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: kavya.token,
      body: { billId: bill.body.data.id, amount: 1000, paidOn: "2026-09-26", method: "cash" },
    });
    expect(paid.status).toBe(201);
    // Changing prices isn't theirs.
    expect((await call(t.app, "POST", `/workspaces/${ws}/catalogue`, { token: kavya.token, body: { name: "No No", unit: "event", price: 1 } })).status).toBe(403);

    // A vendor, and paying them.
    const vendor = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/vendors`, { token: kavya.token, body: { name: "Ramesh Florist" } });
    expect(vendor.status).toBe(201);
    const payout = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/payouts`, {
      token: kavya.token,
      body: { vendorId: vendor.body.data.id, description: "Mandap flowers", amount: 4500 },
    });
    expect(payout.status).toBe(201);
    const settled = await call<{ status: string }>(t.app, "POST", `/workspaces/${ws}/payouts/${payout.body.data.id}/pay`, {
      token: kavya.token,
      body: { paidOn: "2026-09-27", method: "upi" },
    });
    expect(settled.status).toBe(200);
    expect(settled.body.data.status).toBe("paid");

    // A colleague's expense: theirs to approve.
    const travel = await call<{ id: string; status: string }>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: arfin.token,
      body: { category: "travel", amount: 800, spentOn: "2026-09-28", paidBy: arfin.userId },
    });
    expect(travel.body.data.status).toBe("pending");
    const approved = await call<{ status: string }>(t.app, "POST", `/workspaces/${ws}/expenses/${travel.body.data.id}/review`, {
      token: kavya.token,
      body: { approve: true },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("approved");
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${travel.body.data.id}/reimburse`, { token: kavya.token, body: { reimbursed: true } })).status).toBe(200);

    // Their own waits for someone else, who also pays it back.
    const own = await call<{ id: string; status: string }>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: kavya.token,
      body: { category: "food", amount: 300, spentOn: "2026-09-28", paidBy: kavya.userId },
    });
    expect(own.status).toBe(201);
    expect(own.body.data.status).toBe("pending");
    const homeBefore = await call<{ money: { pendingExpenses: number } | null }>(t.app, "GET", `/workspaces/${ws}/home`, { token: kavya.token });
    expect(homeBefore.body.data.money?.pendingExpenses).toBe(0);
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${own.body.data.id}/review`, { token: kavya.token, body: { approve: true } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${own.body.data.id}/reimburse`, { token: kavya.token, body: { reimbursed: true } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${own.body.data.id}/review`, { token: owner, body: { approve: true } })).status).toBe(200);
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${own.body.data.id}/reimburse`, { token: kavya.token, body: { reimbursed: true } })).status).toBe(403);
    // Nor can they change it once it's approved.
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/expenses/${own.body.data.id}`, { token: kavya.token, body: { amount: 3000 } })).status).toBe(409);

    // No leads, and no lists made from them.
    expect((await get(b, kavya.token, "/leads")).status).toBe(403);
    expect((await get(b, kavya.token, "/broadcasts/audience?audience=lost_enquiries")).status).toBe(403);
    expect((await get(b, kavya.token, "/broadcasts/audience?audience=all_clients")).status).toBe(200);

    // Home shows the money.
    const home = await call<{ money: { receivedThisMonth: number } | null }>(t.app, "GET", `/workspaces/${ws}/home`, { token: kavya.token });
    expect(home.body.data.money).not.toBeNull();
  });
});

describe("Manager in Sales", () => {
  it("runs Sales without money, and only gives work to their own department", async () => {
    const b = await business("943");
    const { owner, ws, mona, arfin, kavya, ravi } = b;
    await b.access(mona, { department: "sales" });
    await b.access(arfin, { department: "sales" });
    await b.access(kavya, { department: "accountant" });

    for (const url of ["/money", "/payments", "/bills", "/vendors"]) {
      expect((await get(b, mona.token, url)).status, url).toBe(403);
    }

    // The activity log leaves out the money.
    const { payment } = await billAndPayment(b, owner);
    expect(payment.status).toBe(201);
    type Feed = { items: { action: string }[] };
    const ownerFeed = (await call<Feed>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner })).body.data.items.map((i) => i.action);
    expect(ownerFeed.some((a) => a.startsWith("payment."))).toBe(true);
    const monaFeed = await call<Feed>(t.app, "GET", `/workspaces/${ws}/activity`, { token: mona.token });
    expect(monaFeed.status).toBe(200);
    expect(monaFeed.body.data.items.map((i) => i.action).filter((a) => a.startsWith("payment.") || a.startsWith("bill."))).toEqual([]);

    // Scores: their people, and no money.
    type Scores = { people: { user: { id: string } }[]; business: { moneyBeforeEvents: unknown } | null };
    const scores = await call<Scores>(t.app, "GET", `/workspaces/${ws}/scores?month=2026-10`, { token: mona.token });
    expect(scores.body.data.business).not.toBeNull();
    expect(scores.body.data.business!.moneyBeforeEvents).toBeNull();
    expect(scores.body.data.people.map((p) => p.user.id).sort()).toEqual([mona.userId, arfin.userId].sort());
    expect((await call<Scores>(t.app, "GET", `/workspaces/${ws}/scores?month=2026-10`, { token: owner })).body.data.business!.moneyBeforeEvents).not.toBeNull();

    // The task board: only Sales.
    const board = await call<{ people: { user: { id: string } }[] }>(t.app, "GET", `/workspaces/${ws}/tasks/board`, { token: mona.token });
    expect(board.status).toBe(200);
    expect(board.body.data.people.map((p) => p.user.id).sort()).toEqual([mona.userId, arfin.userId].sort());
    expect((await get(b, mona.token, `/tasks/people/${kavya.userId}`)).status).toBe(404);
    expect((await get(b, mona.token, `/tasks/people/${arfin.userId}`)).status).toBe(200);

    // Giving tasks: to Sales, not to the accountant.
    const given = await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: mona.token, body: { title: "Call Neha back", assigneeId: arfin.userId } });
    expect(given.status).toBe(201);
    const refused = await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: mona.token, body: { title: "Check the bills", assigneeId: kavya.userId } });
    expect(refused.status).toBe(403);

    // Without the Team screen they don't invite or change roles at all.
    const invite = (role: string, phone: string) =>
      call(t.app, "POST", `/workspaces/${ws}/invitations`, { token: mona.token, body: { name: "New Person", phone, role } });
    expect((await invite("staff", "9430000010")).status).toBe(403);

    // With it, they still can't give more than they have.
    await b.access(mona, { extraAreas: ["team"] });
    const viewOnly = await invite("accountant", "9430000011");
    expect(viewOnly.status).toBe(403);
    expect(viewOnly.body.error.message).toMatch(/Ask the owner/);
    expect((await invite("staff", "9430000012")).status).toBe(201);

    const role = (who: Person, to: string) => call(t.app, "PATCH", `/workspaces/${ws}/members/${who.id}`, { token: mona.token, body: { role: to } });
    expect((await role(ravi, "accountant")).status).toBe(403);
    expect((await role(ravi, "freelancer")).status).toBe(200);
  });
});

describe("a department's manager", () => {
  it("opens and changes only their own department's tasks", async () => {
    const b = await business("948");
    const { owner, ws, mona, arfin, kavya } = b;
    await b.access(mona, { department: "sales" });
    await b.access(arfin, { department: "sales" });
    await b.access(kavya, { department: "accountant" });
    const give = async (assigneeId: string, title: string) =>
      (await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title, assigneeId } })).body.data.id;
    const theirs = await give(kavya.userId, "Match the bank statement");
    const ours = await give(arfin.userId, "Call the Sharma family");

    // Kavya's task, by its address: not there for Mona.
    expect((await get(b, mona.token, `/tasks/${theirs}`)).status).toBe(404);
    const edit = await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${theirs}`, { token: mona.token, body: { title: "Changed" } });
    expect(edit.status).toBe(404);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/tasks/${theirs}`, { token: mona.token })).status).toBe(404);
    // Arfin's is hers to run.
    expect((await get(b, mona.token, `/tasks/${ours}`)).status).toBe(200);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${ours}`, { token: mona.token, body: { title: "Call the Sharmas" } })).status).toBe(200);
    // The owner still runs everyone's.
    expect((await get(b, owner, `/tasks/${theirs}`)).status).toBe(200);
  });

  it("gets a daily summary of their own department, without events they can't see", async () => {
    const b = await business("949");
    const { owner, ws, mona, arfin, kavya } = b;
    await b.access(mona, { department: "sales" });
    await b.access(arfin, { department: "sales" });
    await b.access(kavya, { department: "accountant" });
    for (const [who, title] of [[arfin, "Send the album"], [kavya, "File the GST return"]] as const) {
      await call(t.app, "POST", `/workspaces/${ws}/tasks`, { token: owner, body: { title, assigneeId: who.userId, dueDate: "2026-01-05" } });
    }
    type Summary = { lateTasks: { name: string | null }[]; newLeads: number | null; tomorrow: { events: unknown[] | null } };
    const summary = async (token: string) => (await call<Summary>(t.app, "GET", `/workspaces/${ws}/daily-summary`, { token })).body.data;

    const everyone = await summary(owner);
    expect(everyone.lateTasks.map((l) => l.name).sort()).toEqual(["Arfin Khan", "Kavya Rao"]);
    expect(everyone.tomorrow.events).toEqual([]);
    const sales = await summary(mona.token);
    expect(sales.lateTasks.map((l) => l.name)).toEqual(["Arfin Khan"]);

    // Without Events & calendar the summary leaves tomorrow's events out, instead of "No events".
    expect((await call(t.app, "PUT", `/workspaces/${ws}/departments/sales/access`, { token: owner, body: { areas: ["leads", "quotes"] } })).status).toBe(200);
    expect((await summary(mona.token)).tomorrow.events).toBeNull();
  });
});

describe("what the review found", () => {
  it("staff with Quotes but not Leads change only their own quotes", async () => {
    const b = await business("950");
    const { owner, ws, arfin, kavya } = b;
    await b.access(arfin, { department: "sales" });
    await b.access(kavya, { department: "accountant", extraAreas: ["quotes"] });
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: arfin.token, body: { name: "Neha Kapoor", phone: "9811122233" } });
    const theirs = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: arfin.token,
      body: { leadId: lead.body.data.id, title: "Wedding makeup", items: LINES },
    });
    expect(theirs.status).toBe(201);
    const id = theirs.body.data.id;
    expect((await get(b, kavya.token, `/quotes/${id}`)).status).toBe(404);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/quotes/${id}`, { token: kavya.token, body: { title: "Changed" } })).status).toBe(404);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/quotes/${id}`, { token: kavya.token })).status).toBe(404);
    // A quote for a client is theirs to make and change.
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Mehra Family", phone: "9844455566" } });
    const own = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: kavya.token,
      body: { clientId: client.body.data.id, title: "Decor", items: LINES },
    });
    expect(own.status).toBe(201);
    expect((await get(b, kavya.token, `/quotes/${own.body.data.id}`)).status).toBe(200);
  });

  it("keeps the client page link, lost-enquiry messages and points with the right people", async () => {
    const b = await business("951");
    const { owner, ws, mona, arfin, kavya } = b;
    await b.access(mona, { department: "sales" });
    await b.access(arfin, { department: "sales" });
    await b.access(kavya, { department: "accountant" });

    // The client page shows quotes too, so the Accountant department (no Quotes) can't share it.
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Walk In", phone: "9844455577" } });
    await call(t.app, "POST", `/workspaces/${ws}/clients/${client.body.data.id}/portal`, { token: owner });
    const seen = await call<{ portalToken: string | null }>(t.app, "GET", `/workspaces/${ws}/clients/${client.body.data.id}`, { token: kavya.token });
    expect(seen.status).toBe(200);
    expect(seen.body.data.portalToken).toBeNull();
    expect((await call(t.app, "POST", `/workspaces/${ws}/clients/${client.body.data.id}/portal`, { token: kavya.token })).status).toBe(403);

    // A lost-enquiries message is out of the Accountant department's list and can't be deleted by it.
    // (Made directly: this business has no lost enquiries to send it to.)
    const msg = await t.db.query<{ id: string }>(
      `INSERT INTO broadcasts (workspace_id, title, message, audience) VALUES ($1, 'Still planning?', 'Hello! We still have dates free.', 'lost_enquiries') RETURNING id`,
      [ws],
    );
    const msgId = msg.rows[0]!.id;
    const list = await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/broadcasts`, { token: kavya.token });
    expect(list.status).toBe(200);
    expect(list.body.data.map((m) => m.id)).not.toContain(msgId);
    expect((await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/broadcasts`, { token: owner })).body.data.map((m) => m.id)).toContain(msgId);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/broadcasts/${msgId}`, { token: kavya.token })).status).toBe(403);

    // Points: the Sales manager opens and recognises only Sales people.
    type Board = { rows: { user: { id: string }; canOpen: boolean; onTime: number | null }[] };
    const board = await call<Board>(t.app, "GET", `/workspaces/${ws}/points/leaderboard?month=2026-10`, { token: mona.token });
    const row = (id: string) => board.body.data.rows.find((r) => r.user.id === id)!;
    expect(row(arfin.userId).canOpen).toBe(true);
    expect(row(kavya.userId).canOpen).toBe(false);
    expect(row(mona.userId).canOpen).toBe(true);
    expect((await get(b, mona.token, `/points/ledger?userId=${kavya.userId}&month=2026-10`)).status).toBe(404);
    expect((await get(b, mona.token, `/points/ledger?userId=${arfin.userId}&month=2026-10`)).status).toBe(200);
    const recognise = (userId: string) =>
      call(t.app, "POST", `/workspaces/${ws}/points/recognise`, { token: mona.token, body: { userId, note: "Great work on the Sharma booking" } });
    expect((await recognise(kavya.userId)).status).toBe(403);
    expect([201, 409]).toContain((await recognise(arfin.userId)).status);
  });

  it("runs a task by who it's for, and lets only those who run it remove others' comments", async () => {
    const b = await business("952");
    const { owner, ws, mona, arfin, kavya } = b;
    await b.access(mona, { department: "sales" });
    await b.access(arfin, { department: "sales" });
    await b.access(kavya, { department: "accountant" });
    // Arfin's own task, handed to Kavya by the owner: no longer the Sales manager's to run.
    const task = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, { token: arfin.token, body: { title: "Chase the album printer" } });
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/tasks/${task.body.data.id}`, { token: owner, body: { assigneeId: kavya.userId } })).status).toBe(200);
    expect((await get(b, mona.token, `/tasks/${task.body.data.id}`)).status).toBe(404);

    // A task on an event the Sales manager can see: they can't remove Kavya's comment on it.
    const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Gupta Family", phone: "9833344466" }, title: "Gupta wedding", functions: [{ name: "Wedding", date: "2026-12-12" }] },
    });
    const onEvent = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/tasks`, {
      token: owner,
      body: { title: "Collect the advance", assigneeId: kavya.userId, eventId: event.body.data.id },
    });
    expect((await call(t.app, "POST", `/workspaces/${ws}/tasks/${onEvent.body.data.id}/comments`, { token: kavya.token, body: { body: "Asked them today" } })).status).toBe(201);
    const { rows } = await t.db.query<{ id: string }>(`SELECT id FROM task_comments WHERE task_id = $1`, [onEvent.body.data.id]);
    expect((await get(b, mona.token, `/tasks/${onEvent.body.data.id}`)).status).toBe(200);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/tasks/${onEvent.body.data.id}/comments/${rows[0]!.id}`, { token: mona.token })).status).toBe(403);
  });

  it("keeps a saved extra screen when the role goes down, so it comes back when the role goes up", async () => {
    const b = await business("954");
    const { owner, ws, mona } = b;
    await b.access(mona, { department: "sales", extraAreas: ["team"] });
    const role = (to: string) => call(t.app, "PATCH", `/workspaces/${ws}/members/${mona.id}`, { token: owner, body: { role: to } });
    expect((await role("staff")).status).toBe(200);
    // The owner switches on Payments; Team stays saved though Staff can't use it.
    const saved = await b.access(mona, { extraAreas: ["team", "money"] });
    expect(saved.status).toBe(200);
    expect(saved.body.data.savedExtraAreas).toEqual(["money", "team"]);
    expect(saved.body.data.extraAreas).toEqual(["money"]);
    // A new screen the role can't use is still refused.
    expect((await b.access(mona, { extraAreas: ["team", "money", "settings"] })).status).toBe(400);
    expect((await role("manager")).status).toBe(200);
    expect((await b.me(mona.token)).permissions).toContain("members.invite");
  });

  it("treats a blank department as none, keeps a hidden department on a re-sent invite, and leaves the UPI ID with the business profile", async () => {
    const b = await business("953");
    const { owner, ws, mona, arfin } = b;
    const blank = await b.access(arfin, { department: "" });
    expect(blank.status).toBe(200);
    expect((await b.me(arfin.token)).department).toBeNull();
    expect((await b.me(arfin.token)).permissions).toContain("leads.work");

    const invite = (department?: string) =>
      call<{ invitation: Invitation }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
        token: owner,
        body: { name: "Tara Singh", phone: "9530000099", role: "staff", ...(department !== undefined ? { department } : {}) },
      });
    expect((await invite("sales")).status).toBe(201);
    const sales = (await call<{ id: string; list: string; key: string }[]>(t.app, "GET", `/workspaces/${ws}/options`, { token: owner })).body.data.find(
      (o) => o.list === "department" && o.key === "sales",
    )!;
    await call(t.app, "PATCH", `/workspaces/${ws}/options/${sales.id}`, { token: owner, body: { archived: true } });
    const again = await invite("sales");
    expect(again.status).toBe(201);
    expect(again.body.data.invitation.department).toBe("sales");

    // A manager with Business settings but not Payments saves the business profile, UPI ID included.
    await call(t.app, "POST", `/workspaces/${ws}/options`, { token: owner, body: { list: "department", label: "Office" } });
    const office = (await call<{ list: string; key: string; label: string }[]>(t.app, "GET", `/workspaces/${ws}/options`, { token: owner })).body.data.find(
      (o) => o.list === "department" && o.label === "Office",
    )!;
    await b.access(mona, { department: office.key, extraAreas: ["settings"] });
    const save = await call(t.app, "PATCH", `/workspaces/${ws}`, { token: mona.token, body: { name: "953 Studio", upiId: "" } });
    expect(save.status).toBe(200);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}`, { token: mona.token, body: { billPrefix: "INV" } })).status).toBe(403);

    // An events-only manager's booking value is left out.
    const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: mona.token,
      body: { newClient: { name: "Rao Family", phone: "9833344477" }, title: "Rao wedding", value: "75000", functions: [{ name: "Wedding", date: "2026-12-14" }] },
    });
    expect(event.status).toBe(201);
    expect((await call<{ value: number | null }>(t.app, "GET", `/workspaces/${ws}/events/${event.body.data.id}`, { token: owner })).body.data.value).toBeNull();
  });
});

describe("extra screens and department screens", () => {
  it("an extra screen works straight away, and goes as soon as it's switched off", async () => {
    const b = await business("944");
    const { arfin } = b;
    await b.access(arfin, { department: "sales" });
    expect((await get(b, arfin.token, "/payments")).status).toBe(403);

    const on = await b.access(arfin, { extraAreas: ["money"] });
    expect(on.status).toBe(200);
    expect(on.body.data.extraAreas).toEqual(["money"]);
    expect(on.body.data.permissions).toContain("finance.view");
    expect((await get(b, arfin.token, "/payments")).status).toBe(200);
    expect((await b.me(arfin.token)).areas).toEqual(["leads", "quotes", "events", "money"]);

    await b.access(arfin, { extraAreas: [] });
    expect((await get(b, arfin.token, "/payments")).status).toBe(403);

    // Team gives Staff nothing, so it can't be switched on for them.
    const team = await b.access(arfin, { extraAreas: ["team"] });
    expect(team.status).toBe(400);
    expect(team.body.error.message).toBe("Team needs the Manager role");
  });

  it("a department's screens change on the next request, and reset back to its starting screens", async () => {
    const b = await business("945");
    const { owner, ws, arfin } = b;
    await b.access(arfin, { department: "sales" });

    const set = await call<{ areas: string[]; isDefault: boolean }>(t.app, "PUT", `/workspaces/${ws}/departments/sales/access`, {
      token: owner,
      body: { areas: ["leads", "quotes", "events", "money"] },
    });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ areas: ["leads", "quotes", "events", "money"], isDefault: false });
    expect((await get(b, arfin.token, "/payments")).status).toBe(200);
    expect((await b.me(arfin.token)).permissions).toContain("payments.record");

    const reset = await call<{ areas: string[]; isDefault: boolean }>(t.app, "DELETE", `/workspaces/${ws}/departments/sales/access`, { token: owner });
    expect(reset.body.data).toMatchObject({ areas: ["leads", "quotes", "events"], isDefault: true });
    expect((await get(b, arfin.token, "/payments")).status).toBe(403);
    const all = await call<{ department: string; areas: string[]; isDefault: boolean }[]>(t.app, "GET", `/workspaces/${ws}/departments/access`, { token: owner });
    expect(all.body.data.find((d) => d.department === "sales")).toEqual({ department: "sales", areas: ["leads", "quotes", "events"], isDefault: true });
  });

  it("keeps people placed before department screens on their usual access until the owner turns them on", async () => {
    const b = await business("946");
    const { owner, ws, arfin } = b;
    await b.access(arfin, { department: "sales" });
    // As if he was put in Sales before departments decided screens.
    await t.db.query(`UPDATE member_details SET department_on = false WHERE membership_id = $1`, [arfin.id]);

    const before = await b.me(arfin.token);
    expect(before).toMatchObject({ department: "sales", departmentOn: false, accessSource: "role" });
    expect([...before.permissions].sort()).toEqual([...ROLE_GRANTS.staff].sort());
    expect((await get(b, arfin.token, "/quotes")).status).toBe(403);

    const applied = await call<{ applied: number }>(t.app, "POST", `/workspaces/${ws}/departments/apply`, { token: owner, body: { memberIds: [arfin.id] } });
    expect(applied.body.data).toEqual({ applied: 1 });
    const after = await b.me(arfin.token);
    expect(after).toMatchObject({ department: "sales", departmentOn: true, accessSource: "department", areas: ["leads", "quotes", "events"] });
    expect((await get(b, arfin.token, "/quotes")).status).toBe(200);
    // Already on: nothing to do.
    expect((await call<{ applied: number }>(t.app, "POST", `/workspaces/${ws}/departments/apply`, { token: owner, body: { memberIds: [arfin.id] } })).body.data).toEqual({ applied: 0 });
  });
});

describe("only the owner decides screens", () => {
  it("refuses a manager changing a department's screens, someone's access or the departments", async () => {
    const b = await business("947");
    const { owner, ws, mona, arfin } = b;
    const asMona = (method: "PUT" | "DELETE" | "POST" | "PATCH", url: string, body?: unknown) =>
      call(t.app, method, `/workspaces/${ws}${url}`, { token: mona.token, body });

    expect((await asMona("PUT", "/departments/sales/access", { areas: ["leads"] })).status).toBe(403);
    expect((await asMona("DELETE", "/departments/sales/access")).status).toBe(403);
    expect((await asMona("POST", "/departments/apply", { memberIds: [arfin.id] })).status).toBe(403);
    expect((await asMona("PUT", `/members/${arfin.id}/access`, { department: "sales" })).status).toBe(403);
    expect((await asMona("PUT", `/members/${arfin.id}/access`, { extraAreas: ["money"] })).status).toBe(403);
    expect((await asMona("POST", "/options", { list: "department", label: "Shoots" })).status).toBe(403);
    const sales = (await call<{ id: string; list: string; key: string }[]>(t.app, "GET", `/workspaces/${ws}/options`, { token: owner })).body.data.find(
      (o) => o.list === "department" && o.key === "sales",
    )!;
    expect((await asMona("PATCH", `/options/${sales.id}`, { label: "Sales team" })).status).toBe(403);
    // Nothing changed.
    expect((await b.me(arfin.token)).department).toBeNull();
  });
});

describe("invites and departments", () => {
  it("someone invited into Sales has the Sales screens from their first sign-in", async () => {
    const b = await business("948");
    const { owner, ws } = b;
    const inv = await call<{ token: string; invitation: Invitation }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Neel Sales", phone: "9480000010", role: "staff", department: "sales" },
    });
    expect(inv.status).toBe(201);
    expect(inv.body.data.invitation).toMatchObject({ department: "sales", departmentLabel: "Sales" });
    const neel = await signIn(t.app, "9480000010");
    expect((await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: neel })).status).toBe(200);

    const first = await b.me(neel);
    expect(first).toMatchObject({ role: "staff", department: "sales", departmentLabel: "Sales", departmentOn: true, accessSource: "department" });
    expect(first.areas).toEqual(["leads", "quotes", "events"]);
    expect(first.permissions).toContain("quotes.manage");
    expect(first.permissions).not.toContain("finance.view");
  });

  it("sending an invite again keeps its department, even when a manager sends it", async () => {
    const b = await business("949");
    const { owner, ws, mona } = b;
    const body = { name: "Tara Singh", phone: "9490000010", role: "staff" };
    await call(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { ...body, department: "sales" } });

    // A manager can't choose a department, but sending it again keeps the owner's.
    expect((await call(t.app, "POST", `/workspaces/${ws}/invitations`, { token: mona.token, body: { ...body, department: "admin" } })).status).toBe(403);
    const again = await call<{ token: string; invitation: Invitation }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: mona.token, body });
    expect(again.status).toBe(201);
    expect(again.body.data.invitation).toMatchObject({ department: "sales", departmentLabel: "Sales" });
    const waiting = (await call<{ invitations: Invitation[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.invitations;
    expect(waiting.map((i) => i.department)).toEqual(["sales"]);

    const tara = await signIn(t.app, body.phone);
    await call(t.app, "POST", `/invitations/${again.body.data.token}/accept`, { token: tara });
    expect(await b.me(tara)).toMatchObject({ department: "sales", departmentOn: true, accessSource: "department" });
  });

  it("someone who rejoins keeps their old department with its screens off, and loses their extras", async () => {
    const b = await business("950");
    const { owner, ws, arfin, members } = b;
    await b.access(arfin, { department: "sales", extraAreas: ["money"] });
    const rejoin = async (department?: string) => {
      expect((await call(t.app, "DELETE", `/workspaces/${ws}/members/${(await members()).find((m) => m.userId === arfin.userId)!.id}`, { token: owner })).status).toBe(200);
      const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
        token: owner,
        body: { name: "Arfin Khan", phone: "9500000003", role: "staff", ...(department ? { department } : {}) },
      });
      expect((await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: arfin.token })).status).toBe(200);
      return (await members()).find((m) => m.userId === arfin.userId)!;
    };

    const back = await rejoin();
    expect(back).toMatchObject({ department: "sales", departmentOn: false, accessSource: "role", extraAreas: [] });
    expect(await b.me(arfin.token)).toMatchObject({ department: "sales", departmentOn: false, accessSource: "role" });
    expect((await get(b, arfin.token, "/payments")).status).toBe(403);

    // An invitation that names a department turns its screens on.
    const moved = await rejoin("accountant");
    expect(moved).toMatchObject({ department: "accountant", departmentOn: true, accessSource: "department" });
    expect((await get(b, arfin.token, "/payments")).status).toBe(200);
  });
});

describe("the same answer everywhere", () => {
  it("/auth/me and the business agree on everyone's access", async () => {
    const b = await business("951");
    const { owner, ws, mona, arfin, kavya, ravi } = b;
    await b.access(mona, { department: "sales" });
    await b.access(arfin, { department: "sales", extraAreas: ["money"] });
    await b.access(kavya, { department: "accountant" });
    const fields = (a: Access) => ({
      role: a.role,
      permissions: a.permissions,
      areas: a.areas,
      accessSource: a.accessSource,
      department: a.department,
      departmentLabel: a.departmentLabel,
      departmentOn: a.departmentOn,
    });
    for (const token of [owner, mona.token, arfin.token, kavya.token, ravi.token]) {
      const fromMe = await b.me(token);
      const fromWorkspace = await call<Access>(t.app, "GET", `/workspaces/${ws}`, { token });
      expect(fields(fromWorkspace.body.data)).toEqual(fields(fromMe));
    }
    // And the team list says the same about each person.
    const team = await b.members();
    const arfinRow = team.find((m) => m.userId === arfin.userId)!;
    expect(fields(arfinRow)).toEqual(fields(await b.me(arfin.token)));
    expect(arfinRow).toMatchObject({ departmentAreas: ["leads", "quotes", "events"], extraAreas: ["money"] });
  });
});
