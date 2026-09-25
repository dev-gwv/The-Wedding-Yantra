import { billNumber, financialYear } from "@wedding-yantra/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Bill = {
  id: string;
  number: string;
  status: string;
  payState: string;
  overdue: boolean;
  total: number;
  received: number;
  due: number;
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  roundOff: number;
  chargesGst: boolean;
  interState: boolean;
  placeOfSupply: string | null;
  shareToken: string;
  eventId: string | null;
  issueDate: string;
  dueDate: string | null;
  byRate: { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[];
  items: { name: string; sac: string | null; taxable: number; cgst: number; sgst: number; igst: number }[];
  payments: { number: string; amount: number }[];
};
type Payment = { id: string; number: string; amount: number; billId: string | null; eventId: string | null };
type Draft = {
  eventId: string;
  clientId: string;
  quoteId: string | null;
  billTo: { name: string; phone: string | null; address: string | null; gstin: string | null };
  issueDate: string;
  dueDate: string | null;
  items: { name: string; sac: string | null; unit: string; quantity: number; rate: number; taxRate: number }[];
  discount: number;
  terms: string | null;
  chargesGst: boolean;
  homeState: string | null;
  advance: number;
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
    manager: await join(`${prefix}0000002`, "manager"),
    staff: await join(`${prefix}0000003`, "staff"),
    accountant: await join(`${prefix}0000004`, "accountant"),
  };
}

const QUOTE_LINES = [
  { name: "Bridal HD makeup", unit: "event", quantity: 1, rate: 25000, taxRate: 18 },
  { name: "Family makeup", unit: "person", quantity: 4, rate: 3500, taxRate: 18 },
  { name: "Makeup trial", unit: "event", quantity: 1, rate: 3000, taxRate: 5 },
];

/** A lead whose client accepted a quote: returns the booked event. */
async function booking(owner: string, ws: string, bridalServiceId: string) {
  const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
    token: owner,
    body: { name: "Neha Kapoor", phone: "9811122233", eventType: "wedding", eventDate: "2099-12-05" },
  });
  const items = QUOTE_LINES.map((l, i) => (i === 0 ? { ...l, catalogueItemId: bridalServiceId } : l));
  const quote = await call<{ id: string; shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
    token: owner,
    body: { leadId: lead.body.data.id, title: "Wedding makeup", items, discount: 2000 },
  });
  await call(t.app, "POST", `/public/quotes/${quote.body.data.shareToken}/accept`, { body: { name: "Neha Kapoor" } });
  const booked = await call<{ eventId: string }>(t.app, "GET", `/workspaces/${ws}/leads/${lead.body.data.id}`, { token: owner });
  return { eventId: booked.body.data.eventId, quoteId: quote.body.data.id };
}

