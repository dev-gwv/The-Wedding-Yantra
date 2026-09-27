import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

type Employee = {
  id: string;
  name: string | null;
  role: string;
  isYou: boolean;
  designation: string | null;
  designationLabel: string | null;
  employmentType: string | null;
  joinedOn: string | null;
  leftAt: string | null;
  emergency: { name: string | null; phone: string | null } | null;
  pay: { payType: string | null; payAmount: number | null; upiId: string | null; bankAccount: string | null; ifsc: string | null; pan: string | null } | null;
};
type Team = {
  members: { id: string; name: string; designationLabel: string | null; employmentType: string | null }[];
  former: { id: string; name: string; designationLabel: string | null; leftAt: string }[];
};

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
  const join = async (phone: string, role: string, name: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const manager = await join(`${prefix}0000002`, "manager", "Manager Person");
  const staff = await join(`${prefix}0000003`, "staff", "Staff Person");
  const freelancer = await join(`${prefix}0000004`, "freelancer", "Free Person");
  const accountant = await join(`${prefix}0000005`, "accountant", "Acc Person");
  const list = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
  const idOf = (name: string) => list.body.data.members.find((m) => m.name === name)!.id;
  return { owner, ws, manager, staff, freelancer, accountant, idOf, invite: join };
}

const details = {
  designation: "photographer",
  employmentType: "full_time",
  joinedOn: "2024-04-01",
  emergencyName: "Suresh Kumar",
  emergencyPhone: "9812300009",
  payType: "monthly",
  payAmount: 25000,
  upiId: "staff@okaxis",
  bankAccount: "1234 5678 9012",
  ifsc: "sbin0001234",
  pan: "abcde1234f",
};

