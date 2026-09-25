import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

function day(days: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + days * 86_400_000));
}

type Vendor = { id: string; name: string; owed: number; paid: number; upiId: string | null; payouts: { id: string; status: string }[] };
type Payout = { id: string; status: string; late: boolean; amount: number; vendorName: string; eventTitle: string | null; paidOn: string | null; method: string | null };
type Money = { spent: number; profit: number; toPay: number; revenue: number };

describe("vendors and payouts", () => {
  it("tracks what each event owes vendors, and paying one counts in the event's profit", async () => {
    const owner = await signIn(t.app, "9750000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Bloom Decor");
    const join = async (phone: string, role: string) => {
      const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: role, phone, role } });
      const token = await signIn(t.app, phone);
      await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
      return token;
    };
    const staff = await join("9750000002", "staff");
    const accountant = await join("9750000003", "accountant");

    const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { title: "Rao wedding", value: 200000, newClient: { name: "Kavya Rao" }, functions: [{ name: "Wedding", date: day(5) }] },
    });
    const eventId = event.body.data.id;

    // Vendors: the owner adds them; staff can't see money; the accountant reads.
    expect((await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: staff, body: { name: "Ramesh Florist" } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Ramesh", upiId: "not-upi" } })).status).toBe(400);
    const florist = await call<Vendor>(t.app, "POST", `/workspaces/${ws}/vendors`, {
      token: owner,
      body: { name: "Ramesh Florist", service: "Flowers", phone: "9750000010", upiId: "ramesh@okaxis" },
    });
    expect(florist.status).toBe(201);
    const genset = await call<Vendor>(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Shiv Generators" } });
    expect((await call(t.app, "GET", `/workspaces/${ws}/vendors`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/vendors`, { token: accountant })).status).toBe(200);

    const add = (body: object, token = owner) => call<Payout>(t.app, "POST", `/workspaces/${ws}/payouts`, { token, body });
    const flowers = await add({ vendorId: florist.body.data.id, eventId, description: "Mandap flowers", amount: 45000, dueDate: day(-1) });
    expect(flowers.status).toBe(201);
    expect(flowers.body.data).toMatchObject({ status: "owed", late: true, vendorName: "Ramesh Florist", eventTitle: "Rao wedding" });
    const power = await add({ vendorId: genset.body.data.id, eventId, description: "Generator, 2 days", amount: 12000 });
    expect((await add({ vendorId: florist.body.data.id, description: "Extra flowers", amount: 1000 }, accountant)).status).toBe(403);
    expect((await add({ vendorId: eventId, description: "Wrong", amount: 1000 })).body.error.fields?.vendorId).toBeTruthy();

    const money = () => call<Money>(t.app, "GET", `/workspaces/${ws}/events/${eventId}/money`, { token: owner });
    expect((await money()).body.data).toMatchObject({ spent: 0, toPay: 57000 });
    const overview = await call<{ toPay: number }>(t.app, "GET", `/workspaces/${ws}/money`, { token: owner });
    expect(overview.body.data.toPay).toBe(57000);

    // Paid: an approved "Vendors & helpers" expense on the event, counted in profit.
    const paid = await call<Payout>(t.app, "POST", `/workspaces/${ws}/payouts/${flowers.body.data.id}/pay`, {
      token: owner,
      body: { paidOn: day(0), method: "upi", reference: "UTR99" },
    });
    expect(paid.body.data).toMatchObject({ status: "paid", late: false, paidOn: day(0), method: "upi" });
    expect((await call(t.app, "POST", `/workspaces/${ws}/payouts/${flowers.body.data.id}/pay`, { token: owner, body: { paidOn: day(0), method: "cash" } })).status).toBe(409);
    const after = (await money()).body.data;
    expect(after).toMatchObject({ spent: 45000, toPay: 12000 });
    expect(after.profit).toBe(after.revenue - 45000);
    const expenses = await call<{ category: string; amount: number; paidTo: string; status: string; id: string }[]>(
      t.app,
      "GET",
      `/workspaces/${ws}/expenses?eventId=${eventId}`,
      { token: owner },
    );
    expect(expenses.body.data).toEqual([expect.objectContaining({ category: "vendor", amount: 45000, paidTo: "Ramesh Florist", status: "approved" })]);
    // That expense changes only from Vendors.
    const expenseId = expenses.body.data[0]!.id;
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/expenses/${expenseId}`, { token: owner, body: { amount: 1 } })).body.error.code).toBe("EXPENSE_FROM_PAYOUT");
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/expenses/${expenseId}`, { token: owner })).status).toBe(409);

    // Changing a paid payout keeps its expense in step.
    await call(t.app, "PATCH", `/workspaces/${ws}/payouts/${flowers.body.data.id}`, { token: owner, body: { amount: 48000 } });
    expect((await money()).body.data.spent).toBe(48000);

    const vendor = await call<Vendor>(t.app, "GET", `/workspaces/${ws}/vendors/${florist.body.data.id}`, { token: owner });
    expect(vendor.body.data).toMatchObject({ owed: 0, paid: 48000 });
    expect(vendor.body.data.payouts).toHaveLength(1);
    const owedList = await call<Payout[]>(t.app, "GET", `/workspaces/${ws}/payouts?status=owed`, { token: owner });
    expect(owedList.body.data.map((p) => p.vendorName)).toEqual(["Shiv Generators"]);

    // A vendor still owed money can't be removed.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/vendors/${genset.body.data.id}`, { token: owner })).body.error.code).toBe("VENDOR_OWED");

    // Undo: owed again, and the expense is gone.
    await call(t.app, "POST", `/workspaces/${ws}/payouts/${flowers.body.data.id}/unpay`, { token: owner });
    expect((await money()).body.data).toMatchObject({ spent: 0, toPay: 60000 });
    await call(t.app, "POST", `/workspaces/${ws}/payouts/${power.body.data.id}/pay`, { token: owner, body: { paidOn: day(0), method: "cash" } });
    await call(t.app, "DELETE", `/workspaces/${ws}/payouts/${power.body.data.id}`, { token: owner });
    expect((await money()).body.data).toMatchObject({ spent: 0, toPay: 48000 });

    const log = await call<{ items: { action: string; other: string | null; amount: number | null; subject: string | null }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/activity`,
      { token: owner },
    );
    expect(log.body.data.items.filter((i) => i.action === "payout.paid").map((i) => [i.other, i.amount, i.subject])).toEqual([
      ["Shiv Generators", 12000, "Rao wedding"],
      ["Ramesh Florist", 45000, "Rao wedding"],
    ]);

    // Another business sees none of it.
    const other = await signIn(t.app, "9750000099");
    const otherWs = await createBusiness(t.app, other, "Elsewhere");
    expect((await call(t.app, "GET", `/workspaces/${otherWs}/vendors/${florist.body.data.id}`, { token: other })).status).toBe(404);
    expect((await call(t.app, "POST", `/workspaces/${otherWs}/payouts/${flowers.body.data.id}/pay`, { token: other, body: { paidOn: day(0), method: "upi" } })).status).toBe(404);
  });
});
