import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { call, setup, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup();
});
afterAll(async () => {
  await t.close();
});

describe("phone sign-in", () => {
  it("rejects an invalid phone number with a field message", async () => {
    const res = await call(t.app, "POST", "/auth/otp/request", { body: { phone: "12345" } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields?.phone).toMatch(/10-digit/);
  });

  it("signs in with a code, creating the person the first time", async () => {
    const req = await call<{ devCode: string; phone: string }>(t.app, "POST", "/auth/otp/request", {
      body: { phone: "98765 43210" },
    });
    expect(req.status).toBe(200);
    expect(req.body.data.phone).toBe("+919876543210");
    expect(req.body.data.devCode).toMatch(/^\d{6}$/);

    const wrong = await call(t.app, "POST", "/auth/otp/verify", {
      body: { phone: "9876543210", code: req.body.data.devCode === "000000" ? "111111" : "000000" },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_CODE");

    const ok = await call<{ token: string; isNewUser: boolean }>(t.app, "POST", "/auth/otp/verify", {
      body: { phone: "9876543210", code: req.body.data.devCode },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.isNewUser).toBe(true);

    const reused = await call(t.app, "POST", "/auth/otp/verify", {
      body: { phone: "9876543210", code: req.body.data.devCode },
    });
    expect(reused.status).toBe(400);

    const token = ok.body.data.token;
    const named = await call(t.app, "PATCH", "/auth/me", { token, body: { name: "Riya Sharma" } });
    expect(named.status).toBe(200);

    const me = await call<{ user: { name: string }; workspaces: unknown[] }>(t.app, "GET", "/auth/me", { token });
    expect(me.body.data.user.name).toBe("Riya Sharma");
    expect(me.body.data.workspaces).toEqual([]);

    const out = await call(t.app, "POST", "/auth/logout", { token });
    expect(out.status).toBe(200);
    const after = await call(t.app, "GET", "/auth/me", { token });
    expect(after.status).toBe(401);
  });

  it("locks a code after five wrong tries", async () => {
    const req = await call<{ devCode: string }>(t.app, "POST", "/auth/otp/request", { body: { phone: "9000000001" } });
    const wrongCode = req.body.data.devCode === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) {
      await call(t.app, "POST", "/auth/otp/verify", { body: { phone: "9000000001", code: wrongCode } });
    }
    const res = await call(t.app, "POST", "/auth/otp/verify", {
      body: { phone: "9000000001", code: req.body.data.devCode },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Too many wrong tries/);
  });

  it("limits how many codes one number can request", async () => {
    for (let i = 0; i < 5; i++) {
      await call(t.app, "POST", "/auth/otp/request", { body: { phone: "9000000002" } });
    }
    const res = await call(t.app, "POST", "/auth/otp/request", { body: { phone: "9000000002" } });
    expect(res.status).toBe(429);
  });

  it("rejects requests without a valid token", async () => {
    expect((await call(t.app, "GET", "/auth/me")).status).toBe(401);
    expect((await call(t.app, "GET", "/auth/me", { token: "not-a-token" })).status).toBe(401);
  });

  it("lists business types with starter packs hidden from the list", async () => {
    const res = await call<{ id: string; name: string }[]>(t.app, "GET", "/business-types");
    expect(res.body.data.length).toBeGreaterThanOrEqual(12);
    expect(res.body.data.map((b) => b.id)).toContain("photographer");
    expect(res.body.data[0]).not.toHaveProperty("starter_pack");
  });

  it("keeps the legacy health endpoint for the deploy script", async () => {
    const res = await t.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.database.status).toBe("up");
  });
});
