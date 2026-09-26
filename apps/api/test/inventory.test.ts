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

type Item = { id: string; name: string; quantity: number; outNow: number; available: number | null };
type Booking = { id: string; quantity: number; fromDate: string; toDate: string; status: string; missing: number; short: number; itemName: string };

describe("inventory", () => {
  it("sets stock aside for events, warns when overlapping events need more than you own, and tracks what's out", async () => {
    const owner = await signIn(t.app, "9760000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Bloom Decor");
    const join = async (phone: string, role: string) => {
      const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: role, phone, role } });
      const token = await signIn(t.app, phone);
      await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
      return token;
    };
    const staff = await join("9760000002", "staff");
    const freelancer = await join("9760000003", "freelancer");
    const accountant = await join("9760000004", "accountant");

    expect((await call(t.app, "POST", `/workspaces/${ws}/inventory`, { token: staff, body: { name: "Chairs", quantity: 10 } })).status).toBe(403);
    const chairs = await call<Item>(t.app, "POST", `/workspaces/${ws}/inventory`, { token: owner, body: { name: "Chiavari chairs", category: "Furniture", quantity: 100 } });
    expect(chairs.status).toBe(201);
    expect(chairs.body.data).toMatchObject({ quantity: 100, outNow: 0, available: null });
    expect((await call(t.app, "POST", `/workspaces/${ws}/inventory`, { token: owner, body: { name: "Lights", quantity: -1 } })).status).toBe(400);
    expect((await call(t.app, "GET", `/workspaces/${ws}/inventory`, { token: freelancer })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/inventory`, { token: accountant })).status).toBe(200);

    const event = async (title: string, dates: string[]) =>
      (
        await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
          token: owner,
          body: { title, newClient: { name: `${title} client` }, functions: dates.map((date) => ({ name: "Function", date })) },
        })
      ).body.data.id;
    const a = await event("Rao wedding", [day(10), day(11)]);
    const b = await event("Sethi reception", [day(11), day(12)]);
    const c = await event("Iyer mehendi", [day(20)]);

    const book = (body: object, token = owner) => call<Booking>(t.app, "POST", `/workspaces/${ws}/inventory-bookings`, { token, body: { itemId: chairs.body.data.id, ...body } });
    const forA = await book({ eventId: a, quantity: 80 });
    expect(forA.status).toBe(201);
    expect(forA.body.data).toMatchObject({ fromDate: day(10), toDate: day(11), status: "booked", short: 0 });
    // Both on day 11: 120 of 100. A warning, not a refusal.
    const forB = await book({ eventId: b, quantity: 40 });
    expect(forB.body.data.short).toBe(20);
    const onA = await call<Booking[]>(t.app, "GET", `/workspaces/${ws}/inventory-bookings?eventId=${a}`, { token: owner });
    expect(onA.body.data[0]!.short).toBe(20);
    await book({ eventId: c, quantity: 10 });
    expect((await book({ eventId: a, quantity: 1, fromDate: day(5), toDate: day(4) })).status).toBe(400);

    const free = async (from: string, to: string) =>
      (await call<Item[]>(t.app, "GET", `/workspaces/${ws}/inventory?from=${from}&to=${to}`, { token: owner })).body.data[0]!.available;
    expect(await free(day(10), day(10))).toBe(20);
    expect(await free(day(10), day(12))).toBe(0);
    expect(await free(day(30), day(31))).toBe(100);

    // The crew loads it; planning stays with the owner and managers.
    const patch = (id: string, body: object, token: string) => call<Booking>(t.app, "PATCH", `/workspaces/${ws}/inventory-bookings/${id}`, { token, body });
    expect((await patch(forA.body.data.id, { quantity: 90 }, staff)).status).toBe(403);
    expect((await patch(forA.body.data.id, { status: "out" }, staff)).body.data.status).toBe("out");
    expect((await call<Item[]>(t.app, "GET", `/workspaces/${ws}/inventory`, { token: owner })).body.data[0]!.outNow).toBe(80);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/inventory-bookings/${forA.body.data.id}`, { token: owner })).body.error.code).toBe("BOOKING_OUT");

    // Back with 5 missing: stock drops to 95, and A no longer holds chairs on day 11.
    expect((await patch(forA.body.data.id, { status: "returned", missing: 81 }, staff)).status).toBe(400);
    const back = await patch(forA.body.data.id, { status: "returned", missing: 5 }, staff);
    expect(back.body.data).toMatchObject({ status: "returned", missing: 5, short: 0 });
    const items = await call<Item[]>(t.app, "GET", `/workspaces/${ws}/inventory`, { token: owner });
    expect(items.body.data[0]).toMatchObject({ quantity: 95, outNow: 0 });
    const onB = await call<Booking[]>(t.app, "GET", `/workspaces/${ws}/inventory-bookings?eventId=${b}`, { token: owner });
    expect(onB.body.data[0]!.short).toBe(0);
    // Marked back by mistake: the missing ones go back on the stock.
    await patch(forA.body.data.id, { status: "out" }, owner);
    expect((await call<Item[]>(t.app, "GET", `/workspaces/${ws}/inventory`, { token: owner })).body.data[0]!.quantity).toBe(100);
    await patch(forA.body.data.id, { status: "returned" }, owner);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/inventory-bookings/${forA.body.data.id}`, { token: owner })).status).toBe(200);

    // A cancelled event frees its stock.
    await call(t.app, "PATCH", `/workspaces/${ws}/events/${c}`, { token: owner, body: { status: "cancelled" } });
    expect(await free(day(20), day(20))).toBe(100);

    // Stock set aside for a coming event can't be deleted.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/inventory/${chairs.body.data.id}`, { token: owner })).body.error.code).toBe("ITEM_IN_USE");

    // An event with no dates needs days picked.
    const undated = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { title: "Undated", newClient: { name: "Someone" }, functions: [{ name: "Function", date: day(40) }] },
    });
    await call(t.app, "PATCH", `/workspaces/${ws}/events/${undated.body.data.id}`, { token: owner, body: { functions: [{ name: "Function", date: day(41) }] } });
    expect((await book({ eventId: undated.body.data.id, quantity: 2 })).body.data.fromDate).toBe(day(41));

    // Another business can't use this stock.
    const other = await signIn(t.app, "9760000099");
    const otherWs = await createBusiness(t.app, other, "Elsewhere");
    const theirEvent = await call<{ id: string }>(t.app, "POST", `/workspaces/${otherWs}/events`, {
      token: other,
      body: { title: "Theirs", newClient: { name: "X Person" }, functions: [{ name: "Wedding", date: day(3) }] },
    });
    const stolen = await call(t.app, "POST", `/workspaces/${otherWs}/inventory-bookings`, {
      token: other,
      body: { itemId: chairs.body.data.id, eventId: theirEvent.body.data.id, quantity: 1 },
    });
    expect(stolen.status).toBe(400);
  });
});
