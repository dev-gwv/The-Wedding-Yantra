import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signedPath, verifySignature } from "../src/modules/files/service.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Uploaded = { id: string; path: string; contentType: string; size: number };
type Expense = {
  id: string;
  amount: number;
  category: string;
  status: string;
  rejectReason: string | null;
  eventId: string | null;
  receipt: Uploaded | null;
  submittedBy: { name: string | null } | null;
};

// Just enough bytes to look like each kind of file.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("fake jpeg body")]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("fake png")]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  return {
    owner,
    ws,
    staff: await join(`${prefix}0000002`, "staff", "Staff Person"),
    accountant: await join(`${prefix}0000003`, "accountant", "Accountant Person"),
  };
}

const upload = (token: string, ws: string, data: Buffer, contentType: string) =>
  call<Uploaded>(t.app, "POST", `/workspaces/${ws}/files`, { token, body: { contentType, data: data.toString("base64"), name: "bill.jpg" } });

describe("bill photos", () => {
  it("checks what a file really is, and shows it only through a signed link", async () => {
    const { owner, accountant, ws } = await team("991");
    const ok = await upload(owner, ws, JPEG, "image/jpeg");
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ contentType: "image/jpeg", size: JPEG.length });

    // A PNG called a JPEG, or a web page called a photo, is refused.
    expect((await upload(owner, ws, PNG, "image/jpeg")).status).toBe(400);
    expect((await upload(owner, ws, HTML, "image/jpeg")).status).toBe(400);
    expect((await upload(owner, ws, HTML, "text/html")).status).toBe(400);
    // The accountant only looks; nothing to upload.
    expect((await upload(accountant, ws, JPEG, "image/jpeg")).status).toBe(403);

    const shown = await t.app.inject({ method: "GET", url: ok.body.data.path });
    expect(shown.statusCode).toBe(200);
    expect(shown.headers["content-type"]).toBe("image/jpeg");
    expect(shown.headers["content-security-policy"]).toContain("sandbox");
    expect(shown.rawPayload.equals(JPEG)).toBe(true);

    const tampered = ok.body.data.path.replace(/s=[^&]+/, "s=forged");
    expect((await t.app.inject({ method: "GET", url: tampered })).statusCode).toBe(403);
    const bare = ok.body.data.path.split("?")[0]!;
    expect((await t.app.inject({ method: "GET", url: bare })).statusCode).toBe(403);
  });

  it("stops working after a day", () => {
    const now = Date.UTC(2026, 8, 25, 10);
    const path = signedPath(t.files.secret, "3f6e2a5c-1111-4222-8333-444455556666", now);
    const params = new URLSearchParams(path.split("?")[1]);
    const [e, s] = [params.get("e")!, params.get("s")!];
    expect(verifySignature(t.files.secret, "3f6e2a5c-1111-4222-8333-444455556666", e, s, now + 60_000)).toBe(true);
    expect(verifySignature(t.files.secret, "3f6e2a5c-1111-4222-8333-444455556666", e, s, now + 2 * 86_400_000)).toBe(false);
    expect(verifySignature(t.files.secret, "0f6e2a5c-1111-4222-8333-444455556666", e, s, now)).toBe(false);
  });
});

