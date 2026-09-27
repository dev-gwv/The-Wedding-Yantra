import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Client = {
  id: string;
  name: string;
  kind: string;
  archived: boolean;
  weddingDate: string | null;
  source: string | null;
  contacts: { name: string; relation: string | null; phone: string | null }[];
  wedding: { brideName: string | null; groomName: string | null; guestCount: number | null };
  billing: { name: string | null; address: string | null; stateCode: string | null; gstin: string | null };
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
  name: "Sharma Family",
  phone: "9822200011",
  city: "Jaipur",
  kind: "family",
  source: "instagram",
  contacts: [
    { name: "Priya Sharma", relation: "bride", phone: "9822200012" },
    { name: "Rakesh Sharma", relation: "father", phone: "9822200013" },
  ],
  wedding: { brideName: "Priya", groomName: "Arjun", guestCount: 450 },
  billing: { name: "Rakesh Sharma", address: "C-Scheme, Jaipur", stateCode: "08", gstin: "" },
};

describe("the client master", () => {
  it("keeps the family, the wedding and billing, and finds a client by any name or number", async () => {
    const { owner, ws } = await team("851");
    const made = await call<Client>(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: family });
    expect(made.status).toBe(201);
    const c = made.body.data;
    expect(c).toMatchObject({ kind: "family", source: "instagram", archived: false });
    expect(c.contacts.map((x) => [x.name, x.relation, x.phone])).toEqual([
      ["Priya Sharma", "bride", "+919822200012"],
      ["Rakesh Sharma", "father", "+919822200013"],
    ]);
    expect(c.wedding).toEqual({ brideName: "Priya", groomName: "Arjun", guestCount: 450 });
    expect(c.billing).toEqual({ name: "Rakesh Sharma", address: "C-Scheme, Jaipur", stateCode: "08", gstin: null });

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
      body: { contacts: [{ name: "Arjun Mehta", relation: "groom", phone: "9822200014" }], wedding: { guestCount: 500 } },
    });
    expect(edited.body.data.contacts.map((x) => x.name)).toEqual(["Arjun Mehta"]);
    expect(edited.body.data.wedding).toMatchObject({ guestCount: 500, brideName: "Priya" });
    const again = await call<Client>(t.app, "PATCH", `/workspaces/${ws}/clients/${c.id}`, { token: owner, body: { notes: "Loves marigolds" } });
    expect(again.body.data.contacts).toHaveLength(1);

    // Every change is in the activity log.
    const log = await call<{ items: { action: string; text?: string }[] }>(t.app, "GET", `/workspaces/${ws}/activity`, { token: owner });
    const actions = log.body.data.items.map((i) => i.action);
    expect(actions).toContain("client.added");
    expect(actions).toContain("client.updated");
  });

  it("checks relations, GST numbers and duplicates", async () => {
    const { owner, ws } = await team("852");
    const badList = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { ...family, contacts: [{ name: "X", relation: "martian" }] } });
    expect(badList.status).toBe(400);
    const badGst = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Co", billing: { gstin: "12345" } } });
    expect(badGst.status).toBe(400);
    expect(badGst.body.error.fields).toHaveProperty(["billing.gstin"]);

    const co = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Acme Events", kind: "company", billing: { gstin: "27abcde1234f1z5" } } });
    expect(co.status).toBe(201);
    const dupGst = await call(t.app, "POST", `/workspaces/${ws}/clients`, { token: owner, body: { name: "Acme again", billing: { gstin: "27ABCDE1234F1Z5" } } });
    expect(dupGst.status).toBe(409);
    expect(dupGst.body.error.message).toBe("Another client already has this GST number");
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

  it("fills an invoice from the client's billing details and state", async () => {
    const { owner, ws } = await team("854");
    await call(t.app, "PATCH", `/workspaces/${ws}`, { token: owner, body: { gstin: "08ABCDE1234F1Z5" } });
    const c = (
      await call<Client>(t.app, "POST", `/workspaces/${ws}/clients`, {
        token: owner,
        body: { name: "Mehta Family", phone: "9811100002", billing: { name: "Mehta Traders", address: "Linking Road, Mumbai 400050", gstin: "27ABCDE1234F1Z5" } },
      })
    ).body.data;
    const draft = await call<{ billTo: { name: string; address: string | null; gstin: string | null }; placeOfSupply: string | null }>(
      t.app,
      "GET",
      `/workspaces/${ws}/bill-draft?clientId=${c.id}`,
      { token: owner },
    );
    expect(draft.body.data.billTo).toMatchObject({ name: "Mehta Traders", address: "Linking Road, Mumbai 400050", gstin: "27ABCDE1234F1Z5" });
    // Maharashtra client, Rajasthan business: IGST.
    expect(draft.body.data.placeOfSupply).toBe("27");
  });
});
