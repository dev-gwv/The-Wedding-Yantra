import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type SavedText = { id: string; kind: string; title: string; body: string; isDefault: boolean };
type Account = {
  id: string;
  label: string;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  bankName: string | null;
  upiId: string | null;
  isDefault: boolean;
  archived: boolean;
};
type Bank = { accountNumber: string | null; ifsc: string | null; upiId: string | null; accountName: string | null };
type Bill = { id: string; shareToken: string; notes: string | null; terms: string | null; bankAccountId: string | null; bank: Bank | null };

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: "Aman", phone: `${prefix}0000002`, role: "staff" } });
  const staff = await signIn(t.app, `${prefix}0000002`, "Aman");
  await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
  return { owner, staff, ws };
}

const today = new Date().toISOString().slice(0, 10);
const invoice = (extra: object = {}) => ({
  billTo: { name: "Neha Kapoor", phone: "9811111111" },
  issueDate: today,
  items: [{ name: "Bridal makeup", unit: "event", quantity: 1, rate: 20000 }],
  ...extra,
});

describe("saved notes and terms", () => {
  it("fills new invoices with the default, and only owners and managers change them", async () => {
    const { owner, staff, ws } = await team("931");
    const add = (body: object, token = owner) => call<SavedText>(t.app, "POST", `/workspaces/${ws}/saved-texts`, { token, body });

    expect((await add({ kind: "terms", title: "Staff terms", body: "No" }, staff)).status).toBe(403);
    expect((await add({ kind: "terms", title: "", body: "x" })).status).toBe(400);

    // The first of its kind becomes the default by itself.
    const usual = await add({ kind: "terms", title: "Usual", body: "50% advance to book. Balance before the event." });
    expect(usual.status).toBe(201);
    expect(usual.body.data.isDefault).toBe(true);
    const destination = await add({ kind: "terms", title: "Destination", body: "Travel and stay extra." });
    expect(destination.body.data.isDefault).toBe(false);
    await add({ kind: "note", title: "Thanks", body: "Thank you for choosing us!" });

    const draft = await call<{ notes: string | null; terms: string | null }>(t.app, "GET", `/workspaces/${ws}/bill-draft`, { token: owner });
    expect(draft.body.data).toMatchObject({ notes: "Thank you for choosing us!", terms: "50% advance to book. Balance before the event." });

    // Made without saying: gets the defaults. Said as empty: stays empty.
    const bill = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice() });
    expect(bill.body.data).toMatchObject({ notes: "Thank you for choosing us!", terms: "50% advance to book. Balance before the event." });
    const bare = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ notes: "", terms: "" }) });
    expect(bare.body.data).toMatchObject({ notes: null, terms: null });

    // Only one default of each kind.
    const switched = await call<SavedText>(t.app, "PATCH", `/workspaces/${ws}/saved-texts/${destination.body.data.id}`, {
      token: owner,
      body: { isDefault: true, body: "Travel, stay and food for the team are extra." },
    });
    expect(switched.body.data).toMatchObject({ isDefault: true, body: "Travel, stay and food for the team are extra." });
    const all = await call<SavedText[]>(t.app, "GET", `/workspaces/${ws}/saved-texts`, { token: owner });
    expect(all.body.data.filter((x) => x.kind === "terms" && x.isDefault).map((x) => x.title)).toEqual(["Destination"]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/saved-texts`, { token: staff })).status).toBe(403);

    // Removing one leaves invoices already made as they were.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/saved-texts/${usual.body.data.id}`, { token: owner })).status).toBe(200);
    const kept = await call<Bill>(t.app, "GET", `/workspaces/${ws}/bills/${bill.body.data.id}`, { token: owner });
    expect(kept.body.data.terms).toBe("50% advance to book. Balance before the event.");

    // Another business can't touch them.
    const other = await team("932");
    expect((await call(t.app, "PATCH", `/workspaces/${other.ws}/saved-texts/${destination.body.data.id}`, { token: other.owner, body: { title: "x" } })).status).toBe(404);
  });
});

