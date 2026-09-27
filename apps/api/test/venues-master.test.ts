import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Venue = {
  id: string;
  name: string;
  venueType: string | null;
  venueTypeLabel: string | null;
  address: string | null;
  city: string | null;
  mapsUrl: string | null;
  contactPerson: string | null;
  phone: string | null;
  capacity: number | null;
  musicCutoff: string | null;
  outsideCatering: boolean | null;
  loadIn: string | null;
  archived: boolean;
  upcoming: number;
  events: { eventId: string; title: string; date: string | null; functions: string[] }[];
};
type Event = { id: string; venue: string | null; functions: { name: string; venue: string | null }[]; venues: { id: string; name: string; mapsUrl: string | null; musicCutoff: string | null }[] };

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

async function business(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const users: Record<string, { token: string; userId: string }> = {};
  for (const [n, role] of [
    [2, "staff"],
    [3, "accountant"],
    [4, "freelancer"],
  ] as const) {
    const phone = `${prefix}000000${n}`;
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: `${role} Person`, phone, role } });
    const token = await signIn(t.app, phone, `${role} Person`);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    const me = await call<{ user: { id: string } }>(t.app, "GET", "/auth/me", { token });
    users[role] = { token, userId: me.body.data.user.id };
  }
  return { owner, ws, ...users } as { owner: string; ws: string; staff: { token: string; userId: string }; accountant: { token: string; userId: string }; freelancer: { token: string; userId: string } };
}

const rambagh = {
  name: "Rambagh Palace",
  venueType: "palace",
  address: "Bhawani Singh Road",
  city: "Jaipur",
  mapsUrl: "https://maps.app.goo.gl/abc123",
  contactPerson: "Vikram (banquets)",
  phone: "9812300001",
  capacity: 800,
  musicCutoff: "22:00",
  outsideCatering: false,
  loadIn: "From 10 am, back gate",
  notes: "No confetti on the lawn",
};

const nextYear = new Date().getFullYear() + 1;

