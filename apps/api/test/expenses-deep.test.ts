import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Expense = {
  id: string;
  amount: number;
  status: string;
  method: string | null;
  methodLabel: string | null;
  paidBy: { id: string; name: string | null } | null;
  reimbursedAt: string | null;
  vendorId: string | null;
  vendorName: string | null;
  gstRate: number | null;
  gstAmount: number;
  vendorInvoiceNo: string | null;
};
type Summary = {
  count: number;
  spent: number;
  pending: number;
  pendingCount: number;
  toReimburse: number;
  gst: number;
  byCategory: { category: string; label: string; total: number }[];
};

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const staff = await join(`${prefix}0000002`, "staff", "Staff Person");
  const other = await join(`${prefix}0000003`, "staff", "Other Staff");
  const members = await call<{ members: { userId: string; name: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
  const idOf = (name: string) => members.body.data.members.find((m) => m.name === name)!.userId;
  return { owner, ws, staff, other, ownerId: idOf("Owner Person"), staffId: idOf("Staff Person"), otherId: idOf("Other Staff") };
}

const today = new Date().toISOString().slice(0, 10);

describe("expenses in depth", () => {
  it("works out the GST inside the amount, or takes what the bill says", async () => {
    const { owner, ws } = await team("941");
    const add = (body: object) =>
      call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, { token: owner, body: { category: "materials", spentOn: today, ...body } });

    const at18 = await add({ amount: 1180, gstRate: 18, vendorInvoiceNo: "INV/245", method: "upi" });
    expect(at18.status).toBe(201);
    expect(at18.body.data).toMatchObject({ gstRate: 18, gstAmount: 180, vendorInvoiceNo: "INV/245", method: "upi", methodLabel: "UPI" });

    const typed = await add({ amount: 500, gstAmount: 40 });
    expect(typed.body.data).toMatchObject({ gstRate: null, gstAmount: 40 });

    // GST can't be more than what was paid.
    const tooMuch = await add({ amount: 100, gstAmount: 150 });
    expect(tooMuch.status).toBe(400);

    // Changing the amount works the GST out again from the rate.
    const changed = await call<Expense>(t.app, "PATCH", `/workspaces/${ws}/expenses/${at18.body.data.id}`, { token: owner, body: { amount: 2360 } });
    expect(changed.body.data.gstAmount).toBe(360);
    // Turning GST off clears it.
    const off = await call<Expense>(t.app, "PATCH", `/workspaces/${ws}/expenses/${at18.body.data.id}`, {
      token: owner,
      body: { gstRate: null, gstAmount: 0 },
    });
    expect(off.body.data).toMatchObject({ gstRate: null, gstAmount: 0 });

    // An unknown payment mode is refused.
    expect((await add({ amount: 10, method: "x_nope" })).status).toBe(400);
  });

  it("links a vendor from the list, and only from this business", async () => {
    const { owner, ws } = await team("942");
    const other = await team("943");
    const florist = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/vendors`, { token: owner, body: { name: "Ramesh Florist" } });
    const theirs = await call<{ id: string }>(t.app, "POST", `/workspaces/${other.ws}/vendors`, { token: other.owner, body: { name: "Not yours" } });

    const x = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: owner,
      body: { amount: 2000, category: "vendor", spentOn: today, vendorId: florist.body.data.id },
    });
    expect(x.status).toBe(201);
    expect(x.body.data).toMatchObject({ vendorId: florist.body.data.id, vendorName: "Ramesh Florist" });

    const bad = await call(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: owner,
      body: { amount: 2000, category: "vendor", spentOn: today, vendorId: theirs.body.data.id },
    });
    expect(bad.status).toBe(400);

    // Search finds it by the vendor's name.
    const found = await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses?q=ramesh`, { token: owner });
    expect(found.body.data.map((e) => e.id)).toEqual([x.body.data.id]);
  });

  it("notes who paid from their pocket, and when they were paid back", async () => {
    const { owner, ws, staff, other, staffId, otherId } = await team("944");

    // The team can say they paid themselves, but not name someone else.
    const own = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: staff,
      body: { amount: 600, category: "travel", spentOn: today, paidBy: staffId },
    });
    expect(own.status).toBe(201);
    expect(own.body.data).toMatchObject({ status: "pending", paidBy: { id: staffId, name: "Staff Person" } });
    const forOther = await call(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: staff,
      body: { amount: 600, category: "travel", spentOn: today, paidBy: otherId },
    });
    expect(forOther.status).toBe(403);

    // The owner notes that another team member paid; they can see it, though they didn't add it.
    const noted = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: owner,
      body: { amount: 1500, category: "food", spentOn: today, paidBy: otherId, gstRate: 5 },
    });
    expect(noted.body.data.status).toBe("approved");
    const theirList = await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses`, { token: other });
    expect(theirList.body.data.map((e) => e.id)).toEqual([noted.body.data.id]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/expenses?paidBy=reimburse`, { token: staff })).body.data).toHaveLength(1);

    // Waiting ones aren't owed yet; approved ones are.
    let sum = await call<Summary>(t.app, "GET", `/workspaces/${ws}/expenses/summary`, { token: owner });
    expect(sum.body.data).toMatchObject({ count: 2, spent: 1500, pending: 600, pendingCount: 1, toReimburse: 1500, gst: 71.43 });

    // Only an approver pays back, and only what someone paid.
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${noted.body.data.id}/reimburse`, { token: staff, body: { reimbursed: true } })).status).toBe(403);
    const business = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, { token: owner, body: { amount: 50, category: "other", spentOn: today } });
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${business.body.data.id}/reimburse`, { token: owner, body: { reimbursed: true } })).status).toBe(409);

    const paid = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses/${noted.body.data.id}/reimburse`, { token: owner, body: { reimbursed: true } });
    expect(paid.status).toBe(200);
    expect(paid.body.data.reimbursedAt).not.toBeNull();
    sum = await call<Summary>(t.app, "GET", `/workspaces/${ws}/expenses/summary`, { token: owner });
    expect(sum.body.data.toReimburse).toBe(0);
    expect((await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses?paidBy=reimburse`, { token: owner })).body.data.map((e) => e.id)).toEqual([
      own.body.data.id,
    ]);

    // It's in the activity log.
    const log = await call<{ items: { action: string }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner });
    expect(log.body.data.items.some((i) => i.action === "expense.reimbursed")).toBe(true);

    // Changing who paid starts the paying back over.
    const moved = await call<Expense>(t.app, "PATCH", `/workspaces/${ws}/expenses/${noted.body.data.id}`, { token: owner, body: { paidBy: staffId } });
    expect(moved.body.data).toMatchObject({ paidBy: { id: staffId }, reimbursedAt: null });

    // Filters by who paid and category, and the summary follows the same filters.
    expect((await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses?paidBy=business`, { token: owner })).body.data.map((e) => e.id)).toEqual([
      business.body.data.id,
    ]);
    const food = await call<Summary>(t.app, "GET", `/workspaces/${ws}/expenses/summary?category=food`, { token: owner });
    expect(food.body.data).toMatchObject({ count: 1, spent: 1500 });
    expect(food.body.data.byCategory).toEqual([{ category: "food", label: "Food", total: 1500 }]);
  });

  it("filters by dates", async () => {
    const { owner, ws } = await team("945");
    for (const spentOn of ["2026-03-31", "2026-04-01", "2026-04-15"]) {
      await call(t.app, "POST", `/workspaces/${ws}/expenses`, { token: owner, body: { amount: 100, category: "rent", spentOn } });
    }
    const fy = await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses?from=2026-04-01&to=2027-03-31`, { token: owner });
    expect(fy.body.data).toHaveLength(2);
    const sum = await call<Summary>(t.app, "GET", `/workspaces/${ws}/expenses/summary?from=2026-04-01&to=2027-03-31`, { token: owner });
    expect(sum.body.data.spent).toBe(200);
  });
});
