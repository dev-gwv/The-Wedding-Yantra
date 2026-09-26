import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Item = { title: string; dueDate: string | null; deliverableId: string | null; status: string | null; deliveredAt: string | null };
type Bill = { id: string; shareToken: string; deliverables: Item[] };
type Deliverable = { id: string; title: string; eventId: string; status: string; dueDate: string | null };

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const event = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
    token: owner,
    body: { newClient: { name: "Sharma Family", phone: "9833344455" }, title: "Sharma wedding", value: "250000", functions: [{ name: "Wedding", date: "2026-12-05" }] },
  });
  return { owner, ws, eventId: event.body.data.id };
}

const lines = [{ name: "Wedding photography", unit: "event", quantity: 1, rate: 150000 }];

describe("what the client gets on an invoice", () => {
  it("tracks new ones on the event and shows when they're delivered", async () => {
    const { owner, ws, eventId } = await business("911");
    // One the event already has shows up on a new invoice for it.
    const album = await call<Deliverable>(t.app, "POST", `/workspaces/${ws}/deliverables`, { token: owner, body: { eventId, title: "Album, 40 pages", dueDate: "2027-01-20" } });
    const draft = await call<{ deliverables: { title: string; deliverableId: string | null }[] }>(t.app, "GET", `/workspaces/${ws}/bill-draft?eventId=${eventId}`, { token: owner });
    expect(draft.body.data.deliverables).toEqual([{ title: "Album, 40 pages", dueDate: "2027-01-20", deliverableId: album.body.data.id }]);

    const made = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: {
        eventId,
        billTo: { name: "Sharma Family" },
        issueDate: "2026-10-01",
        items: lines,
        deliverables: [
          { title: "Album, 40 pages", deliverableId: album.body.data.id },
          { title: "500 edited photos", dueDate: "2026-12-30" },
          { title: "Teaser reel", dueDate: "2026-12-12" },
        ],
      },
    });
    expect(made.status).toBe(201);
    const items = made.body.data.deliverables;
    expect(items.map((i) => i.title)).toEqual(["Album, 40 pages", "500 edited photos", "Teaser reel"]);
    // The new ones are now the event's deliverables too, and the album keeps its own date.
    expect(items.every((i) => i.deliverableId && i.status === "pending")).toBe(true);
    expect(items[0]!.dueDate).toBe("2027-01-20");
    const onEvent = await call<Deliverable[]>(t.app, "GET", `/workspaces/${ws}/deliverables?eventId=${eventId}`, { token: owner });
    expect(onEvent.body.data.map((d) => d.title).sort()).toEqual(["500 edited photos", "Album, 40 pages", "Teaser reel"]);

    // Delivering it shows on the invoice and on the client's copy.
    const reel = items[2]!.deliverableId!;
    await call(t.app, "PATCH", `/workspaces/${ws}/deliverables/${reel}`, { token: owner, body: { status: "delivered", link: "https://example.com/reel" } });
    const pub = await call<{ bill: Bill }>(t.app, "GET", `/public/bills/${made.body.data.shareToken}`);
    expect(pub.body.data.bill.deliverables[2]).toMatchObject({ title: "Teaser reel", status: "delivered" });
    expect(pub.body.data.bill.deliverables[2]!.deliveredAt).not.toBeNull();

    // Taking one off the invoice leaves the event's deliverable alone.
    const edited = await call<Bill>(t.app, "PATCH", `/workspaces/${ws}/bills/${made.body.data.id}`, {
      token: owner,
      body: { deliverables: items.slice(0, 2).map((i) => ({ title: i.title, dueDate: i.dueDate, deliverableId: i.deliverableId })) },
    });
    expect(edited.body.data.deliverables).toHaveLength(2);
    expect((await call<Deliverable[]>(t.app, "GET", `/workspaces/${ws}/deliverables?eventId=${eventId}`, { token: owner })).body.data).toHaveLength(3);

    // Not tracking: kept on the invoice only.
    const plain = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { eventId, billTo: { name: "Sharma Family" }, issueDate: "2026-10-02", items: lines, trackDeliverables: false, deliverables: [{ title: "Photo frame" }] },
    });
    expect(plain.body.data.deliverables).toEqual([{ title: "Photo frame", dueDate: null, deliverableId: null, status: null, deliveredAt: null }]);
  });

  it("keeps them on the invoice when there's no event, and won't borrow another event's", async () => {
    const { owner, ws, eventId } = await business("912");
    const walkIn = await call<Bill>(t.app, "POST", `/workspaces/${ws}/bills`, {
      token: owner,
      body: { billTo: { name: "Neha Kapoor", phone: "9811111111" }, issueDate: "2026-10-01", items: lines, deliverables: [{ title: "Look photos", dueDate: "2026-10-05" }] },
    });
    expect(walkIn.body.data.deliverables).toEqual([{ title: "Look photos", dueDate: "2026-10-05", deliverableId: null, status: null, deliveredAt: null }]);

    const theirs = await call<Deliverable>(t.app, "POST", `/workspaces/${ws}/deliverables`, { token: owner, body: { eventId, title: "Film" } });
    const borrow = await call(t.app, "PATCH", `/workspaces/${ws}/bills/${walkIn.body.data.id}`, {
      token: owner,
      body: { deliverables: [{ title: "Film", deliverableId: theirs.body.data.id }] },
    });
    expect(borrow.status).toBe(400);
  });
});
