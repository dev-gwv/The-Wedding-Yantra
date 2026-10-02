import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type DateCheck = { date: string; booked: number; capacity: number; full: boolean; events: { eventId: string; eventTitle: string; functionName: string }[] };
type Event = { id: string; clashes: { date: string; eventTitle: string }[] };
type Member = { id: string; name: string | null };

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, name: string, role: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    const members = (await call<{ members: Member[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
    return { token, id: members.find((m) => m.name === name)!.id };
  };
  return { owner, ws, join };
}

const event = (ws: string, token: string, title: string, dates: string[]) =>
  call<Event>(t.app, "POST", `/workspaces/${ws}/events`, {
    token,
    body: { newClient: { name: `${title} Family` }, title, functions: dates.map((date, i) => ({ name: `Day ${i + 1}`, date })) },
  });

const check = async (ws: string, token: string, query: string) => {
  const res = await call<DateCheck[]>(t.app, "GET", `/workspaces/${ws}/date-check?${query}`, { token });
  expect(res.status).toBe(200);
  return res.body.data;
};

describe("date check", () => {
  it("counts each day's events against how many the business takes", async () => {
    const { owner, ws } = await business("961");
    const sharma = await event(ws, owner, "Sharma wedding", ["2026-12-05", "2026-12-06"]);
    expect(sharma.status).toBe(201);
    // A cancelled event doesn't take the day.
    const gone = await event(ws, owner, "Called off", ["2026-12-05"]);
    await call(t.app, "PATCH", `/workspaces/${ws}/events/${gone.body.data.id}`, { token: owner, body: { status: "cancelled" } });

    const days = await check(ws, owner, "dates=2026-12-05,2026-12-06,2026-12-07");
    expect(days.map(({ events, ...d }) => ({ ...d, titles: events.map((e) => e.eventTitle) }))).toEqual([
      { date: "2026-12-05", booked: 1, capacity: 1, full: true, titles: ["Sharma wedding"] },
      { date: "2026-12-06", booked: 1, capacity: 1, full: true, titles: ["Sharma wedding"] },
      { date: "2026-12-07", booked: 0, capacity: 1, full: false, titles: [] },
    ]);
    // Editing the event itself doesn't count it.
    const editing = await check(ws, owner, `dates=2026-12-05&excludeEventId=${sharma.body.data.id}`);
    expect(editing[0]).toMatchObject({ booked: 0, full: false, events: [] });
    // Bad dates are refused.
    expect((await call(t.app, "GET", `/workspaces/${ws}/date-check?dates=5-12-2026`, { token: owner })).status).toBe(400);
    expect((await call(t.app, "GET", `/workspaces/${ws}/date-check?dates=`, { token: owner })).status).toBe(400);

    // With three teams, one wedding doesn't fill the day.
    const set = await call<{ eventsPerDay: number }>(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { eventsPerDay: 3 } });
    expect(set.body.data.eventsPerDay).toBe(3);
    expect((await check(ws, owner, "dates=2026-12-05"))[0]).toMatchObject({ booked: 1, capacity: 3, full: false });
  });

  it("warns about clashes only once a day is at capacity", async () => {
    const { owner, ws } = await business("962");
    await event(ws, owner, "First", ["2026-11-20"]);
    const clashes = async () =>
      (await call<{ eventTitle: string }[]>(t.app, "GET", `/workspaces/${ws}/event-clashes?dates=2026-11-20`, { token: owner })).body.data;

    // One a day: the second booking clashes.
    expect((await clashes()).map((c) => c.eventTitle)).toEqual(["First"]);

    await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { eventsPerDay: 3 } });
    expect(await clashes()).toEqual([]);
    const second = await event(ws, owner, "Second", ["2026-11-20"]);
    expect(second.body.data.clashes).toEqual([]);
    const third = await event(ws, owner, "Third", ["2026-11-20"]);
    expect(third.body.data.clashes).toEqual([]);
    // Three booked: a fourth would be over, and the event page says so.
    expect((await clashes()).map((c) => c.eventTitle)).toEqual(["First", "Second", "Third"]);
    const fourth = await event(ws, owner, "Fourth", ["2026-11-20"]);
    expect(fourth.body.data.clashes.map((c) => c.eventTitle)).toEqual(["First", "Second", "Third"]);
    // Two functions of one event on a day count once.
    await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { eventsPerDay: 2 } });
    const twice = await call<Event>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { newClient: { name: "Twice Family" }, title: "Twice", functions: [{ name: "Haldi", date: "2026-11-21" }, { name: "Sangeet", date: "2026-11-21" }] },
    });
    expect(twice.status).toBe(201);
    expect((await check(ws, owner, "dates=2026-11-21"))[0]).toMatchObject({ booked: 1, capacity: 2, full: false });
    expect((await call<unknown[]>(t.app, "GET", `/workspaces/${ws}/event-clashes?dates=2026-11-21`, { token: owner })).body.data).toEqual([]);
  });

  it("tells people who don't see every event how full a day is, but not which events", async () => {
    const { owner, ws, join } = await business("963");
    await event(ws, owner, "Private wedding", ["2026-12-12"]);
    const arfin = await join("9630000002", "Arfin Khan", "staff");
    const freelancer = await join("9630000003", "Farah Freelance", "freelancer");
    const accountant = await join("9630000004", "Kabir Accounts", "accountant");

    // Sales with the events screen sees which events.
    await call(t.app, "PUT", `/workspaces/${ws}/members/${arfin.id}/access`, { token: owner, body: { department: "sales" } });
    expect((await check(ws, arfin.token, "dates=2026-12-12"))[0]!.events.map((e) => e.eventTitle)).toEqual(["Private wedding"]);

    // Without it, only how full the day is.
    await call(t.app, "PUT", `/workspaces/${ws}/departments/sales/access`, { token: owner, body: { areas: ["leads", "quotes"] } });
    expect((await check(ws, arfin.token, "dates=2026-12-12"))[0]).toEqual({ date: "2026-12-12", booked: 1, capacity: 1, full: true, events: [] });
    expect((await check(ws, freelancer.token, "dates=2026-12-12"))[0]).toMatchObject({ booked: 1, full: true, events: [] });
    // The event clash list still needs every event.
    expect((await call(t.app, "GET", `/workspaces/${ws}/event-clashes?dates=2026-12-12`, { token: arfin.token })).status).toBe(403);

    // Someone with only the money screen has no use for it.
    await call(t.app, "PUT", `/workspaces/${ws}/departments/accountant/access`, { token: owner, body: { areas: ["money"] } });
    await call(t.app, "PUT", `/workspaces/${ws}/members/${accountant.id}/access`, { token: owner, body: { department: "accountant" } });
    expect((await call(t.app, "GET", `/workspaces/${ws}/date-check?dates=2026-12-12`, { token: accountant.token })).status).toBe(403);

    // Another business's events never count.
    const other = await business("964");
    expect((await check(other.ws, other.owner, "dates=2026-12-12"))[0]).toMatchObject({ booked: 0, full: false, events: [] });
  });
});
