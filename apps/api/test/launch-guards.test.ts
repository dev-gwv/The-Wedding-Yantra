import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig, parseTrustProxy } from "../src/config.js";
import { setup, type TestContext } from "./helpers.js";

let t: TestContext;
beforeAll(async () => {
  t = await setup({
    env: {
      AUTH_OTP_MAX_PER_PHONE_DAY: "3",
      AUTH_OTP_MAX_GLOBAL_DAY: "8",
      RATE_LIMIT_ENABLED: "true",
      RATE_LIMIT_AUTH_PER_MIN: "5",
      RATE_LIMIT_PUBLIC_PER_MIN: "4",
      RATE_LIMIT_PUBLIC_POST_PER_MIN: "2",
    },
  });
});
afterAll(async () => {
  await t.close();
});

/** A request as the reverse proxy passes it on: the caller's address is the last X-Forwarded-For entry. */
function viaProxy(method: "GET" | "POST", url: string, forwardedFor: string, body?: Record<string, unknown>) {
  return t.app.inject({ method, url: `/api/v1${url}`, headers: { "x-forwarded-for": forwardedFor }, payload: body });
}

describe("settings", () => {
  it("reads TRUST_PROXY as hops, addresses or yes/no, defaulting to the one proxy on the VPS", () => {
    expect(parseTrustProxy(undefined)).toBe(1);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("172.18.0.0/16")).toBe("172.18.0.0/16");
    expect(parseTrustProxy("10.0.0.1, 172.16.0.0/12")).toEqual(["10.0.0.1", "172.16.0.0/12"]);
  });

  it("limits requests everywhere but tests, with sensible defaults", () => {
    const prod = loadConfig({ DATABASE_URL: "postgres://x/y", NODE_ENV: "production" });
    expect(prod.rateLimit).toEqual({ enabled: true, authPerMinute: 20, publicPerMinute: 60, publicPostPerMinute: 10 });
    expect(prod.otpMaxPerPhoneDay).toBe(10);
    expect(prod.otpMaxGlobalDay).toBe(2000);
    expect(prod.trustProxy).toBe(1);
    expect(loadConfig({ DATABASE_URL: "postgres://x/y", NODE_ENV: "test" }).rateLimit.enabled).toBe(false);
  });
});

describe("per-IP rate limits", () => {
  it("stops a burst on sign-in, and a made-up X-Forwarded-For doesn't get around it", async () => {
    for (let i = 0; i < 5; i++) {
      // Each try pretends to come from somewhere else; only the proxy's own entry counts.
      const res = await viaProxy("POST", "/auth/otp/verify", `6.6.6.${i}, 203.0.113.5`, { phone: "9700000001", code: "000000" });
      expect(res.statusCode).toBe(400);
    }
    const blocked = await viaProxy("POST", "/auth/otp/verify", "6.6.6.99, 203.0.113.5", { phone: "9700000001", code: "000000" });
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.json()).toMatchObject({ success: false, error: { code: "TOO_MANY_REQUESTS" } });

    // Someone else behind the same proxy is unaffected.
    const other = await viaProxy("POST", "/auth/otp/verify", "203.0.113.6", { phone: "9700000001", code: "000000" });
    expect(other.statusCode).toBe(400);
  });

  it("limits public links, and writes to them more tightly", async () => {
    for (let i = 0; i < 4; i++) expect((await viaProxy("GET", "/public/quotes/nope", "198.51.100.1")).statusCode).toBe(404);
    expect((await viaProxy("GET", "/public/quotes/nope", "198.51.100.1")).statusCode).toBe(429);

    for (let i = 0; i < 2; i++) expect((await viaProxy("POST", "/public/forms/nope", "198.51.100.2", { name: "A" })).statusCode).not.toBe(429);
    expect((await viaProxy("POST", "/public/forms/nope", "198.51.100.2", { name: "A" })).statusCode).toBe(429);

    // Other screens aren't limited, and neither is reading who's signed in.
    expect((await viaProxy("GET", "/business-types", "198.51.100.1")).statusCode).toBe(200);
    for (let i = 0; i < 8; i++) expect((await viaProxy("GET", "/auth/me", "203.0.113.5")).statusCode).toBe(401);
  });
});

describe("daily sign-in code caps", () => {
  let ip = 0;
  // A fresh address each time, so these tests hit the daily caps and not the per-minute limit.
  const ask = (phone: string) => viaProxy("POST", "/auth/otp/request", `192.0.2.${++ip}`, { phone });

  it("caps codes per number per day, and for everyone together", async () => {
    for (let i = 0; i < 3; i++) expect((await ask("9811100001")).statusCode).toBe(200);
    const fourth = await ask("9811100001");
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.message).toBe("Too many codes for this number today. Try again tomorrow.");

    for (let i = 0; i < 3; i++) expect((await ask("9811100002")).statusCode).toBe(200);
    for (let i = 0; i < 2; i++) expect((await ask("9811100003")).statusCode).toBe(200);
    // 8 codes today: nobody gets another one.
    const busy = await ask("9811100004");
    expect(busy.statusCode).toBe(429);
    expect(busy.json().error).toMatchObject({ code: "SIGN_IN_BUSY", message: "Sign-in is busy right now. Please try again in a while." });

    // Tomorrow, yesterday's codes don't count.
    await t.db.query(`UPDATE otp_codes SET created_at = created_at - interval '1 day'`);
    expect((await ask("9811100001")).statusCode).toBe(200);
  });
});