describe("the venue master", () => {
  it("keeps type, address, Maps link, contact and rules; one name per venue; logs changes", async () => {
    const { owner, ws } = await business("881");
    const made = await call<Venue>(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: rambagh });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ ...rambagh, venueTypeLabel: "Palace or heritage", phone: "+919812300001", archived: false, upcoming: 0, events: [] });

    const dup = await call(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: { name: "rambagh palace" } });
    expect(dup.status).toBe(409);

    const list = await call<Venue[]>(t.app, "GET", `/workspaces/${ws}/venues`, { token: owner });
    expect(list.body.data.map((v) => v.name)).toEqual(["Rambagh Palace"]);

    // Archive and bring back.
    await call(t.app, "PATCH", `/workspaces/${ws}/venues/${made.body.data.id}`, { token: owner, body: { archived: true } });
    expect((await call<Venue[]>(t.app, "GET", `/workspaces/${ws}/venues`, { token: owner })).body.data).toHaveLength(0);
    expect((await call<Venue[]>(t.app, "GET", `/workspaces/${ws}/venues?archived=true`, { token: owner })).body.data).toHaveLength(1);
    const again = await call(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: { name: "Rambagh Palace" } });
    expect(again.status).toBe(409);
    await call(t.app, "PATCH", `/workspaces/${ws}/venues/${made.body.data.id}`, { token: owner, body: { archived: false } });

    const activity = await call<{ items: { action: string; subject: string | null; link: { kind: string } | null }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, {
      token: owner,
    });
    const actions = activity.body.data.items.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["venue.added", "venue.archived", "venue.restored"]));
    expect(activity.body.data.items.find((a) => a.action === "venue.added")).toMatchObject({ subject: "Rambagh Palace", link: { kind: "venue" } });
  });

  it("shows on events by name, lists its events, and a new name follows onto them", async () => {
    const { owner, ws, freelancer } = await business("882");
    const venue = (await call<Venue>(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: rambagh })).body.data;
    const ev = await call<Event>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: {
        newClient: { name: "Rakesh Sharma" },
        title: "Priya weds Arjun",
        venue: " rambagh palace ",
        functions: [
          { name: "Mehendi", date: `${nextYear}-02-10`, venue: "Sharma house" },
          { name: "Wedding", date: `${nextYear}-02-11` },
        ],
      },
    });
    expect(ev.status).toBe(201);
    expect(ev.body.data.venues).toMatchObject([{ id: venue.id, name: "Rambagh Palace", mapsUrl: rambagh.mapsUrl, musicCutoff: "22:00" }]);

    const page = (await call<Venue>(t.app, "GET", `/workspaces/${ws}/venues/${venue.id}`, { token: owner })).body.data;
    expect(page.upcoming).toBe(1);
    expect(page.events).toMatchObject([{ eventId: ev.body.data.id, title: "Priya weds Arjun", date: `${nextYear}-02-11`, functions: ["Wedding"] }]);

    // The crew on the event see how to get there, though not the venue list.
    await call(t.app, "PUT", `/workspaces/${ws}/events/${ev.body.data.id}/team`, { token: owner, body: { members: [{ userId: freelancer.userId }] } });
    const asCrew = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${ev.body.data.id}`, { token: freelancer.token });
    expect(asCrew.body.data.venues[0]?.name).toBe("Rambagh Palace");
    expect((await call(t.app, "GET", `/workspaces/${ws}/venues`, { token: freelancer.token })).status).toBe(403);

    // Renaming keeps the event at the venue.
    await call(t.app, "PATCH", `/workspaces/${ws}/venues/${venue.id}`, { token: owner, body: { name: "Taj Rambagh Palace" } });
    const after = await call<Event>(t.app, "GET", `/workspaces/${ws}/events/${ev.body.data.id}`, { token: owner });
    expect(after.body.data.venue).toBe("Taj Rambagh Palace");
    expect(after.body.data.functions.find((f) => f.name === "Mehendi")?.venue).toBe("Sharma house");
    expect(after.body.data.venues[0]?.id).toBe(venue.id);
  });

  it("lets staff and the accountant look, and only owners and managers change", async () => {
    const { owner, ws, staff, accountant } = await business("883");
    const venue = (await call<Venue>(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: { name: "Green Lawns" } })).body.data;
    for (const u of [staff, accountant]) {
      expect((await call<Venue[]>(t.app, "GET", `/workspaces/${ws}/venues`, { token: u.token })).body.data).toHaveLength(1);
      expect((await call(t.app, "GET", `/workspaces/${ws}/venues/${venue.id}`, { token: u.token })).status).toBe(200);
      expect((await call(t.app, "POST", `/workspaces/${ws}/venues`, { token: u.token, body: { name: "Another" } })).status).toBe(403);
      expect((await call(t.app, "PATCH", `/workspaces/${ws}/venues/${venue.id}`, { token: u.token, body: { city: "Delhi" } })).status).toBe(403);
    }
  });

  it("checks what's typed, and keeps each business's venues to itself", async () => {
    const { owner, ws } = await business("884");
    const post = (body: object) => call(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: { name: "Test Venue", ...body } });
    expect((await post({ mapsUrl: "rambagh palace" })).status).toBe(400);
    expect((await post({ musicCutoff: "10 pm" })).status).toBe(400);
    expect((await post({ capacity: 0 })).status).toBe(400);
    expect((await post({ phone: "123" })).status).toBe(400);
    expect((await post({ venueType: "spaceship" })).status).toBe(400);

    const mine = (await call<Venue>(t.app, "POST", `/workspaces/${ws}/venues`, { token: owner, body: { name: "Mine" } })).body.data;
    const other = await business("885");
    expect((await call(t.app, "GET", `/workspaces/${other.ws}/venues/${mine.id}`, { token: other.owner })).status).toBe(404);
    expect((await call(t.app, "PATCH", `/workspaces/${other.ws}/venues/${mine.id}`, { token: other.owner, body: { name: "Stolen" } })).status).toBe(404);
    // Same name in another business is fine, and doesn't show on its events.
    expect((await call(t.app, "POST", `/workspaces/${other.ws}/venues`, { token: other.owner, body: { name: "Mine" } })).status).toBe(201);
  });
});