describe("the employee master", () => {
  it("keeps work details, an emergency contact, pay and bank, and logs the change", async () => {
    const { owner, ws, idOf } = await business("871");
    const id = idOf("Staff Person");
    const saved = await call<Employee>(t.app, "PUT", `/workspaces/${ws}/members/${id}/details`, { token: owner, body: details });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({
      designation: "photographer",
      designationLabel: "Photographer",
      employmentType: "full_time",
      joinedOn: "2024-04-01",
      emergency: { name: "Suresh Kumar", phone: "+919812300009" },
      pay: { payType: "monthly", payAmount: 25000, upiId: "staff@okaxis", bankAccount: "123456789012", ifsc: "SBIN0001234", pan: "ABCDE1234F" },
    });

    // Fields left out keep what they had; an empty one clears.
    const again = await call<Employee>(t.app, "PUT", `/workspaces/${ws}/members/${id}/details`, { token: owner, body: { employmentType: "part_time", pan: "" } });
    expect(again.body.data.employmentType).toBe("part_time");
    expect(again.body.data.designation).toBe("photographer");
    expect(again.body.data.pay?.pan).toBeNull();

    const team = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    expect(team.body.data.members.find((m) => m.id === id)).toMatchObject({ designationLabel: "Photographer", employmentType: "part_time" });

    const activity = await call<{ items: { action: string; subject: string | null; link: { kind: string; id: string | null } | null }[] }>(
      t.app,
      "GET",
      `/workspaces/${ws}/activity`,
      { token: owner },
    );
    const item = activity.body.data.items.find((a) => a.action === "member.details_updated");
    expect(item).toMatchObject({ subject: "Staff Person", link: { kind: "team", id } });
  });

  it("shows pay and bank only to the owner and the person, the emergency contact to managers too", async () => {
    const { owner, ws, manager, staff, freelancer, accountant, idOf } = await business("872");
    const id = idOf("Staff Person");
    await call(t.app, "PUT", `/workspaces/${ws}/members/${id}/details`, { token: owner, body: details });

    const asManager = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/${id}`, { token: manager });
    expect(asManager.body.data.designationLabel).toBe("Photographer");
    expect(asManager.body.data.emergency?.name).toBe("Suresh Kumar");
    expect(asManager.body.data.pay).toBeNull();

    const asAccountant = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/${id}`, { token: accountant });
    expect(asAccountant.status).toBe(200);
    expect(asAccountant.body.data.emergency).toBeNull();
    expect(asAccountant.body.data.pay).toBeNull();

    const self = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/me`, { token: staff });
    expect(self.body.data).toMatchObject({ id, isYou: true, pay: { payAmount: 25000, pan: "ABCDE1234F" }, emergency: { name: "Suresh Kumar" } });

    // A colleague's private details stay private, and freelancers see only themselves.
    const colleague = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/${idOf("Manager Person")}`, { token: staff });
    expect(colleague.body.data.pay).toBeNull();
    expect(colleague.body.data.emergency).toBeNull();
    expect((await call(t.app, "GET", `/workspaces/${ws}/members/${id}`, { token: freelancer })).status).toBe(404);
    const freeSelf = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/me`, { token: freelancer });
    expect(freeSelf.body.data).toMatchObject({ name: "Free Person", isYou: true, pay: { payAmount: null } });

    // Only the owner changes details: not managers, not the person themselves.
    for (const token of [manager, staff]) {
      expect((await call(t.app, "PUT", `/workspaces/${ws}/members/${id}/details`, { token, body: { payType: "monthly", payAmount: 90000 } })).status).toBe(403);
    }
  });

  it("checks what's typed", async () => {
    const { owner, ws, idOf } = await business("873");
    const id = idOf("Staff Person");
    const put = (body: object) => call<Employee>(t.app, "PUT", `/workspaces/${ws}/members/${id}/details`, { token: owner, body });
    expect((await put({ pan: "ABC123" })).status).toBe(400);
    expect((await put({ ifsc: "SBIN1234" })).status).toBe(400);
    expect((await put({ payAmount: 500 })).status).toBe(400);
    expect((await put({ emergencyPhone: "12345" })).status).toBe(400);
    const unknown = await put({ designation: "astronaut" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error?.fields?.designation).toBeTruthy();

    // A designation the business added itself works.
    const added = await call<{ key: string }>(t.app, "POST", `/workspaces/${ws}/options`, { token: owner, body: { list: "designation", label: "Drone pilot" } });
    expect(added.status).toBe(201);
    const withIt = await put({ designation: added.body.data.key });
    expect(withIt.body.data.designationLabel).toBe("Drone pilot");
  });

  it("keeps the record of someone who left, and gives it back when they return", async () => {
    const { owner, ws, manager, staff, idOf, invite } = await business("874");
    const id = idOf("Staff Person");
    await call(t.app, "PUT", `/workspaces/${ws}/members/${id}/details`, { token: owner, body: details });
    expect((await call(t.app, "DELETE", `/workspaces/${ws}/members/${id}`, { token: owner })).status).toBe(200);

    const team = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: manager });
    expect(team.body.data.members.some((m) => m.id === id)).toBe(false);
    expect(team.body.data.former).toMatchObject([{ id, name: "Staff Person", designationLabel: "Photographer" }]);
    const left = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/${id}`, { token: owner });
    expect(left.body.data.leftAt).toBeTruthy();
    expect(left.body.data.pay?.pan).toBe("ABCDE1234F");
    expect((await call(t.app, "GET", `/workspaces/${ws}/members/me`, { token: staff })).status).toBe(404);

    // Coming back: a fresh membership that starts with the same details, and no longer under Left.
    const back = await invite("8740000003", "staff", "Staff Person");
    const now = await call<Team>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner });
    expect(now.body.data.former).toHaveLength(0);
    const me = await call<Employee>(t.app, "GET", `/workspaces/${ws}/members/me`, { token: back });
    expect(me.body.data.id).not.toBe(id);
    expect(me.body.data).toMatchObject({ designation: "photographer", joinedOn: "2024-04-01", pay: { payAmount: 25000, ifsc: "SBIN0001234" } });
  });

  it("keeps each business's team to itself", async () => {
    const a = await business("875");
    const b = await business("876");
    const id = a.idOf("Staff Person");
    expect((await call(t.app, "GET", `/workspaces/${b.ws}/members/${id}`, { token: b.owner })).status).toBe(404);
    expect((await call(t.app, "PUT", `/workspaces/${b.ws}/members/${id}/details`, { token: b.owner, body: { pan: "ABCDE1234F" } })).status).toBe(404);
    expect((await call(t.app, "GET", `/workspaces/${a.ws}/members/${id}`, { token: b.owner })).status).toBe(404);
  });
});
