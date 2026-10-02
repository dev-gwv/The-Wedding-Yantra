import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

type Option = { id: string; list: string; key: string; label: string; archived: boolean };
type Member = { id: string; userId: string; name: string | null; department: string | null; departmentLabel: string | null };

async function team(prefix: string) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, `${prefix} Studio`);
  const join = async (phone: string, name: string, role: string) => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name, phone, role } });
    const token = await signIn(t.app, phone, name);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return token;
  };
  const manager = await join(`${prefix}0000002`, "Mona Manager", "manager");
  const staff = await join(`${prefix}0000003`, "Arfin Khan", "staff");
  const members = async () => (await call<{ members: Member[] }>(t.app, "GET", `/workspaces/${ws}/team`, { token: owner })).body.data.members;
  const arfin = (await members()).find((m) => m.name === "Arfin Khan")!;
  return { owner, manager, staff, ws, members, arfin };
}

const departments = async (ws: string, token: string) =>
  (await call<Option[]>(t.app, "GET", `/workspaces/${ws}/options`, { token })).body.data.filter((o) => o.list === "department");

describe("departments", () => {
  it("starts every business with Admin, Accountant, Sales and Manager", async () => {
    const { owner, ws } = await team("931");
    expect((await departments(ws, owner)).map((d) => d.label)).toEqual(["Admin", "Accountant", "Sales", "Manager"]);
  });

  it("lets the owner add one and put people in it; renaming and hiding keep it on them", async () => {
    const { owner, staff, ws, members, arfin } = await team("932");
    const added = await call<Option>(t.app, "POST", `/workspaces/${ws}/options`, { token: owner, body: { list: "department", label: "Production" } });
    expect(added.status).toBe(201);
    const production = added.body.data;

    const set = await call<Member>(t.app, "PUT", `/workspaces/${ws}/members/${arfin.id}/details`, { token: owner, body: { department: production.key } });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ department: production.key, departmentLabel: "Production" });
    expect((await members()).find((m) => m.id === arfin.id)).toMatchObject({ departmentLabel: "Production" });
    // Arfin sees his own department.
    const own = await call<Member>(t.app, "GET", `/workspaces/${ws}/members/me`, { token: staff });
    expect(own.body.data.departmentLabel).toBe("Production");

    await call(t.app, "PATCH", `/workspaces/${ws}/options/${production.id}`, { token: owner, body: { label: "Production & shoots" } });
    expect((await members()).find((m) => m.id === arfin.id)!.departmentLabel).toBe("Production & shoots");

    await call(t.app, "PATCH", `/workspaces/${ws}/options/${production.id}`, { token: owner, body: { archived: true } });
    expect((await members()).find((m) => m.id === arfin.id)!.departmentLabel).toBe("Production & shoots");

    // Moving him to Sales, and taking him out of any department.
    await call(t.app, "PUT", `/workspaces/${ws}/members/${arfin.id}/details`, { token: owner, body: { department: "sales" } });
    expect((await members()).find((m) => m.id === arfin.id)!.departmentLabel).toBe("Sales");
    await call(t.app, "PUT", `/workspaces/${ws}/members/${arfin.id}/details`, { token: owner, body: { department: null } });
    expect((await members()).find((m) => m.id === arfin.id)!.department).toBeNull();
  });

  it("keeps setting someone's department with the owner, and checks it's the business's own", async () => {
    const { owner, manager, staff, ws, arfin } = await team("933");
    // Managers look after the list, like every other list, but don't change someone's details.
    expect((await call(t.app, "POST", `/workspaces/${ws}/options`, { token: manager, body: { list: "department", label: "Events" } })).status).toBe(201);
    expect((await call(t.app, "PUT", `/workspaces/${ws}/members/${arfin.id}/details`, { token: manager, body: { department: "sales" } })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/options`, { token: staff, body: { list: "department", label: "Mine" } })).status).toBe(403);

    // A department another business made can't be used here.
    const other = await team("934");
    const theirs = (await call<Option>(t.app, "POST", `/workspaces/${other.ws}/options`, { token: other.owner, body: { list: "department", label: "Their own" } })).body.data;
    const wrong = await call(t.app, "PUT", `/workspaces/${ws}/members/${arfin.id}/details`, { token: owner, body: { department: theirs.key } });
    expect(wrong.status).toBe(400);
  });
});