describe("expenses and profit", () => {
  it("counts the owner's spend at once, the team's after approval, and shows profit per event", async () => {
    const { owner, staff, accountant, ws } = await team("992");
    // A booked event: accepted quote of ₹50,000 + 18% GST, so the business earns ₹50,000.
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Kavya Rao", eventDate: "2099-11-20" } });
    const quote = await call<{ shareToken: string }>(t.app, "POST", `/workspaces/${ws}/quotes`, {
      token: owner,
      body: { leadId: lead.body.data.id, title: "Sangeet decor", items: [{ name: "Stage decor", unit: "event", quantity: 1, rate: 50000, taxRate: 18 }] },
    });
    await call(t.app, "POST", `/public/quotes/${quote.body.data.shareToken}/accept`, { body: { name: "Kavya Rao" } });
    const eventId = (await call<{ eventId: string }>(t.app, "GET", `/workspaces/${ws}/leads/${lead.body.data.id}`, { token: owner })).body.data.eventId;

    const photo = await upload(owner, ws, JPEG, "image/jpeg");
    const mine = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: owner,
      body: { eventId, category: "materials", amount: 12000, spentOn: "2099-11-18", paidTo: "Flower market", method: "cash", receiptFileId: photo.body.data.id },
    });
    expect(mine.status).toBe(201);
    expect(mine.body.data).toMatchObject({ status: "approved", amount: 12000, eventId });
    expect(mine.body.data.receipt?.path).toContain(`/api/v1/files/${photo.body.data.id}?e=`);

    const theirs = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, {
      token: staff,
      body: { eventId, category: "travel", amount: "1500", spentOn: "2099-11-19" },
    });
    expect(theirs.body.data).toMatchObject({ status: "pending", submittedBy: { name: "Staff Person" } });

    // Staff see only their own; the owner sees everything, waiting ones first.
    const staffList = await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses`, { token: staff });
    expect(staffList.body.data.map((x) => x.id)).toEqual([theirs.body.data.id]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/expenses/${mine.body.data.id}`, { token: staff })).status).toBe(404);
    const ownerList = await call<Expense[]>(t.app, "GET", `/workspaces/${ws}/expenses?eventId=${eventId}`, { token: owner });
    expect(ownerList.body.data.map((x) => x.status)).toEqual(["pending", "approved"]);

    type Money = { revenue: number; spent: number; pendingSpend: number; profit: number };
    const money = async () => (await call<Money>(t.app, "GET", `/workspaces/${ws}/events/${eventId}/money`, { token: owner })).body.data;
    expect(await money()).toMatchObject({ revenue: 50000, spent: 12000, pendingSpend: 1500, profit: 38000 });
    const home = await call<{ money: { pendingExpenses: number } }>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner });
    expect(home.body.data.money.pendingExpenses).toBe(1);

    // The accountant looks but can't change or approve.
    expect((await call(t.app, "GET", `/workspaces/${ws}/expenses`, { token: accountant })).body.data).toHaveLength(2);
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${theirs.body.data.id}/review`, { token: accountant, body: { approve: true } })).status).toBe(403);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/expenses/${theirs.body.data.id}`, { token: accountant, body: { amount: 1 } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses`, { token: accountant, body: { category: "food", amount: 1, spentOn: "2099-11-19" } })).status).toBe(403);
    // Staff can't approve their own.
    expect((await call(t.app, "POST", `/workspaces/${ws}/expenses/${theirs.body.data.id}/review`, { token: staff, body: { approve: true } })).status).toBe(403);

    const approved = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses/${theirs.body.data.id}/review`, { token: owner, body: { approve: true } });
    expect(approved.body.data.status).toBe("approved");
    expect(await money()).toMatchObject({ spent: 13500, pendingSpend: 0, profit: 36500 });
    // Once approved, it's the owner's to change.
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/expenses/${theirs.body.data.id}`, { token: staff, body: { amount: 99999 } })).status).toBe(409);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/expenses/${theirs.body.data.id}`, { token: staff })).status).toBe(409);

    // Rejected, fixed, and sent again.
    const food = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses`, { token: staff, body: { category: "food", amount: 900, spentOn: "2099-11-20" } });
    const rejected = await call<Expense>(t.app, "POST", `/workspaces/${ws}/expenses/${food.body.data.id}/review`, {
      token: owner,
      body: { approve: false, reason: "Add the bill photo" },
    });
    expect(rejected.body.data).toMatchObject({ status: "rejected", rejectReason: "Add the bill photo" });
    const staffPhoto = await upload(staff, ws, JPEG, "image/jpeg");
    const resent = await call<Expense>(t.app, "PATCH", `/workspaces/${ws}/expenses/${food.body.data.id}`, {
      token: staff,
      body: { receiptFileId: staffPhoto.body.data.id },
    });
    expect(resent.body.data).toMatchObject({ status: "pending", rejectReason: null });
    expect(resent.body.data.receipt?.id).toBe(staffPhoto.body.data.id);

    const month = await call<{ spent: number; pending: number; pendingCount: number; byCategory: { category: string; total: number }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/expense-month?month=2099-11`,
      { token: owner },
    );
    expect(month.body.data).toMatchObject({ spent: 13500, pending: 900, pendingCount: 1 });
    expect(month.body.data.byCategory).toEqual([
      { category: "materials", label: "Materials", total: 12000 },
      { category: "travel", label: "Travel", total: 1500 },
    ]);
    expect((await call(t.app, "GET", `/workspaces/${ws}/expense-month?month=2099-11`, { token: staff })).status).toBe(403);
  });

  it("keeps expenses and photos inside their own business", async () => {
    const a = await team("993");
    const b = await team("994");
    const photo = await upload(a.owner, a.ws, JPEG, "image/jpeg");
    const expense = await call<Expense>(t.app, "POST", `/workspaces/${a.ws}/expenses`, {
      token: a.owner,
      body: { category: "rent", amount: 20000, spentOn: "2099-11-01", receiptFileId: photo.body.data.id },
    });
    expect((await call(t.app, "GET", `/workspaces/${b.ws}/expenses/${expense.body.data.id}`, { token: b.owner })).status).toBe(404);
    expect((await call(t.app, "GET", `/workspaces/${a.ws}/expenses`, { token: b.owner })).status).toBe(404);
    const stolen = await call(t.app, "POST", `/workspaces/${b.ws}/expenses`, {
      token: b.owner,
      body: { category: "rent", amount: 1, spentOn: "2099-11-01", receiptFileId: photo.body.data.id },
    });
    expect(stolen.status).toBe(400);
    expect((await call<Expense[]>(t.app, "GET", `/workspaces/${b.ws}/expenses`, { token: b.owner })).body.data).toEqual([]);
  });
});
