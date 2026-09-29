import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Payment = { amount: number; clientName: string | null; clientPhone: string | null; eventTitle: string | null; billNumber: string | null };
type BillSummary = { id: string; clientName: string; clientPhone: string | null; total: number };
type Summary = { count: number; total: number; received: number; due: number };
type Overview = { receivedThisMonth: number; toCollect: number; dues: { kind: string; clientName: string; due: number }[] };

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const event = (title: string, name: string, phone: string) =>
    call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name, phone }, title, value: "200000", functions: [{ name: "Wedding", date: "2099-12-05" }] },
    }).then((r) => r.body.data.id);
  return { owner, ws, event };
}

describe("the Received and Invoices lists", () => {
  it("counts an advance with no invoice as received, and shows who paid and for what", async () => {
    const { owner, ws, event } = await business("913");
    // The business works in India time.
    const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const sharma = await event("Sharma wedding", "Sharma Family", "9833344455");
    const verma = await event("Verma wedding", "Verma Family", "9822211100");

    // Sharma paid an advance on the booking; there's no invoice yet.
    const advance = await call(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { eventId: sharma, amount: 10400, paidOn: today, method: "upi" },
    });
    expect(advance.status).toBe(201);
    // Verma has an invoice with part of it paid.
    const bill = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId: verma, billTo: { name: "Verma Family" }, issueDate: today, items: [{ name: "Decor", unit: "event", quantity: 1, rate: 100000 }] },
    });
    expect(bill.status).toBe(201);
    await call(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { billId: bill.body.data.id, amount: 25000, paidOn: today, method: "cash" },
    });

    const range = `from=${today}&to=${today}`;
    const received = await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?${range}`, { token: owner });
    expect(received.body.data).toHaveLength(2);
    const onBooking = received.body.data.find((p) => p.amount === 10400)!;
    expect(onBooking).toMatchObject({ clientName: "Sharma Family", clientPhone: "+919833344455", eventTitle: "Sharma wedding", billNumber: null });
    // The event comes through the invoice when the payment is against one.
    expect(received.body.data.find((p) => p.amount === 25000)).toMatchObject({ clientName: "Verma Family", eventTitle: "Verma wedding" });

    // Received on these dates is every payment: the same figure Home shows for this month.
    const total = received.body.data.reduce((a, p) => a + p.amount, 0);
    const overview = await call<Overview>(t.app, "GET", `/workspaces/${ws}/money`, { token: owner });
    expect(total).toBe(35400);
    expect(overview.body.data.receivedThisMonth).toBe(35400);
    // Invoices on these dates only count Verma's invoice.
    const invoices = await call<Summary>(t.app, "GET", `/workspaces/${ws}/bills/summary?${range}`, { token: owner });
    expect(invoices.body.data).toMatchObject({ count: 1, total: 100000, received: 25000, due: 75000 });
    // To collect has the unpaid invoice and the booking with no invoice.
    expect(overview.body.data.dues.map((d) => [d.kind, d.clientName, d.due]).sort()).toEqual([
      ["bill", "Verma Family", 75000],
      ["event", "Sharma Family", 189600],
    ]);

    // Search by phone finds the payment and the invoice.
    const byPhone = await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?q=9833344455`, { token: owner });
    expect(byPhone.body.data.map((p) => p.amount)).toEqual([10400]);
    const byEvent = await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?q=Verma%20wedding`, { token: owner });
    expect(byEvent.body.data.map((p) => p.amount)).toEqual([25000]);
    const bills = await call<BillSummary[]>(t.app, "GET", `/workspaces/${ws}/bills?q=98222`, { token: owner });
    expect(bills.body.data.map((b) => [b.clientName, b.clientPhone])).toEqual([["Verma Family", "+919822211100"]]);
  });
});
