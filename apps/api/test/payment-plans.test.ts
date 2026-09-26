import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Part = { label: string; percent: number | null; amount: number; dueDate: string | null; received: number; remaining: number; state: string };
type Bill = { id: string; shareToken: string; total: number; due: number; dueDate: string | null; overdue: boolean; dueNow: number; plan: Part[] };

const iso = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  return { owner, ws };
}

const invoice = (extra: object) => ({
  billTo: { name: "Neha Kapoor", phone: "9811111111" },
  issueDate: iso(-20),
  items: [{ name: "Wedding decor", unit: "event", quantity: 1, rate: 100000 }],
  ...extra,
});

describe("payment plans on invoices", () => {
  it("splits the total into parts and pays them in order", async () => {
    const { owner, ws } = await business("921");
    const plan = [
      { label: "Advance to book", percent: 30, dueDate: iso(-10) },
      { label: "Before the event", percent: 40, dueDate: iso(10) },
      { label: "On the day", percent: 30, dueDate: iso(20) },
    ];
    const made = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ instalments: plan }) });
    expect(made.status).toBe(201);
    const b = made.body.data;
    expect(b.plan.map((p) => p.amount)).toEqual([30000, 40000, 30000]);
    // The invoice is due on the last part's date.
    expect(b.dueDate).toBe(iso(20));
    // The advance's date has passed and nothing came in: overdue, with the advance due now.
    expect(b.plan[0]!.state).toBe("overdue");
    expect(b).toMatchObject({ overdue: true, dueNow: 30000 });

    // A part-payment pays the first part, then the next.
    const pay = (amount: number) =>
      call(t.app, "POST", `/workspaces/${ws}/payments`, { token: owner, body: { billId: b.id, amount, paidOn: iso(0), method: "upi" } });
    await pay(45000);
    const after = (await call<Bill>(t.app, "GET", `/workspaces/${ws}/bills/${b.id}`, { token: owner })).body.data;
    expect(after.plan.map((p) => p.state)).toEqual(["paid", "part_paid", "upcoming"]);
    expect(after.plan[1]).toMatchObject({ received: 15000, remaining: 25000 });
    expect(after).toMatchObject({ overdue: false, dueNow: 0, due: 55000 });

    // Money to collect asks for the part that's due, not the whole balance.
    const money = await call<{ dues: { billId: string | null; due: number; part: { label: string; amount: number } | null }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/money`,
      { token: owner },
    );
    expect(money.body.data.dues.find((d) => d.billId === b.id)).toMatchObject({ due: 55000, part: { label: "Before the event", amount: 25000 } });

    // The client's page shows the plan too.
    const pub = await call<{ bill: Bill }>(t.app, "GET", `/public/bills/${b.shareToken}`);
    expect(pub.body.data.bill.plan.map((p) => p.label)).toEqual(["Advance to book", "Before the event", "On the day"]);

    // Overdue invoices show in the overdue filter because of the plan, not only the final date.
    const late = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: invoice({ instalments: [{ label: "Advance", amount: 20000, dueDate: iso(-2) }, { label: "Balance", amount: 80000, dueDate: iso(30) }] }),
    });
    const overdue = await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/bills?status=overdue`, { token: owner });
    expect(overdue.body.data.map((x) => x.id)).toContain(late.body.data.id);
    expect(overdue.body.data.map((x) => x.id)).not.toContain(b.id);
  });

  it("checks the parts add up, and follows a new total when in percentages", async () => {
    const { owner, ws } = await business("922");
    const short = await call(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: invoice({ instalments: [{ label: "Advance", percent: 30 }, { label: "Balance", percent: 60 }] }),
    });
    expect(short.status).toBe(400);
    expect((await call(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ instalments: [{ label: "All", percent: 100 }] }) })).status).toBe(400);
    expect(
      (await call(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ instalments: [{ label: "A", percent: 50, amount: 5 }, { label: "B", percent: 50 }] }) }))
        .status,
    ).toBe(400);

    const made = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: invoice({ instalments: [{ label: "Advance", percent: 50 }, { label: "Balance", percent: 50 }] }),
    });
    const id = made.body.data.id;
    // A new price: the halves follow it.
    const edited = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${id}`, {
      token: owner,
      body: { items: [{ name: "Wedding decor", unit: "event", quantity: 1, rate: 120001 }] },
    });
    expect(edited.body.data.plan.map((p) => p.amount)).toEqual([60000.5, 60000.5]);
    // Clearing the plan makes it one payment again.
    const cleared = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${id}`, { token: owner, body: { instalments: [] } });
    expect(cleared.body.data.plan).toEqual([]);

    // A plan in rupees that no longer adds up after a price change must be fixed first.
    const fixed = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: invoice({ instalments: [{ label: "Advance", amount: 25000 }, { label: "Balance", amount: 75000 }] }),
    });
    const bad = await call(t.app, "PATCH", `/workspaces/${ws}/bills/${fixed.body.data.id}`, {
      token: owner,
      body: { items: [{ name: "Wedding decor", unit: "event", quantity: 1, rate: 90000 }] },
    });
    expect(bad.status).toBe(400);
  });
});
