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

  it("works out the three Home setup steps on the server", async () => {
    const token = await signIn(t.app, "9822222222", "Arjun");
    const id = await createBusiness(t.app, token, "Arjun Decor");

    type Home = { setupDone: number; setupTotal: number; starterPack: { services: unknown[] } };
    type Step = { key: string; done: boolean };
    const steps = async () =>
      Object.fromEntries(
        (await call<{ setup: Step[] }>(t.app, "GET", `/workspaces/${id}/home`, { token })).body.data.setup.map((s) => [s.key, s.done]),
      );
    const before = await call<Home>(t.app, "GET", `/workspaces/${id}/home`, { token });
    expect(before.body.data).toMatchObject({ setupDone: 0, setupTotal: 3 });
    expect(before.body.data.starterPack.services.length).toBeGreaterThan(0);
    expect(await steps()).toEqual({ business_profile: false, price_list: false, first_enquiry: false });

    const badGst = await call(t.app, "PATCH", `/workspaces/${id}`, { token, body: { gstin: "123" } });
    expect(badGst.status).toBe(400);
    expect(badGst.body.error.fields?.gstin).toBeDefined();

    // The phone came from the owner's number; the address finishes the profile.
    const updated = await call<{ address: string; gstin: string }>(t.app, "PATCH", `/workspaces/${id}`, {
      token,
      body: { address: "12 MI Road, Jaipur", gstin: "08abcde1234f1z5" },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.gstin).toBe("08ABCDE1234F1Z5");
    expect((await steps()).business_profile).toBe(true);

    // Prices: confirming them as they are is enough; so is changing one.
    await call(t.app, "PATCH", `/workspaces/${id}`, { token, body: { pricesConfirmed: true } });
    expect((await steps()).price_list).toBe(true);
    const lead = await call<{ id: string }>(t.app, "POST", `/workspaces/${id}/leads`, { token, body: { name: "First Client" } });
    expect(lead.status).toBe(201);
    const after = await call<Home>(t.app, "GET", `/workspaces/${id}/home`, { token });
    expect(after.body.data.setupDone).toBe(3);

    // The month's numbers: enquiries in, events booked and what they're worth.
    await call(t.app, "POST", `/workspaces/${id}/events`, {
      token,
      body: { newClient: { name: "Sharma Family" }, title: "Sharma wedding", value: 450000, functions: [{ name: "Wedding", date: "2026-12-10" }] },
    });
    type Month = { sales: { monthEnquiries: number; monthBooked: number; monthBookedValue: number }; money: { receivedThisMonth: number; toCollect: number } };
    const month = (await call<Month>(t.app, "GET", `/workspaces/${id}/home`, { token })).body.data;
    expect(month.sales).toMatchObject({ monthEnquiries: 1, monthBooked: 1, monthBookedValue: 450000 });
    expect(month.money).toMatchObject({ receivedThisMonth: 0, toCollect: 450000 });
  });

  it("keeps a logo that shows on everything clients open", async () => {
    const token = await signIn(t.app, "9822222299", "Kiran");
    const id = await createBusiness(t.app, token, "Kiran Studio");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const file = await call<{ id: string }>(t.app, "POST", `/workspaces/${id}/files`, { token, body: { contentType: "image/png", data: png, name: "logo.png" } });
    expect(file.status).toBe(201);
    const set = await call<{ logoUrl: string | null }>(t.app, "PATCH", `/workspaces/${id}`, { token, body: { logoFileId: file.body.data.id } });
    expect(set.body.data.logoUrl).toBe(`/api/v1/public/logos/${id}/${file.body.data.id}`);

    // Anyone can open it, with no sign-in; it's in the business list for the app's sidebar.
    const shown = await t.app.inject({ method: "GET", url: set.body.data.logoUrl! });
    expect(shown.statusCode).toBe(200);
    expect(shown.headers["content-type"]).toBe("image/png");
    const me = await call<{ workspaces: { id: string; logoUrl: string | null }[] }>(t.app, "GET", "/auth/me", { token });
    expect(me.body.data.workspaces.find((w) => w.id === id)!.logoUrl).toBe(set.body.data.logoUrl);

    // Only this business's own photos; any other file id isn't served as its logo.
    const other = await signIn(t.app, "9822222298", "Other");
    const otherId = await createBusiness(t.app, other, "Other Studio");
    expect((await call(t.app, "PATCH", `/workspaces/${otherId}`, { token: other, body: { logoFileId: file.body.data.id } })).status).toBe(400);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/logos/${otherId}/${file.body.data.id}` })).statusCode).toBe(404);

    // Removed: the old link stops working.
    const removed = await call<{ logoUrl: string | null }>(t.app, "PATCH", `/workspaces/${id}`, { token, body: { logoFileId: null } });
    expect(removed.body.data.logoUrl).toBeNull();
    expect((await t.app.inject({ method: "GET", url: set.body.data.logoUrl! })).statusCode).toBe(404);
  });
});
