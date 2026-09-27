import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Client = {
  id: string;
  name: string;
  kind: string;
  relation: string | null;
  archived: boolean;
  weddingDate: string | null;
  source: string | null;
  contacts: { name: string; relation: string | null; phone: string | null }[];
  wedding: { brideName: string | null; groomName: string | null; guestCount: number | null };
};

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Owner Person");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  return { owner, ws, staff: await join(`${prefix}0000002`, "staff", "Staff Person"), accountant: await join(`${prefix}0000003`, "accountant", "Acc Person") };
}

const family = {
  name: "Rakesh Sharma",
  relation: "brides_father",
  phone: "9822200011",
  city: "Jaipur",
  kind: "family",
  source: "instagram",
  contacts: [
    { name: "Sunita Sharma", relation: "brides_mother", phone: "9822200012" },
    { name: "Vikram Mehta", relation: "grooms_father", phone: "9822200013" },
  ],
  wedding: { brideName: "Priya", groomName: "Arjun", guestCount: 450 },
};

describe("the client master", () => {
  it("keeps who booked, emergency contacts and the wedding, and finds a client by any name or number", async () => {
    const { owner, ws } = await team("851");
    const made = await call<Client>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: family });
    expect(made.status).toBe(201);
    const c = made.body.data;
    expect(c).toMatchObject({ name: "Rakesh Sharma", relation: "brides_father", source: "instagram", archived: false });
    expect(c).not.toHaveProperty("billing");
    expect(c.contacts.map((x) => [x.name, x.relation, x.phone])).toEqual([
      ["Sunita Sharma", "brides_mother", "+919822200012"],
      ["Vikram Mehta", "grooms_father", "+919822200013"],
    ]);
    expect(c.wedding).toEqual({ brideName: "Priya", groomName: "Arjun", guestCount: 450 });

    // Found by the groom's name and by a contact's number.
    const byGroom = await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/clients?q=Arjun`, { token: owner });
    expect(byGroom.body.data.map((x) => x.id)).toEqual([c.id]);
    const byContact = await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/clients?q=22200013`, { token: owner });
    expect(byContact.body.data.map((x) => x.id)).toEqual([c.id]);

    // The wedding date comes from the events.
    await call(t.app, "POST", `/workspaces/${ws}/events`, {
      token: owner,
      body: { clientId: c.id, title: "Sharma wedding", functions: [{ name: "Mehendi", date: "2099-12-01" }, { name: "Wedding", date: "2099-12-02" }] },
    });
    const got = await call<Client>(t.app, "GET", `/workspaces/${ws}/clients/${c.id}`, { token: owner });
    expect(got.body.data.weddingDate).toBe("2099-12-01");

    // Contacts are replaced as a whole when sent, and left alone when not.
    const edited = await call<Client>(t.app, "PATCH", `/workspaces/${ws}/clients/${c.id}`, {
      token: owner,
      body: { contacts: [{ name: "Vikram Mehta", relation: "grooms_father", phone: "9822200014" }], wedding: { guestCount: 500 } },
    });
    expect(edited.body.data.contacts.map((x) => x.name)).toEqual(["Vikram Mehta"]);
    expect(edited.body.data.wedding).toMatchObject({ guestCount: 500, brideName: "Priya" });
    const again = await call<Client>(t.app, "PATCH", `/workspaces/${ws}/clients/${c.id}`, { token: owner, body: { notes: "Loves marigolds" } });
    expect(again.body.data.contacts).toHaveLength(1);

    // Every change is in the activity log.
    const log = await call<{ items: { action: string; text?: string }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner });
    const actions = log.body.data.items.map((i) => i.action);
    expect(actions).toContain("client.added");
    expect(actions).toContain("client.updated");
  });

  it("checks relationships and duplicate numbers", async () => {
    const { owner, ws } = await team("852");
    const badClient = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Asha Rao", relation: "martian" } });
    expect(badClient.status).toBe(400);
    expect(badClient.body.error.fields).toHaveProperty("relation");
    const badContact = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Asha Rao", contacts: [{ name: "Ravi Rao", relation: "martian" }] } });
    expect(badContact.status).toBe(400);
    // The earlier choices are hidden from new records.
    const hidden = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Asha Rao", relation: "planner" } });
    expect(hidden.status).toBe(400);

    await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "First", phone: "9811100001" } });
    const dupPhone = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Second", phone: "9811100001" } });
    expect(dupPhone.status).toBe(409);
  });

  it("archives instead of deleting, and keeps each role to its part", async () => {
    const { owner, ws, staff, accountant } = await team("853");
    const c = (await call<Client>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Old client" } })).body.data;
    await call(t.app, "PATCH", `/workspaces/${ws}/clients/${c.id}`, { token: owner, body: { archived: true } });
    expect((await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/clients`, { token: owner })).body.data.map((x) => x.id)).not.toContain(c.id);
    expect((await call<{ id: string }[]>(t.app, "GET", `/workspaces/${ws}/clients?archived=true`, { token: owner })).body.data.map((x) => x.id)).toEqual([c.id]);
    const back = await call<Client>(t.app, "PATCH", `/workspaces/${ws}/clients/${c.id}`, { token: owner, body: { archived: false } });
    expect(back.body.data.archived).toBe(false);

    expect((await call(t.app, "GET", `/workspaces/${ws}/clients`, { token: staff })).status).toBe(403);
    expect((await call(t.app, "GET", `/workspaces/${ws}/clients/${c.id}`, { token: accountant })).status).toBe(200);
    expect((await call(t.app, "PATCH", `/workspaces/${ws}/clients/${c.id}`, { token: accountant, body: { notes: "x" } })).status).toBe(403);

    // Another business can't see it.
    const other = await signIn(t.app, "8539999999", "Stranger");
    await createBusiness(t.app, other, "Elsewhere");
    expect((await call(t.app, "GET", `/workspaces/${ws}/clients/${c.id}`, { token: other })).status).toBe(404);
  });
});
