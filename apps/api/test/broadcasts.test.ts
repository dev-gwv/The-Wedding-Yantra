import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const shift = (iso: string, days: number, years = 0) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type Preview = { count: number; names: string[] };
type Recipient = { id: string; name: string; phone: string; clientId: string | null; sentAt: string | null; skippedAt: string | null };
type Detail = { id: string; audience: string; counts: { total: number; sent: number; skipped: number }; recipients: Recipient[] };

describe("messages to clients", () => {
  it("picks the right people, ticks them off and respects those who opt out", async () => {
    const owner = await signIn(t.app, "9790000001", "Riya Owner");
    const ws = await createBusiness(t.app, owner, "Riya Makeup Studio");
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: "Aman", phone: "9790000002", role: "staff" } });
    const staff = await signIn(t.app, "9790000002", "Aman");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: staff });
    const preview = async (audience: string) =>
      (await call<Preview>(t.app, "GET", `/workspaces/${ws}/broadcasts/audience?audience=${audience}`, { token: owner })).body.data;
    const event = (body: object) => call<{ id: string; clientId: string }>(t.app, "POST", `/workspaces/${ws}/events`, { token: owner, body });

    // Nobody yet.
    expect(await preview("all_clients")).toEqual({ audience: "all_clients", count: 0, names: [] });
    const none = await call(t.app, "POST", `/workspaces/${ws}/broadcasts`, { token: owner, body: { title: "Diwali", message: "Happy Diwali {first_name}!", audience: "all_clients" } });
    expect(none.status).toBe(409);

    // A couple married two years ago this week, a wedding done last month, one coming up,
    // a client without a number, and a lost enquiry.
    await event({ newClient: { name: "Neha Kapoor", phone: "9811111111" }, title: "Kapoor wedding", functions: [{ name: "Wedding", date: shift(today(), 3, -2) }] });
    await event({ newClient: { name: "Priya Shah", phone: "9822222222" }, title: "Shah wedding", functions: [{ name: "Sangeet", date: shift(today(), -30) }] });
    await event({ newClient: { name: "Anjali Rao", phone: "9833333333" }, title: "Rao wedding", functions: [{ name: "Wedding", date: shift(today(), 40) }] });
    await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "No Number" } });
    const stages = (await call<{ stages: { id: string; kind: string }[] }>(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).body.data.stages;
    const lost = stages.find((s) => s.kind === "lost")!;
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Meera Iyer", phone: "9844444444" } });
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${lead.body.data.id}`, { token: owner, body: { stageId: lost.id, lostReason: "price" } });
    // A lost enquiry from someone who is a client anyway isn't asked again.
    const again = await call<{ id: string }>(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Anjali Rao", phone: "9833333333" } });
    await call(t.app, "PATCH", `/workspaces/${ws}/leads/${again.body.data.id}`, { token: owner, body: { stageId: lost.id, lostReason: "date" } });

    expect(await preview("all_clients")).toMatchObject({ count: 3, names: ["Anjali", "Neha", "Priya"] });
    expect(await preview("past_clients")).toMatchObject({ count: 2, names: ["Neha", "Priya"] });
    expect(await preview("anniversaries")).toMatchObject({ count: 1, names: ["Neha"] });
    expect(await preview("lost_enquiries")).toMatchObject({ count: 1, names: ["Meera"] });

    // Only owners and managers.
    expect((await call(t.app, "GET", `/workspaces/${ws}/broadcasts`, { token: staff })).status).toBe(403);
    const body = { title: "Diwali wishes", message: "Happy Diwali, {first_name}! Warm wishes from {business}.", audience: "past_clients" };
    expect((await call(t.app, "POST", `/workspaces/${ws}/broadcasts`, { token: staff, body })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/broadcasts`, { token: owner, body: { ...body, audience: "everyone" } })).status).toBe(400);

    const made = await call<Detail>(t.app, "POST", `/workspaces/${ws}/broadcasts`, { token: owner, body });
    expect(made.status).toBe(201);
    expect(made.body.data.counts).toEqual({ total: 2, sent: 0, skipped: 0 });
    const [neha, priya] = made.body.data.recipients as [Recipient, Recipient];
    expect([neha.name, priya.name]).toEqual(["Neha Kapoor", "Priya Shah"]);
    expect(neha.phone).toBe("+919811111111");

    // Ticked off one by one; sending twice keeps the first time.
    const path = `/workspaces/${ws}/broadcasts/${made.body.data.id}/recipients`;
    const sent = await call<Recipient>(t.app, "PATCH", `${path}/${neha.id}`, { token: owner, body: { status: "sent" } });
    expect(sent.body.data.sentAt).not.toBeNull();
    const twice = await call<Recipient>(t.app, "PATCH", `${path}/${neha.id}`, { token: owner, body: { status: "sent" } });
    expect(twice.body.data.sentAt).toBe(sent.body.data.sentAt);
    // Priya asks not to get these: skipped, and left out from now on.
    const skipped = await call<Recipient>(t.app, "PATCH", `${path}/${priya.id}`, { token: owner, body: { status: "skipped", noMoreMessages: true } });
    expect(skipped.body.data).toMatchObject({ sentAt: null, skippedAt: expect.any(String) });
    const list = await call<Detail[]>(t.app, "GET", `/workspaces/${ws}/broadcasts`, { token: owner });
    expect(list.body.data[0]!.counts).toEqual({ total: 2, sent: 1, skipped: 1 });
    expect(await preview("past_clients")).toMatchObject({ count: 1, names: ["Neha"] });
    const client = await call<{ noMessages: boolean }>(t.app, "GET", `/workspaces/${ws}/clients/${priya.clientId}`, { token: owner });
    expect(client.body.data.noMessages).toBe(true);
    // And back in when she changes her mind.
    await call(t.app, "PATCH", `/workspaces/${ws}/clients/${priya.clientId}`, { token: owner, body: { noMessages: false } });
    expect((await preview("past_clients")).count).toBe(2);
    // Undo a tick.
    expect((await call<Recipient>(t.app, "PATCH", `${path}/${neha.id}`, { token: owner, body: { status: "pending" } })).body.data.sentAt).toBeNull();

    // Enquiries can't be opted out (they aren't clients); the list is fixed once made.
    const win = await call<Detail>(t.app, "POST", `/workspaces/${ws}/broadcasts`, {
      token: owner,
      body: { title: "Still planning?", message: "Hi {first_name}, we have dates open. {business}", audience: "lost_enquiries" },
    });
    const meera = win.body.data.recipients[0]!;
    expect(meera).toMatchObject({ name: "Meera Iyer", clientId: null });
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/broadcasts/${win.body.data.id}/recipients/${meera.id}`, { token: owner, body: { status: "skipped", noMoreMessages: true } })).status).toBe(400);

    // Another business sees none of it.
    const other = await signIn(t.app, "9790000003", "Other Owner");
    const ws2 = await createBusiness(t.app, other, "Other Studio");
    expect((await call(t.app, "GET", `/workspaces/${ws2}/broadcasts/${made.body.data.id}`, { token: other })).status).toBe(404);
    expect((await call(t.app, "PATCH", `/workspaces/${ws2}/broadcasts/${made.body.data.id}/recipients/${neha.id}`, { token: other, body: { status: "sent" } })).status).toBe(404);

    // Deleted messages leave the list.
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/broadcasts/${win.body.data.id}`, { token: owner })).body.data).toEqual({ deleted: true });
    expect((await call<Detail[]>(t.app, "GET", `/workspaces/${ws}/broadcasts`, { token: owner })).body.data).toHaveLength(1);
  });
});
