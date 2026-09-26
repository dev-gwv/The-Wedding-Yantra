import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Report = {
  cash: { received: number; spent: number; net: number };
  sales: { bills: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number; total: number };
  profit: { earned: number; spent: number; profit: number };
  toCollect: number;
  bySource: { source: string; taxable: number; bills: number }[];
  byService: { name: string; quantity: number; taxable: number }[];
  byMember: { name: string; taxable: number; bills: number }[];
  byCategory: { category: string; total: number }[];
  receivedByMethod: { method: string; total: number }[];
};
type ExportFile = { filename: string; content: string; rows: number };

describe("monthly report and exports", () => {
  it("adds up a month the way an owner and their CA need it", async () => {
    const owner = await signIn(t.app, "9510000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Report Studio");
    await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { gstin: "08ABCDE1234F1Z5" } });
    const staffInvite = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Staff Person", phone: "9510000002", role: "staff" },
    });
    const staff = await signIn(t.app, "9510000002", "Staff Person");
    await call(t.app, "POST", `/invitations/${staffInvite.body.data.token}/accept`, { token: staff });

    // An Instagram enquiry, booked through a quote, billed in Rajasthan.
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, {
      token: owner,
      body: { name: "Insta Client", phone: "9510000010", source: "instagram", eventDate: "2026-10-20" },
    });
    const quote = await call<{ shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId: lead.body.data.id, title: "Wedding decor", items: [{ name: "Mandap decor", unit: "event", quantity: 1, rate: 10000, taxRate: 18 }] },
    });
    await call(t.app, "POST", `/public/quotes/${quote.body.data.shareToken}/accept`, { body: { name: "Insta Client" } });
    const eventId = (await call<{ eventId: string }>(t.app, "GET", `/workspaces/${ws}/leads/${lead.body.data.id}`, { token: owner })).body.data.eventId;
    const billA = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId, billTo: { name: "Insta Client" }, issueDate: "2026-10-05", items: [{ name: "Mandap decor", unit: "event", quantity: 1, rate: 10000, taxRate: 18 }] },
    });

    // A walk-in client in Goa, whose name looks like a spreadsheet formula.
    const client = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Goa Client" } });
    const billB = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: {
        clientId: client.body.data.id,
        billTo: { name: '=HYPERLINK("http://evil")' },
        placeOfSupply: "30",
        issueDate: "2026-10-10",
        items: [{ name: "Haldi decor", unit: "event", quantity: 1, rate: 5000, taxRate: 18 }],
      },
    });
    const billC = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { clientId: client.body.data.id, billTo: { name: "Goa Client" }, issueDate: "2026-10-12", items: [{ name: "Wrong", unit: "event", quantity: 1, rate: 999 }] },
    });
    await call(t.app, "POST", `/workspaces/${ws}/bills/${billC.body.data.id}/cancel`, { token: owner, body: { reason: "Made by mistake" } });

    const pay = (billId: string, amount: number, paidOn: string, method: string) =>
      call(t.app, "POST", `/workspaces/${ws}/payments`, { token: owner, body: { billId, amount, paidOn, method } });
    await pay(billA.body.data.id, 11800, "2026-10-06", "upi");
    await pay(billB.body.data.id, 2000, "2026-10-11", "cash");
    await pay(billB.body.data.id, 100, "2026-11-01", "cash");

    await call(t.app, "POST", `/workspaces/${ws}/expenses`, { token: owner, body: { eventId, category: "materials", amount: 3000, spentOn: "2026-10-04", paidTo: "Flower market" } });
    await call(t.app, "POST", `/workspaces/${ws}/expenses`, { token: staff, body: { category: "travel", amount: 500, spentOn: "2026-10-07" } });

    const report = await call<Report>(t.app, "GET", `/workspaces/${ws}/reports/month?month=2026-10`, { token: owner });
    expect(report.status).toBe(200);
    const r = report.body.data;
    expect(r.cash).toEqual({ received: 13800, spent: 3000, net: 10800 });
    expect(r.sales).toEqual({ bills: 2, taxable: 15000, cgst: 900, sgst: 900, igst: 900, tax: 2700, total: 17700 });
    expect(r.profit).toEqual({ earned: 15000, spent: 3000, profit: 12000 });
    expect(r.toCollect).toBe(3800);
    expect(r.bySource).toEqual([
      { source: "instagram", taxable: 10000, bills: 1 },
      { source: "direct", taxable: 5000, bills: 1 },
    ]);
    expect(r.byService.map((s) => s.name)).toEqual(["Mandap decor", "Haldi decor"]);
    expect(r.byMember).toEqual([
      { name: "Owner Person", taxable: 10000, bills: 1 },
      { name: "Not from an enquiry", taxable: 5000, bills: 1 },
    ]);
    expect(r.byCategory).toEqual([{ category: "materials", label: "Materials", total: 3000 }]);
    expect(r.receivedByMethod).toEqual([
      { method: "upi", label: "UPI", total: 11800 },
      { method: "cash", label: "Cash", total: 2000 },
    ]);

    // Spreadsheets for the CA.
    const bills = (await call<ExportFile>(t.app, "GET", `/workspaces/${ws}/exports?kind=bills&month=2026-10`, { token: owner })).body.data;
    expect(bills.filename).toBe("report-studio-bills-2026-10.csv");
    expect(bills.rows).toBe(3);
    expect(bills.content.startsWith("\uFEFFBill date,Bill number,Status")).toBe(true);
    const lines = bills.content.trim().split("\r\n");
    // Phone numbers come out plain: no "+" to look like a formula.
    const goaPhoneBill = await call(t.app, "PATCH", `/workspaces/${ws}/bills/${billB.body.data.id}`, {
      token: owner,
      body: { billTo: { name: '=HYPERLINK("http://evil")', phone: "9510000020" } },
    });
    expect(goaPhoneBill.status).toBe(200);
    const again = (await call<ExportFile>(t.app, "GET", `/workspaces/${ws}/exports?kind=bills&month=2026-10`, { token: owner })).body.data;
    expect(again.content).toContain(`"'=HYPERLINK(""http://evil"")",9510000020,,30 Goa`);
    expect(lines[1]).toBe("05-10-2026,INV/26-27/0001,Issued,Insta Client,,,08 Rajasthan,10000.00,900.00,900.00,0.00,0.00,11800.00,11800.00,0.00,Wedding decor");
    // The formula-looking name is made harmless and quoted.
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(lines[2]).toContain("30 Goa,5000.00,0.00,0.00,900.00");
    expect(lines[3]).toMatch(/^12-10-2026,INV\/26-27\/0003,Cancelled,Goa Client,.*,0\.00,0\.00,0\.00,0\.00,0\.00,0\.00,0\.00,0\.00,$/);

    const payments = (await call<ExportFile>(t.app, "GET", `/workspaces/${ws}/exports?kind=payments&month=2026-10`, { token: owner })).body.data;
    expect(payments.rows).toBe(2);
    expect(payments.content).toContain("06-10-2026,R-0001,Insta Client,INV/26-27/0001,UPI,,11800.00,Owner Person");

    const expenses = (await call<ExportFile>(t.app, "GET", `/workspaces/${ws}/exports?kind=expenses&month=2026-10`, { token: owner })).body.data;
    expect(expenses.rows).toBe(2);
    expect(expenses.content).toContain("04-10-2026,Materials,Flower market,,Wedding decor,,3000.00,,Business,,Approved,Owner Person,Owner Person,,No");
    expect(expenses.content).toContain("07-10-2026,Travel,,,,,500.00,,Business,,Waiting for approval,Staff Person,,,No");

    // Staff don't see the business's money.
    expect((await call(t.app, "GET", `/workspaces/${ws}/reports/month?month=2026-10`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/exports?kind=bills&month=2026-10`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/exports?kind=cheques&month=2026-10`, { token: owner })).status).toBe(400);
  });
});
