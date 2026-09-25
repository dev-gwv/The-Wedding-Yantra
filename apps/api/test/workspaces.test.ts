import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

describe("businesses", () => {
  it("creates a business and makes the creator its owner", async () => {
    const token = await signIn(t.app, "9811111111", "Riya");
    const bad = await call(t.app, "POST", "/workspaces", {
      token,
      body: { name: "R", businessTypeId: "nope", city: "" },
    });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.error.fields ?? {})).toEqual(expect.arrayContaining(["name", "city"]));

    const unknownType = await call(t.app, "POST", "/workspaces", {
      token,
      body: { name: "Riya Studio", businessTypeId: "nope", city: "Jaipur" },
    });
    expect(unknownType.status).toBe(400);
    expect(unknownType.body.error.fields?.businessTypeId).toBeDefined();

    const id = await createBusiness(t.app, token);
    const ws = await call<{ role: string; phone: string; businessTypeName: string }>(
      t.app,
      "GET",
      `/workspaces/${id}`,
      { token },
    );
    expect(ws.body.data.role).toBe("owner");
    expect(ws.body.data.phone).toBe("+919811111111");
    expect(ws.body.data.businessTypeName).toBe("Makeup artist");

    const me = await call<{ workspaces: { id: string; role: string }[] }>(t.app, "GET", "/auth/me", { token });
    expect(me.body.data.workspaces).toEqual([expect.objectContaining({ id, role: "owner" })]);
  });

  it("works out the Home setup steps on the server", async () => {
    const token = await signIn(t.app, "9822222222", "Arjun");
    const id = await createBusiness(t.app, token, "Arjun Decor");

    type Home = { setupDone: number; setupTotal: number; starterPack: { services: unknown[] } };
    const before = await call<Home>(t.app, "GET", `/workspaces/${id}/home`, { token });
    expect(before.body.data.setupDone).toBe(1);
    expect(before.body.data.setupTotal).toBe(3);
    expect(before.body.data.starterPack.services.length).toBeGreaterThan(0);

    const badGst = await call(t.app, "PATCH", `/workspaces/${id}`, { token, body: { gstin: "123" } });
    expect(badGst.status).toBe(400);
    expect(badGst.body.error.fields?.gstin).toBeDefined();

    const updated = await call<{ address: string; gstin: string }>(t.app, "PATCH", `/workspaces/${id}`, {
      token,
      body: { address: "12 MI Road, Jaipur", gstin: "08abcde1234f1z5" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.gstin).toBe("08ABCDE1234F1Z5");

    const after = await call<Home>(t.app, "GET", `/workspaces/${id}/home`, { token });
    expect(after.body.data.setupDone).toBe(2);
  });
});
