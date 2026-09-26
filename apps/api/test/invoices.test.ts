import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Option = { id: string; list: string; key: string; label: string; archived: boolean; builtin: boolean };
type Payment = { id: string; number: string; amount: number; method: string; methodLabel: string; billId: string | null };
type Bill = {
  id: string;
  number: string;
  clientId: string | null;
  subject: string | null;
  chargesGst: boolean;
  pricesIncludeGst: boolean;
  discountPercent: number | null;
  taxable: number;
  tax: number;
  total: number;
  received: number;
  due: number;
  discount: number;
  payments: Payment[];
};

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: "Aman", phone: `${prefix}0000002`, role: "staff" } });
  const staff = await signIn(t.app, `${prefix}0000002`, "Aman");
  await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
  return { owner, staff, ws };
}

describe("the business's own lists", () => {
  it("starts with the usual options, grows from the forms and renames everywhere at once", async () => {
    const { owner, staff, ws } = await team("971");
    const list = async (l: string) => (await call<Option[]>(t.app, "GET", `/workspaces/${ws}/options?list=${l}`, { token: owner })).body.data;

    const modes = await list("payment_method");
    expect(modes.map((o) => o.label)).toEqual(["UPI", "Cash", "Bank transfer", "Cheque", "Card", "Other"]);
    expect(modes.every((o) => o.builtin)).toBe(true);
    // Categories come with the trade's usual ones too.
    const categories = await list("expense_category");
    expect(categories.map((o) => o.label)).toEqual(expect.arrayContaining(["Materials", "Travel", "Makeup products", "Kit refills"]));

    // Add from a form: the same name in other capitals is the same option.
    const gpay = await call<Option>(t.app, "POST", `/workspaces/${ws}/options`, { token: owner, body: { list: "payment_method", label: "Google Pay" } });
    expect(gpay.status).toBe(201);
    expect(gpay.body.data).toMatchObject({ label: "Google Pay", builtin: false, archived: false });
    expect(gpay.body.data.key).toMatch(/^x_/);
    const again = await call<Option>(t.app, "POST", `/workspaces/${ws}/options`, { token: owner, body: { list: "payment_method", label: "google pay" } });
    expect(again.body.data.id).toBe(gpay.body.data.id);

    // Staff can add a category (they add expenses) but can't rename or hide.
    const petrol = await call<Option>(t.app, "POST", `/workspaces/${ws}/options`, { token: staff, body: { list: "expense_category", label: "Petrol" } });
    expect(petrol.status).toBe(201);
    expect((await call(t.app, "POST", `/workspaces/${ws}/options`, { token: staff, body: { list: "payment_method", label: "Paytm" } })).status).toBe(403);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/options/${petrol.body.data.id}`, { token: staff, body: { label: "Fuel" } })).status).toBe(403);

    // Money recorded with it shows its name; a rename shows everywhere, old records included.
    const bill = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { billTo: { name: "Neha Kapoor", phone: "9811111111" }, issueDate: "2026-09-20", items: [{ name: "Bridal makeup", unit: "event", quantity: 1, rate: 30000 }] },
    });
    const paid = await call<Payment>(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { billId: bill.body.data.id, amount: 5000, paidOn: "2026-09-21", method: gpay.body.data.key },
    });
    expect(paid.body.data).toMatchObject({ method: gpay.body.data.key, methodLabel: "Google Pay" });
    await call(t.app, "PATCH", `/workspaces/${ws}/options/${gpay.body.data.id}`, { token: owner, body: { label: "GPay" } });
    const payments = await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?method=${gpay.body.data.key}`, { token: owner });
    expect(payments.body.data.map((p) => p.methodLabel)).toEqual(["GPay"]);

    // Hidden: not for new records, but old ones keep their name; bringing it back works.
    await call(t.app, "PATCH", `/workspaces/${ws}/options/${gpay.body.data.id}`, { token: owner, body: { archived: true } });
    const refused = await call(t.app, "POST", `/workspaces/${ws}/payments`, {
      token: owner,
      body: { billId: bill.body.data.id, amount: 1000, paidOn: "2026-09-22", method: gpay.body.data.key },
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.fields).toEqual({ method: "Choose a payment mode from your list" });
    expect((await call(t.app, "POST", `/workspaces/${ws}/payments`, { token: owner, body: { billId: bill.body.data.id, amount: 1000, paidOn: "2026-09-22", method: "made_up" } })).status).toBe(400);
    const one = await call<Bill>(t.app, "GET", `/workspaces/${ws}/bills/${bill.body.data.id}`, { token: owner });
    expect(one.body.data.payments[0]!.methodLabel).toBe("GPay");

    // Two with the same name can't live side by side; reorder keeps what's given.
    const upi = modes.find((o) => o.key === "upi")!;
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/options/${upi.id}`, { token: owner, body: { label: "cash" } })).status).toBe(409);
    const reordered = await call<Option[]>(t.app, "PUT", `/workspaces/${ws}/options/order`, {
      token: owner,
      body: { list: "payment_method", ids: [modes[1]!.id, modes[0]!.id, ...modes.slice(2).map((o) => o.id), gpay.body.data.id] },
    });
    expect(reordered.body.data.slice(0, 2).map((o) => o.label)).toEqual(["Cash", "UPI"]);

    // Another business can't touch these.
    const other = await signIn(t.app, "9710000009", "Other");
    const ws2 = await createBusiness(t.app, other, "Other Studio");
    expect((await call(t.app, "PATCH", `/workspaces/${ws2}/options/${upi.id}`, { token: other, body: { label: "Mine" } })).status).toBe(404);
  });
});

describe("invoices in depth", () => {
  it("bills anyone, with or without GST, prices with GST in, a % discount and money received in the same save", async () => {
    const { owner, ws } = await team("972");
    await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { gstin: "08ABCDE1234F1Z5" } });

    // A walk-in customer: no event, no client yet. They join the client list.
    const walkIn = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: {
        billTo: { name: "Simran Kaur", phone: "9833333333" },
        subject: "Party makeup, 5 Oct",
        issueDate: "2026-09-20",
        dueDate: "2026-10-05",
        pricesIncludeGst: true,
        items: [{ name: "Party makeup", unit: "person", quantity: 2, rate: 5900, taxRate: 18 }],
        payment: { amount: 5000, paidOn: "2026-09-20", method: "upi", reference: "UTR1" },
      },
    });
    expect(walkIn.status).toBe(201);
    // ₹5,900 with 18% in is ₹5,000 + ₹900 GST; two of them.
    expect(walkIn.body.data).toMatchObject({
      subject: "Party makeup, 5 Oct",
      chargesGst: true,
      pricesIncludeGst: true,
      taxable: 10000,
      tax: 1800,
      total: 11800,
      received: 5000,
      due: 6800,
    });
    expect(walkIn.body.data.payments).toEqual([expect.objectContaining({ amount: 5000, methodLabel: "UPI" })]);
    const clients = await call<{ id: string; name: string }[]>(t.app, "GET", `/workspaces/${ws}/clients`, { token: owner });
    expect(clients.body.data.find((c) => c.name === "Simran Kaur")?.id).toBe(walkIn.body.data.clientId);
    // The same number again is the same client.
    const again = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { billTo: { name: "Simran K", phone: "9833333333" }, issueDate: "2026-09-21", items: [{ name: "Touch-up", unit: "event", quantity: 1, rate: 1000 }] },
    });
    expect(again.body.data.clientId).toBe(walkIn.body.data.clientId);

    // GST off on this one, though the business has a GST number: a plain invoice.
    const plain = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: {
        billTo: { name: "Meera Iyer", gstin: "27ABCDE1234F1Z5" },
        chargesGst: false,
        issueDate: "2026-09-22",
        discountPercent: 10,
        items: [{ name: "Bridal makeup", unit: "event", quantity: 1, rate: 40000, taxRate: 18 }],
      },
    });
    expect(plain.body.data).toMatchObject({ chargesGst: false, tax: 0, discount: 4000, discountPercent: 10, total: 36000 });

    // More than the balance can't be recorded with the invoice.
    const over = await call(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { billTo: { name: "Over Pay" }, issueDate: "2026-09-22", chargesGst: false, items: [{ name: "Trial", unit: "event", quantity: 1, rate: 2000 }], payment: { amount: 2500, paidOn: "2026-09-22", method: "cash" } },
    });
    expect(over.status).toBe(400);
    expect(over.body.error.fields).toHaveProperty(["payment.amount"]);

    // Turning GST on while editing works it out on the lines' rates (the editor sends them).
    const edited = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${plain.body.data.id}`, {
      token: owner,
      body: { chargesGst: true, items: [{ name: "Bridal makeup", unit: "event", quantity: 1, rate: 40000, taxRate: 18 }] },
    });
    expect(edited.body.data).toMatchObject({ chargesGst: true, taxable: 36000, tax: 6480, total: 42480 });

    // A business without a GST number can't turn it on.
    const { owner: o2, ws: ws2 } = await team("973");
    const noGst = await call(t.app, "POST", `/workspaces/${ws2}/bills`, {
      token: o2,
      body: { billTo: { name: "Anyone" }, chargesGst: true, issueDate: "2026-09-22", items: [{ name: "Makeup", unit: "event", quantity: 1, rate: 1000, taxRate: 18 }] },
    });
    expect(noGst.status).toBe(400);
  });

  it("finds invoices by name, number, status and dates, with totals that match the list", async () => {
    const { owner, ws } = await team("974");
    const make = (name: string, issueDate: string, dueDate: string, rate: number) =>
      call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
        token: owner,
        body: { billTo: { name }, issueDate, dueDate, items: [{ name: "Makeup", unit: "event", quantity: 1, rate }] },
      });
    const a = await make("Neha Kapoor", "2026-01-10", "2026-01-20", 10000);
    await make("Priya Shah", "2026-02-10", "2099-01-01", 20000);
    const c = await make("Kavya Menon", "2026-03-10", "2026-03-20", 30000);
    await call(t.app, "POST", `/workspaces/${ws}/payments`, { token: owner, body: { billId: a.body.data.id, amount: 10000, paidOn: "2026-01-15", method: "cash" } });
    await call(t.app, "POST", `/workspaces/${ws}/bills/${c.body.data.id}/cancel`, { token: owner, body: { reason: "Date changed" } });

    const list = async (query: string) => (await call<Bill[]>(t.app, "GET", `/workspaces/${ws}/bills?${query}`, { token: owner })).body.data.map((b) => b.number);
    const summary = async (query: string) => (await call<Record<string, number>>(t.app, "GET", `/workspaces/${ws}/bills/summary?${query}`, { token: owner })).body.data;

    expect(await list("q=priya")).toHaveLength(1);
    expect(await list(`q=${encodeURIComponent(a.body.data.number)}`)).toEqual([a.body.data.number]);
    expect(await list("status=paid")).toEqual([a.body.data.number]);
    expect(await list("status=overdue")).toEqual([]);
    expect(await list("status=cancelled")).toEqual([c.body.data.number]);
    expect(await list("from=2026-02-01&to=2026-03-31")).toHaveLength(2);

    // Cancelled invoices stay out of the totals.
    expect(await summary("")).toEqual({ count: 2, total: 30000, received: 10000, due: 20000, overdue: 0 });
    expect(await summary("from=2026-02-01")).toEqual({ count: 1, total: 20000, received: 0, due: 20000, overdue: 0 });

    // Payments: by mode and by what was typed.
    const byMode = await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?method=cash`, { token: owner });
    expect(byMode.body.data).toHaveLength(1);
    const byReceipt = await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?q=R-0001`, { token: owner });
    expect(byReceipt.body.data.map((p) => p.number)).toEqual(["R-0001"]);
    expect((await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?q=neha`, { token: owner })).body.data).toHaveLength(1);
    expect((await call<Payment[]>(t.app, "GET", `/workspaces/${ws}/payments?from=2026-02-01`, { token: owner })).body.data).toHaveLength(0);
  });
});