describe("GST bills and payments", () => {
  it("bills a booking with GST, keeps the advance and collects the balance", async () => {
    const { owner, ws } = await team("981");
    await call(t.app, "PATCH", `/workspaces/${ws}`, {
      token: owner,
      body: { gstin: "08ABCDE1234F1Z5", upiId: "riya@okhdfc", billPrefix: "rms", billTerms: "Bank: HDFC 1234" },
    });
    const bridal = await firstService(owner, ws);
    await call(t.app, "PATCH", `/workspaces/${ws}/catalogue/${bridal.id}`, { token: owner, body: { sac: "999722" } });
    const { eventId, quoteId } = await booking(owner, ws, bridal.id);

    // An advance before any bill waits on the event.
    const advance = await call<Payment>(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { eventId, amount: 20000, paidOn: "2026-09-25", method: "upi", reference: "UTR123" },
    });
    expect(advance.status).toBe(201);
    expect(advance.body.data).toMatchObject({ number: "R-0001", billId: null, eventId });

    const draft = await call<Draft>(t.app, "GET", `/workspaces/${ws}/bill-draft?eventId=${eventId}`, { token: owner });
    expect(draft.body.data).toMatchObject({
      quoteId,
      billTo: { name: "Neha Kapoor", phone: "+919811122233" },
      dueDate: "2099-12-05",
      discount: 2000,
      terms: "Bank: HDFC 1234",
      chargesGst: true,
      homeState: "08",
      advance: 20000,
    });
    expect(draft.body.data.items.map((i) => i.taxRate)).toEqual([18, 18, 5]);

    const { billTo, issueDate, dueDate, items, discount, terms } = draft.body.data;
    const made = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId, quoteId, billTo, issueDate, dueDate, items, discount, terms },
    });
    expect(made.status).toBe(201);
    const bill = made.body.data;
    // Same numbers as the shared maths test in packages/core.
    expect(bill).toMatchObject({
      number: billNumber("RMS", financialYear(issueDate), 1),
      chargesGst: true,
      interState: false,
      placeOfSupply: "08",
      subtotal: 42000,
      discount: 2000,
      taxable: 40000,
      cgst: 3414.29,
      sgst: 3414.28,
      igst: 0,
      tax: 6828.57,
      roundOff: 0.43,
      total: 46829,
      received: 20000,
      due: 26829,
      payState: "part_paid",
      overdue: false,
    });
    expect(bill.items[0]).toMatchObject({ name: "Bridal HD makeup", sac: "999722", cgst: 2142.86, sgst: 2142.85 });
    expect(bill.byRate.map((r) => r.rate)).toEqual([5, 18]);
    expect(bill.payments.map((p) => p.number)).toEqual(["R-0001"]);

    // An event in Goa is billed with IGST.
    const goa = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${bill.id}`, { token: owner, body: { placeOfSupply: "30" } });
    expect(goa.body.data).toMatchObject({ interState: true, cgst: 0, sgst: 0, igst: 6828.57, total: 46829, dueDate: "2099-12-05" });

    // The balance, recorded against the event, lands on the open bill.
    const balance = await call<Payment>(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { eventId, amount: 26829, paidOn: "2026-10-01", method: "cash" },
    });
    expect(balance.body.data.billId).toBe(bill.id);
    const paid = await call<Bill>(t.app, "GET", `/workspaces/${ws}/bills/${bill.id}`, { token: owner });
    expect(paid.body.data).toMatchObject({ payState: "paid", due: 0, received: 46829 });

    const money = await call<{ billed: number; expected: number; received: number; due: number; payments: unknown[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/events/${eventId}/money`,
      { token: owner },
    );
    expect(money.body.data).toMatchObject({ billed: 46829, expected: 46829, received: 46829, due: 0 });
    expect(money.body.data.payments).toHaveLength(2);

    // The client's link shows the bill, how to pay and what was received, nothing internal.
    const pub = await call<{ business: { upiId: string | null }; bill: Record<string, unknown> & { payments: unknown[] } }>(
      t.app,
      "GET",
      `/public/bills/${bill.shareToken}`,
    );
    expect(pub.body.data.business.upiId).toBe("riya@okhdfc");
    expect(pub.body.data.bill).not.toHaveProperty("shareToken");
    expect(pub.body.data.bill).not.toHaveProperty("eventId");
    expect(pub.body.data.bill.payments).toEqual([
      { number: "R-0001", amount: 20000, paidOn: "2026-09-25", method: "upi" },
      { number: "R-0002", amount: 26829, paidOn: "2026-10-01", method: "cash" },
    ]);

    const overview = await call<{ toCollect: number; receivedThisMonth: number }>(t.app, "GET", `/workspaces/${ws}/money`, { token: owner });
    expect(overview.body.data.toCollect).toBe(0);
  });

  it("numbers bills per financial year and moves money off a cancelled bill", async () => {
    const { owner, ws } = await team("982");
    const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Sharma Family", phone: "9833344455" }, title: "Sharma wedding", value: "50000", functions: [{ name: "Wedding", date: "2020-01-10" }] },
    });
    const eventId = event.body.data.id;

    // A booking with a value but no bill is money to collect, overdue once the day has passed.
    const before = await call<{ toCollect: number; overdue: number; dues: { kind: string; due: number; overdue: boolean }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/money`,
      { token: owner },
    );
    expect(before.body.data).toMatchObject({ toCollect: 50000, overdue: 50000 });
    expect(before.body.data.dues).toEqual([expect.objectContaining({ kind: "event", due: 50000, overdue: true })]);

    const lines = [{ name: "Wedding decor", unit: "event", quantity: 1, rate: 50000, taxRate: 18 }];
    const make = (issueDate: string) =>
      call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
        token: owner,
        body: { eventId, billTo: { name: "Sharma Family" }, issueDate, items: lines },
      });

    const march = await make("2026-03-31");
    const april = await make("2026-04-01");
    const april2 = await make("2026-04-02");
    expect([march, april, april2].map((b) => b.body.data.number)).toEqual(["INV/25-26/0001", "INV/26-27/0001", "INV/26-27/0002"]);
    // No GST number: no GST, whatever the lines say.
    expect(march.body.data).toMatchObject({ chargesGst: false, tax: 0, total: 50000, placeOfSupply: null });

    const bad = await call(t.app, "PATCH", `/workspaces/${ws}/bills/${april.body.data.id}`, { token: owner, body: { issueDate: "2026-03-30" } });
    expect(bad.status).toBe(400);
    const early = await call(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId, billTo: { name: "Sharma Family" }, issueDate: "2026-04-05", dueDate: "2026-04-01", items: lines },
    });
    expect(early.status).toBe(400);
    expect(early.body.error.fields).toHaveProperty("dueDate");

    const pay = await call<Payment>(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { billId: april.body.data.id, amount: 10000, paidOn: "2026-04-02", method: "bank" },
    });
    expect(pay.body.data.billId).toBe(april.body.data.id);

    const cancelled = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills/${april.body.data.id}/cancel`, {
      token: owner,
      body: { reason: "Wrong amount" },
    });
    expect(cancelled.body.data).toMatchObject({ status: "cancelled", due: 0, received: 0, number: "INV/26-27/0001" });
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/bills/${april.body.data.id}`, { token: owner, body: { notes: "x" } })).status).toBe(409);
    expect(
      (await call(t.app, "POST", `/workspaces/${ws}/payments`, {
        token: owner,
        body: { billId: april.body.data.id, amount: 5, paidOn: "2026-04-02", method: "cash" },
      })).status,
    ).toBe(409);

    // Cancel the others; the next bill for the event picks the freed payment up.
    for (const b of [march, april2]) await call(t.app, "POST", `/workspaces/${ws}/bills/${b.body.data.id}/cancel`, { token: owner, body: {} });
    const open = await call<Bill[]>(t.app, "GET", `/workspaces/${ws}/bills?eventId=${eventId}&status=open`, { token: owner });
    expect(open.body.data).toEqual([]);
    const fresh = await make("2026-04-10");
    expect(fresh.body.data.number).toBe("INV/26-27/0003");
    expect(fresh.body.data).toMatchObject({ received: 10000, due: 40000, payState: "part_paid" });

    // Deleting a payment puts the money back to collect.
    await call(t.app, "DELETE", `/workspaces/${ws}/payments/${pay.body.data.id}`, { token: owner });
    const after = await call<Bill>(t.app, "GET", `/workspaces/${ws}/bills/${fresh.body.data.id}`, { token: owner });
    expect(after.body.data).toMatchObject({ received: 0, due: 50000, payState: "unpaid", overdue: false });
  });

  it("lets owners and managers handle money, accountants look, and staff nothing", async () => {
    const { owner, manager, staff, accountant, ws } = await team("983");
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Walk In", phone: "9844455566" } });
    const body = { clientId: client.body.data.id, billTo: { name: "Walk In" }, issueDate: "2026-09-25", items: [{ name: "Party makeup", unit: "person", quantity: 2, rate: 2500 }] };

    expect((await call(t.app, "POST", `/workspaces/${ws}/bills`, { token: staff, body })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/bills`, { token: accountant, body })).status).toBe(403);
    const made = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: manager, body });
    expect(made.status).toBe(201);

    const payment = { billId: made.body.data.id, amount: 5000, paidOn: "2026-09-25", method: "cash" };
    expect((await call(t.app, "POST", `/workspaces/${ws}/payments`, { token: accountant, body: payment })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/payments`, { token: manager, body: payment })).status).toBe(201);

    expect((await call(t.app, "GET", `/workspaces/${ws}/bills`, { token: accountant })).status).toBe(200);
    expect((await call(t.app, "GET", `/workspaces/${ws}/money`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/bills/${made.body.data.id}`, { token: staff })).status).toBe(403);

    const ownerHome = await call<{ money: unknown }>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner });
    const staffHome = await call<{ money: unknown }>(t.app, "GET", `/workspaces/${ws}/home`, { token: staff });
    expect(ownerHome.body.data.money).toMatchObject({ toCollect: 0 });
    expect(staffHome.body.data.money).toBeNull();
  });

  it("keeps bills and payments inside their own business", async () => {
    const a = await team("984");
    const b = await team("985");
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${a.ws}/clients`, { token: a.owner, body: { name: "Private Client" } });
    const bill = await call<Bill>(t.app, "POST", `/workspaces/${a.ws}/bills`, {
      token: a.owner,
      body: { clientId: client.body.data.id, billTo: { name: "Private Client" }, issueDate: "2026-09-25", items: [{ name: "Decor", unit: "event", quantity: 1, rate: 1000 }] },
    });

    expect((await call(t.app, "GET", `/workspaces/${b.ws}/bills/${bill.body.data.id}`, { token: b.owner })).status).toBe(404);
    expect((await call(t.app, "GET", `/workspaces/${a.ws}/bills`, { token: b.owner })).status).toBe(404);
    const steal = await call(t.app, "POST", `/workspaces/${b.ws}/payments`, {
      token: b.owner,
      body: { billId: bill.body.data.id, amount: 1, paidOn: "2026-09-25", method: "cash" },
    });
    expect(steal.status).toBe(400);
    const other = await call(t.app, "POST", `/workspaces/${b.ws}/bills`, {
      token: b.owner,
      body: { clientId: client.body.data.id, billTo: { name: "X Y" }, issueDate: "2026-09-25", items: [{ name: "Decor", unit: "event", quantity: 1, rate: 1 }] },
    });
    expect(other.status).toBe(400);
    const bills = await call<Bill[]>(t.app, "GET", `/workspaces/${b.ws}/bills`, { token: b.owner });
    expect(bills.body.data).toEqual([]);
  });
});

async function firstService(owner: string, ws: string) {
  const list = await call<{ id: string; name: string }[]>(t.app, "GET", `/workspaces/${ws}/catalogue`, { token: owner });
  const item = list.body.data.find((i) => i.name === "Bridal HD makeup");
  if (!item) throw new Error("starter price list missing Bridal HD makeup");
  return item;
}
