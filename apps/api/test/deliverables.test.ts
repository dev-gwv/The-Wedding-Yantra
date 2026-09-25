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

type D = {
  id: string;
  title: string;
  status: string;
  late: boolean;
  dueDate: string | null;
  link: string | null;
  eventTitle: string;
  clientName: string | null;
  assignee: { id: string; name: string | null } | null;
  deliveredAt: string | null;
  deliveredBy: { id: string } | null;
};

describe("deliverables", () => {
  it("plans what an event owes the client, lets whoever makes it hand it over, and shows it to the client", async () => {
    const owner = await signIn(t.app, "9740000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Lens Studio");
    const join = async (phone: string, name: string, role: string) => {
      const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
      const token = await signIn(t.app, phone, name);
      await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
      return token;
    };
    const staff = await join("9740000002", "Aman Editor", "staff");
    const other = await join("9740000003", "Sara Staff", "staff");
    const freelancer = await join("9740000004", "Pooja Freelance", "freelancer");
    const team = await call<{ members: { userId: string; name: string }[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    const idOf = (name: string) => team.body.data.members.find((m) => m.name === name)!.userId;

    const event = await call<{ id: string; clientId: string }>(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { title: "Rao wedding", newClient: { name: "Kavya Rao", phone: "9740000099" }, functions: [{ name: "Wedding", date: day(-10) }] },
    });
    const eventId = event.body.data.id;
    const add = (body: object, token = owner) => call<D>(t.app, "POST", `/workspaces/${ws}/deliverables`, { token, body: { eventId, ...body } });

    expect((await add({ title: "Edited photos" }, staff)).status).toBe(403);
    const photos = await add({ title: "Edited photos", dueDate: day(20), assigneeId: idOf("Aman Editor") });
    expect(photos.status).toBe(201);
    expect(photos.body.data).toMatchObject({ title: "Edited photos", status: "pending", late: false, eventTitle: "Rao wedding", clientName: "Kavya Rao" });
    const peek = await add({ title: "Sneak peek photos", dueDate: day(-3) });
    expect(peek.body.data.late).toBe(true);
    await add({ title: "Album", dueDate: day(3) });
    expect((await add({ title: "Film", link: "not a link" })).status).toBe(400);
    const stranger = await signIn(t.app, "9740000098");
    await createBusiness(t.app, stranger, "Elsewhere");
    const me = await call<{ user: { id: string } }>(t.app, "GET", "/auth/me", { token: stranger });
    expect((await add({ title: "Film", assigneeId: me.body.data.user.id })).body.error.fields?.assigneeId).toBeTruthy();

    // Freelancers see an event's deliverables only when they're on its team.
    const asFreelancer = () => call<D[]>(t.app, "GET", `/workspaces/${ws}/deliverables?eventId=${eventId}`, { token: freelancer });
    expect((await asFreelancer()).body.data).toEqual([]);
    await call(t.app, "PUT", `/workspaces/${ws}/events/${eventId}/team`, { token: owner, body: { members: [{ userId: idOf("Pooja Freelance") }] } });
    expect((await asFreelancer()).body.data.map((d) => d.title)).toEqual(["Sneak peek photos", "Album", "Edited photos"]);

    // Only its maker (or a manager) hands it over; nobody else changes the plan.
    const patch = (id: string, body: object, token: string) => call<D>(t.app, "PATCH", `/workspaces/${ws}/deliverables/${id}`, { token, body });
    expect((await patch(photos.body.data.id, { status: "delivered" }, other)).status).toBe(403);
    expect((await patch(photos.body.data.id, { title: "Photos" }, staff)).status).toBe(403);
    const done = await patch(photos.body.data.id, { status: "delivered", link: "https://gallery.example.com/rao" }, staff);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: "delivered", link: "https://gallery.example.com/rao", deliveredBy: { id: idOf("Aman Editor") } });
    expect(done.body.data.deliveredAt).toBeTruthy();
    // Unassigned: anyone on the event's team moves it along.
    expect((await patch(peek.body.data.id, { status: "in_progress" }, freelancer)).body.data.status).toBe("in_progress");
    const late = await patch(peek.body.data.id, { status: "delivered" }, owner);
    expect(late.body.data.late).toBe(false);

    const open = await call<D[]>(t.app, "GET", `/workspaces/${ws}/deliverables?status=open`, { token: owner });
    expect(open.body.data.map((d) => d.title)).toEqual(["Album"]);
    const delivered = await call<D[]>(t.app, "GET", `/workspaces/${ws}/deliverables?status=delivered`, { token: owner });
    expect(delivered.body.data.map((d) => d.title)).toEqual(["Sneak peek photos", "Edited photos"]);
    const mine = await call<D[]>(t.app, "GET", `/workspaces/${ws}/deliverables?mine=true`, { token: staff });
    expect(mine.body.data.map((d) => d.title)).toEqual(["Edited photos"]);

    const home = await call<{ deliverables: { late: number; dueThisWeek: number } }>(t.app, "GET", `/workspaces/${ws}/home`, { token: owner });
    expect(home.body.data.deliverables).toEqual({ late: 0, dueThisWeek: 1 });

    // The client sees what's coming, and the link once it's delivered.
    const shared = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/clients/${event.body.data.clientId}/portal`, { token: owner });
    const page = await call<{ events: { deliverables: { title: string; status: string; link: string | null }[] }[] }>(
      t.app,
      "GET",
      `/public/clients/${shared.body.data.token}`,
    );
    expect(page.body.data.events[0]!.deliverables).toEqual([
      expect.objectContaining({ title: "Sneak peek photos", status: "delivered", link: null }),
      expect.objectContaining({ title: "Album", status: "pending", link: null }),
      expect.objectContaining({ title: "Edited photos", status: "delivered", link: "https://gallery.example.com/rao" }),
    ]);

    const log = await call<{ items: { action: string; subject: string | null; detail: string | null; late: boolean }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/activity`,
      { token: owner },
    );
    const handed = log.body.data.items.filter((i) => i.action === "deliverable.delivered").map((i) => [i.subject, i.detail, i.late]);
    expect(handed).toEqual([
      ["Sneak peek photos", "Rao wedding", true],
      ["Edited photos", "Rao wedding", false],
    ]);

    // Deleting: a deliverable, then the whole event.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/deliverables/${peek.body.data.id}`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/deliverables/${peek.body.data.id}`, { token: owner })).status).toBe(200);
    await call(t.app, "DELETE", `/workspaces/${ws}/events/${eventId}`, { token: owner });
    expect((await call<D[]>(t.app, "GET", `/workspaces/${ws}/deliverables`, { token: owner })).body.data).toEqual([]);
  });
});