describe("bank accounts on invoices", () => {
  it("checks the details, prints the default, and keeps each invoice's copy", async () => {
    const { owner, staff, ws } = await team("933");
    const add = (body: object, token = owner) => call<Account>(t.app, "POST", `/workspaces/${ws}/bank-accounts`, { token, body });

    expect((await add({ label: "HDFC", upiId: "riya@okhdfc" }, staff)).status).toBe(403);
    expect((await add({ label: "Nothing" })).status).toBe(400);
    expect((await add({ label: "No IFSC", accountNumber: "50100123456789" })).status).toBe(400);
    expect((await add({ label: "Bad IFSC", accountNumber: "50100123456789", ifsc: "HDFC123" })).status).toBe(400);
    expect((await add({ label: "Bad UPI", upiId: "riya" })).status).toBe(400);

    const hdfc = await add({ label: "HDFC current", accountName: "Riya Makeup Studio", accountNumber: "5010 0123 4567 89", ifsc: "hdfc0001234", bankName: "HDFC Bank", upiId: "riya@okhdfc" });
    expect(hdfc.status).toBe(201);
    expect(hdfc.body.data).toMatchObject({ accountNumber: "50100123456789", ifsc: "HDFC0001234", isDefault: true });
    const sbi = await add({ label: "SBI savings", accountNumber: "30012345678", ifsc: "SBIN0000456" });
    expect(sbi.body.data.isDefault).toBe(false);

    const draft = await call<{ bankAccountId: string | null }>(t.app, "GET", `/workspaces/${ws}/bill-draft`, { token: owner });
    expect(draft.body.data.bankAccountId).toBe(hdfc.body.data.id);

    // A new invoice prints the default account; the client pays by that UPI ID.
    const bill = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice() });
    expect(bill.body.data.bankAccountId).toBe(hdfc.body.data.id);
    expect(bill.body.data.bank).toMatchObject({ accountNumber: "50100123456789", ifsc: "HDFC0001234", upiId: "riya@okhdfc" });
    const pub = await call<{ business: { upiId: string | null; invoiceDesign: string; invoiceAccent: string }; bill: { bank: Bank | null } }>(
      t.app,
      "GET",
      `/public/bills/${bill.body.data.shareToken}`,
    );
    expect(pub.body.data.business).toMatchObject({ upiId: "riya@okhdfc", invoiceDesign: "classic", invoiceAccent: "#E85C00" });
    expect(pub.body.data.bill.bank?.ifsc).toBe("HDFC0001234");

    // Editing the account changes new invoices, not the one already sent.
    await call(t.app, "PATCH", `/workspaces/${ws}/bank-accounts/${hdfc.body.data.id}`, { token: owner, body: { accountNumber: "50100999999999" } });
    const same = await call<Bill>(t.app, "GET", `/workspaces/${ws}/bills/${bill.body.data.id}`, { token: owner });
    expect(same.body.data.bank?.accountNumber).toBe("50100123456789");
    // Saving the invoice with the same account keeps its copy too.
    const resaved = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${bill.body.data.id}`, {
      token: owner,
      body: { bankAccountId: hdfc.body.data.id, notes: "See you on the day" },
    });
    expect(resaved.body.data.bank?.accountNumber).toBe("50100123456789");

    // Another account, or none at all.
    const other = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${bill.body.data.id}`, { token: owner, body: { bankAccountId: sbi.body.data.id } });
    expect(other.body.data.bank).toMatchObject({ accountNumber: "30012345678", upiId: null });
    const none = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ bankAccountId: null }) });
    expect(none.body.data).toMatchObject({ bankAccountId: null, bank: null });

    // Hiding the default leaves no default; a hidden account can't be picked.
    const hidden = await call<Account>(t.app, "PATCH", `/workspaces/${ws}/bank-accounts/${hdfc.body.data.id}`, { token: owner, body: { archived: true } });
    expect(hidden.body.data).toMatchObject({ archived: true, isDefault: false });
    expect((await call(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ bankAccountId: hdfc.body.data.id }) })).status).toBe(400);
    const noDefault = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice() });
    expect(noDefault.body.data.bank).toBeNull();
    // Making another the default.
    const made = await call<Account>(t.app, "PATCH", `/workspaces/${ws}/bank-accounts/${sbi.body.data.id}`, { token: owner, body: { isDefault: true } });
    expect(made.body.data.isDefault).toBe(true);
    // Clearing the UPI ID and number together isn't allowed.
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/bank-accounts/${sbi.body.data.id}`, { token: owner, body: { accountNumber: "" } })).status).toBe(400);

    // Another business's account can't go on an invoice here.
    const them = await team("934");
    const theirs = await call<Account>(t.app, "POST", `/workspaces/${them.ws}/bank-accounts`, { token: them.owner, body: { label: "Theirs", upiId: "them@okaxis" } });
    expect((await call(t.app, "POST", `/workspaces/${ws}/bills`, { token: owner, body: invoice({ bankAccountId: theirs.body.data.id }) })).status).toBe(400);
  });
});

describe("invoice look", () => {
  it("keeps a design and a colour the owner picks", async () => {
    const { owner, staff, ws } = await team("935");
    const set = await call<{ invoiceDesign: string; invoiceAccent: string }>(t.app, "PATCH", `/workspaces/${ws}`, {
      token: owner,
      body: { invoiceDesign: "bold", invoiceAccent: "#1d4ed8" },
    });
    expect(set.body.data).toMatchObject({ invoiceDesign: "bold", invoiceAccent: "#1D4ED8" });
    expect((await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { invoiceDesign: "fancy" } })).status).toBe(400);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { invoiceAccent: "blue" } })).status).toBe(400);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}`, { token: staff, body: { invoiceDesign: "minimal" } })).status).toBe(403);
  });
});
