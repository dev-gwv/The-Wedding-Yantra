import { createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  appSecretProof,
  parseSignedRequest,
  seal,
  signState,
  unseal,
  validHmacHex,
  validMetaSignature,
  verifyState,
} from "../src/lib/crypto.js";
import { validRazorpaySignature } from "../src/modules/billing/gateway.js";
import * as auth from "../src/modules/auth/service.js";
import { createFakeGraph, fakeIds, testLeadValue } from "../src/modules/meta/fake-graph.js";
import { classifyGraphError, DEFAULT_RATE_LIMIT_WAIT_MS, GraphError, metaGraphClient } from "../src/modules/meta/graph.js";
import { call, setup, type TestContext } from "./helpers.js";

const KEY = randomBytes(32);

describe("sealing tokens", () => {
  it("opens what it sealed, and every seal looks different", () => {
    const sealed = seal("EAAB-page-token", KEY, "ws-1:page-1");
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain("EAAB");
    expect(unseal(sealed, KEY, "ws-1:page-1")).toBe("EAAB-page-token");
    expect(seal("EAAB-page-token", KEY, "ws-1:page-1")).not.toBe(sealed);
  });

  it("refuses the wrong place, a changed value, another key or junk", () => {
    const sealed = seal("EAAB-page-token", KEY, "ws-1:page-1");
    expect(() => unseal(sealed, KEY, "ws-2:page-1")).toThrow();
    const [v, iv, tag, ct] = sealed.split(".") as [string, string, string, string];
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => unseal([v, iv, tag, flipped.toString("base64url")].join("."), KEY, "ws-1:page-1")).toThrow();
    expect(() => unseal(sealed, randomBytes(32), "ws-1:page-1")).toThrow();
    expect(() => unseal("v2.a.b.c", KEY, "x")).toThrow(/Not a sealed value/);
    expect(() => unseal("plain-token", KEY, "x")).toThrow(/Not a sealed value/);
  });
});

describe("signatures", () => {
  const body = Buffer.from(JSON.stringify({ object: "page", entry: [] }));
  const hex = createHmac("sha256", "app-secret").update(body).digest("hex");

  it("checks Meta's X-Hub-Signature-256 over the raw bytes", () => {
    expect(validMetaSignature(body, `sha256=${hex}`, "app-secret")).toBe(true);
    expect(validMetaSignature(body.toString(), `sha256=${hex}`, "app-secret")).toBe(true);
    expect(validMetaSignature(body, `sha256=${hex}`, "other-secret")).toBe(false);
    expect(validMetaSignature(Buffer.from(`${body.toString()} `), `sha256=${hex}`, "app-secret")).toBe(false);
    expect(validMetaSignature(body, hex, "app-secret")).toBe(false);
    expect(validMetaSignature(body, "sha256=abc", "app-secret")).toBe(false);
    expect(validMetaSignature(body, undefined, "app-secret")).toBe(false);
    expect(validMetaSignature(body, "", "app-secret")).toBe(false);
  });

  it("keeps Razorpay's check the same", () => {
    const raw = '{"event":"subscription.charged"}';
    const sig = createHmac("sha256", "rzp-secret").update(raw).digest("hex");
    expect(validRazorpaySignature(raw, sig, "rzp-secret")).toBe(true);
    expect(validRazorpaySignature(raw, sig.toUpperCase(), "rzp-secret")).toBe(false);
    expect(validRazorpaySignature(raw, undefined, "rzp-secret")).toBe(false);
    expect(validHmacHex(raw, sig, "rzp-secret")).toBe(true);
  });

  it("makes appsecret_proof with the app secret as the key", () => {
    const expected = createHmac("sha256", "app-secret-123").update("EAAB-page-token").digest("hex");
    expect(appSecretProof("EAAB-page-token", "app-secret-123")).toBe(expected);
    expect(appSecretProof("EAAB-page-token", "app-secret-123")).toBe("5178126229f2234e94bdb9674c46f0ece7ea3d50909ad62490d3da036a2a387e");
    expect(appSecretProof("EAAB-page-token", "app-secret-123")).not.toBe(createHmac("sha256", "EAAB-page-token").update("app-secret-123").digest("hex"));
  });
});

describe("sign-in state", () => {
  const now = 1_800_000_000;
  const state = { w: "ws-1", u: "user-1", n: "nonce-1", x: now + 900 };

  it("comes back as it went out while fresh", () => {
    const signed = signState(state, KEY);
    expect(signed.split(".")).toHaveLength(2);
    expect(verifyState(signed, KEY, now)).toEqual(state);
    expect(verifyState(signState({ ...state, r: "rerequest" }, KEY), KEY, now)).toEqual({ ...state, r: "rerequest" });
  });

  it("refuses a changed, foreign, expired or broken state", () => {
    const signed = signState(state, KEY);
    const [payload, sig] = signed.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ ...state, w: "ws-2" })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`, KEY, now)).toBeNull();
    expect(verifyState(`${payload}.${sig.slice(0, -2)}AA`, KEY, now)).toBeNull();
    expect(verifyState(`${payload}.${sig.slice(0, 10)}`, KEY, now)).toBeNull();
    expect(verifyState(signed, randomBytes(32), now)).toBeNull();
    expect(verifyState(signed, KEY, now + 900)).toBeNull();
    expect(verifyState("junk", KEY, now)).toBeNull();
    expect(verifyState("a.b.c", KEY, now)).toBeNull();
    // Signed with the token key itself instead of the derived state key: refused.
    const rawSig = createHmac("sha256", KEY).update(payload).digest("base64url");
    expect(verifyState(`${payload}.${rawSig}`, KEY, now)).toBeNull();
  });
});

describe("Meta's signed_request", () => {
  const make = (payload: object, secret = "app-secret") => {
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
  };

  it("reads a good one", () => {
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: "123", issued_at: 1 }), "app-secret")).toMatchObject({ user_id: "123" });
  });

  it("refuses a wrong secret, a short signature, another algorithm or junk, without throwing", () => {
    expect(parseSignedRequest(make({ algorithm: "HMAC-SHA256", user_id: "123" }, "other"), "app-secret")).toBeNull();
    const p = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "123" })).toString("base64url");
    expect(parseSignedRequest(`abc.${p}`, "app-secret")).toBeNull();
    expect(parseSignedRequest(`${Buffer.alloc(31).toString("base64url")}.${p}`, "app-secret")).toBeNull();
    expect(parseSignedRequest(make({ algorithm: "none", user_id: "123" }), "app-secret")).toBeNull();
    expect(parseSignedRequest(make({ user_id: "123" }), "app-secret")).toBeNull();
    expect(parseSignedRequest("no-dot", "app-secret")).toBeNull();
    expect(parseSignedRequest("", "app-secret")).toBeNull();
    const notJson = Buffer.from("not json").toString("base64url");
    expect(parseSignedRequest(`${createHmac("sha256", "app-secret").update(notJson).digest("base64url")}.${notJson}`, "app-secret")).toBeNull();
  });
});

describe("settings for lead ads and the reviewer sign-in", () => {
  const base = { DATABASE_URL: "postgres://x/y" };
  const key = randomBytes(32).toString("base64");
  const full = {
    ...base,
    META_APP_ID: "1234567890",
    META_APP_SECRET: "app-secret",
    META_VERIFY_TOKEN: "verify-me",
    META_TOKEN_KEY: key,
    WEB_APP_URL: "https://app.weddingyantra.com/",
  };

  it("is off until META_APP_ID is set, including the empty values docker compose passes", () => {
    const c = loadConfig(base);
    expect(c.meta).toBeNull();
    expect(c.webAppUrl).toBeNull();
    expect(c.reviewLogin).toBeNull();
    const empty = { META_APP_ID: "", META_APP_SECRET: "", META_TOKEN_KEY: "", WEB_APP_URL: "", AUTH_REVIEW_PHONE: "", AUTH_REVIEW_CODE: "", AUTH_REVIEW_UNTIL: "" };
    expect(loadConfig({ ...base, NODE_ENV: "production", ...empty }).meta).toBeNull();
    expect(loadConfig({ ...base, NODE_ENV: "test" }).incoming.autoDrain).toBe(false);
    expect(loadConfig({ ...base, NODE_ENV: "production" }).incoming.autoDrain).toBe(true);
  });

  it("needs everything else once META_APP_ID is set", () => {
    expect(() => loadConfig({ ...base, META_APP_ID: "1" })).toThrow(/META_APP_SECRET, META_VERIFY_TOKEN, META_TOKEN_KEY, WEB_APP_URL/);
    expect(() => loadConfig({ ...full, NODE_ENV: "production" })).toThrow(/META_LOGIN_CONFIG_ID/);
    expect(() => loadConfig({ ...full, META_TOKEN_KEY: randomBytes(16).toString("base64") })).toThrow(/32 random bytes/);
    expect(() => loadConfig({ ...full, META_TOKEN_KEY: "not base64 at all!" })).toThrow(/32 random bytes/);
    expect(() => loadConfig({ ...full, META_GRAPH_VERSION: "26" })).toThrow(/v26.0/);
    expect(() => loadConfig({ ...full, META_ENABLED_FOR: "my-business" })).toThrow(/isn't a business id/);
  });

  it("fills in the defaults", () => {
    const c = loadConfig({ ...full, NODE_ENV: "production", META_LOGIN_CONFIG_ID: "cfg-1" });
    expect(c.webAppUrl).toBe("https://app.weddingyantra.com");
    expect(c.meta).toMatchObject({
      appId: "1234567890",
      appSecret: "app-secret",
      verifyToken: "verify-me",
      loginConfigId: "cfg-1",
      graphVersion: "v26.0",
      redirectUri: "https://app.weddingyantra.com/connect/meta",
      pollMinutes: 30,
      enabledFor: "all",
      fake: false,
    });
    expect(c.meta!.tokenKey).toEqual(Buffer.from(key, "base64"));
    const id = "6f1c2c1e-1d2b-4c3a-9e8f-0a1b2c3d4e5f";
    const some = loadConfig({ ...full, META_ENABLED_FOR: ` ${id.toUpperCase()} `, META_POLL_MINUTES: "10", META_GRAPH_VERSION: "v27.0" });
    expect(some.meta!.enabledFor).toEqual(new Set([id]));
    expect(some.meta!.pollMinutes).toBe(10);
    expect(some.meta!.graphVersion).toBe("v27.0");
    expect(some.meta!.loginConfigId).toBeNull();
  });

  it("wants https for the web app in production, except on this computer", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", WEB_APP_URL: "http://app.weddingyantra.com" })).toThrow(/https/);
    expect(loadConfig({ ...base, NODE_ENV: "production", WEB_APP_URL: "http://localhost:3000" }).webAppUrl).toBe("http://localhost:3000");
    expect(loadConfig({ ...base, WEB_APP_URL: "http://192.168.1.5:3000" }).webAppUrl).toBe("http://192.168.1.5:3000");
    expect(() => loadConfig({ ...base, WEB_APP_URL: "https://app.weddingyantra.com/app" })).toThrow(/no path/);
    expect(() => loadConfig({ ...base, WEB_APP_URL: "app.weddingyantra.com" })).toThrow(/isn't a web address/);
  });

  it("refuses the pretend Facebook in production, and makes it work locally without keys", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", META_FAKE: "true" })).toThrow(/META_FAKE/);
    const c = loadConfig({ ...base, META_FAKE: "true" });
    expect(c.meta).toMatchObject({ fake: true, appId: "fake-app", redirectUri: "http://localhost:3000/connect/meta", loginConfigId: null });
    expect(c.meta!.tokenKey).toHaveLength(32);
    expect(loadConfig({ ...base, META_FAKE: "true" }).meta!.tokenKey).toEqual(c.meta!.tokenKey);
    expect(c.webAppUrl).toBe("http://localhost:3000");
    expect(loadConfig({ ...full, META_FAKE: "true" }).meta).toMatchObject({ fake: true, appId: "1234567890" });
  });

  it("takes the reviewer sign-in only whole and valid, and switches it off after its date", () => {
    const review = { AUTH_REVIEW_PHONE: "98000 00077", AUTH_REVIEW_CODE: "246810", AUTH_REVIEW_UNTIL: "2099-12-31" };
    const c = loadConfig({ ...base, ...review });
    expect(c.reviewLogin).toEqual({ phone: "+919800000077", code: "246810", until: new Date("2099-12-31T23:59:59.999+05:30") });
    expect(() => loadConfig({ ...base, AUTH_REVIEW_PHONE: "9800000077", AUTH_REVIEW_CODE: "246810" })).toThrow(/all three/);
    // Past its date it is off, with a warning, and the API still starts.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadConfig({ ...base, ...review, AUTH_REVIEW_UNTIL: "2020-01-01" }).reviewLogin).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/AUTH_REVIEW_UNTIL has passed/));
    warn.mockRestore();
    expect(() => loadConfig({ ...base, ...review, AUTH_REVIEW_UNTIL: "someday" })).toThrow(/isn't a date/);
    expect(() => loadConfig({ ...base, ...review, AUTH_REVIEW_CODE: "1234" })).toThrow(/6 digits/);
    expect(() => loadConfig({ ...base, ...review, AUTH_REVIEW_PHONE: "12345" })).toThrow(/valid mobile/);
  });
});

/** A stand-in for Meta that records each request and answers from a list. */
function stubFetch(answers: { status?: number; body: unknown; headers?: Record<string, string> }[]) {
  const requests: { url: URL; method: string; headers: Headers; body: URLSearchParams }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: new URL(String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
    });
    const answer = answers.shift();
    if (!answer) throw new TypeError("fetch failed");
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { "content-type": "application/json", ...answer.headers },
    });
  }) as typeof fetch;
  return { fn, requests };
}

const OPTS = { appId: "1234567890", appSecret: "app-secret", version: "v26.0", loginConfigId: "cfg-1" };
const metaError = (code: number, message: string, extra: Record<string, unknown> = {}) => ({
  error: { message, type: "OAuthException", code, fbtrace_id: "Trace1", ...extra },
});

describe("the Graph client", () => {
  it("builds the Facebook dialog address", () => {
    const graph = metaGraphClient(OPTS);
    const url = new URL(graph.loginUrl({ state: "s.t", redirectUri: "https://app.weddingyantra.com/connect/meta" }));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v26.0/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "1234567890",
      redirect_uri: "https://app.weddingyantra.com/connect/meta",
      state: "s.t",
      response_type: "code",
      config_id: "cfg-1",
    });
    const named = new URL(metaGraphClient({ ...OPTS, loginConfigId: null }).loginUrl({ state: "s", redirectUri: "https://x.test/connect/meta", rerequest: true }));
    expect(named.searchParams.get("scope")).toBe("pages_show_list,pages_read_engagement,pages_manage_metadata,pages_manage_ads,leads_retrieval,ads_management");
    expect(named.searchParams.get("auth_type")).toBe("rerequest");
    expect(named.searchParams.get("config_id")).toBeNull();
  });

  it("sends tokens in the header with appsecret_proof, and secrets in POST bodies", async () => {
    const stub = stubFetch([
      { body: { access_token: "EAAB-short", token_type: "bearer", expires_in: 3600 } },
      { body: { access_token: "EAAB-long", token_type: "bearer", expires_in: 5_184_000 } },
      { body: { id: "555", name: "Asha" } },
      {
        body: {
          data: {
            app_id: "1234567890",
            type: "USER",
            is_valid: true,
            user_id: "555",
            expires_at: 1_900_000_000,
            data_access_expires_at: 1_890_000_000,
            scopes: ["pages_show_list", "leads_retrieval"],
            granular_scopes: [{ scope: "pages_show_list", target_ids: ["p1", "p2"] }, { scope: "leads_retrieval" }],
          },
        },
      },
    ]);
    const graph = metaGraphClient(OPTS, stub.fn);
    const short = await graph.exchangeCode("the-code", "https://app.weddingyantra.com/connect/meta");
    expect(short.accessToken).toBe("EAAB-short");
    expect(short.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    const long = await graph.longLivedUserToken(short.accessToken);
    expect(await graph.me(long.accessToken)).toEqual({ id: "555", name: "Asha" });
    const info = await graph.debugToken(long.accessToken);
    expect(info).toMatchObject({ isValid: true, appId: "1234567890", type: "USER", userId: "555", scopes: ["pages_show_list", "leads_retrieval"], error: null });
    expect(info.expiresAt).toEqual(new Date(1_900_000_000_000));
    expect(info.dataAccessExpiresAt).toEqual(new Date(1_890_000_000_000));
    expect(info.granularScopes).toEqual([
      { scope: "pages_show_list", targetIds: ["p1", "p2"] },
      { scope: "leads_retrieval", targetIds: [] },
    ]);

    const [code, exchange, me, debug] = stub.requests as [(typeof stub.requests)[0], (typeof stub.requests)[0], (typeof stub.requests)[0], (typeof stub.requests)[0]];
    expect(code.method).toBe("POST");
    expect(code.url.pathname).toBe("/v26.0/oauth/access_token");
    expect(code.url.search).toBe("");
    expect(Object.fromEntries(code.body)).toEqual({
      client_id: "1234567890",
      client_secret: "app-secret",
      redirect_uri: "https://app.weddingyantra.com/connect/meta",
      code: "the-code",
    });
    expect(exchange.body.get("grant_type")).toBe("fb_exchange_token");
    expect(exchange.body.get("fb_exchange_token")).toBe("EAAB-short");
    expect(exchange.url.search).toBe("");
    expect(me.headers.get("authorization")).toBe("Bearer EAAB-long");
    expect(me.url.searchParams.get("appsecret_proof")).toBe(appSecretProof("EAAB-long", "app-secret"));
    expect(me.url.href).not.toContain("EAAB-long");
    expect(debug.method).toBe("POST");
    expect(debug.body.get("input_token")).toBe("EAAB-long");
    expect(debug.headers.get("authorization")).toBe("Bearer 1234567890|app-secret");
    expect(debug.url.href).not.toContain("EAAB-long");
    expect(debug.url.href).not.toContain("app-secret");
  });

  it("follows paging by cursor and asks for the lead names again without them when refused", async () => {
    const stub = stubFetch([
      { body: { data: [{ id: "p1", name: "One", access_token: "PT1", tasks: ["ADVERTISE"] }], paging: { cursors: { after: "C1" }, next: "https://graph.facebook.com/v26.0/me/accounts?access_token=EAAB-leaky&after=C1" } } },
      { body: { data: [{ id: "p2", name: "Two", access_token: "PT2", tasks: ["MANAGE"] }], paging: { cursors: { after: "C2" } } } },
      { status: 400, body: metaError(200, "(#200) Ad account owner has not granted ads_management or ads_read permission") },
      {
        body: {
          id: "L1",
          created_time: "2026-10-11T10:00:00+0000",
          form_id: "F1",
          platform: "ig",
          is_organic: false,
          field_data: [{ name: "full_name", values: ["Priya Sharma"] }],
        },
      },
    ]);
    const graph = metaGraphClient(OPTS, stub.fn);
    const pages = await graph.listPages("EAAB-user");
    expect(pages.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(pages[1]).toEqual({ id: "p2", name: "Two", accessToken: "PT2", tasks: ["MANAGE"] });
    expect(stub.requests[1]!.url.searchParams.get("after")).toBe("C1");
    expect(stub.requests[1]!.url.searchParams.get("limit")).toBe("100");
    expect(stub.requests[1]!.url.href).not.toContain("leaky");

    const lead = await graph.getLead("L1", "PT1");
    expect(lead).toMatchObject({ id: "L1", createdTime: "2026-10-11T10:00:00.000Z", formId: "F1", platform: "ig", adName: null, campaignName: null });
    expect(stub.requests[2]!.url.searchParams.get("fields")).toContain("campaign_name");
    expect(stub.requests[3]!.url.searchParams.get("fields")).not.toMatch(/ad_name|adset_name|campaign_name/);
    expect(stub.requests[3]!.url.searchParams.get("fields")).toContain("campaign_id");
  });

  it("asks for a form's leads since a time, one page at a time", async () => {
    const stub = stubFetch([{ body: { data: [{ id: "L2", created_time: "2026-10-11T10:05:00+0000", field_data: [] }], paging: { cursors: { after: "N1" }, next: "x" } } }]);
    const graph = metaGraphClient(OPTS, stub.fn);
    const result = await graph.formLeads("F1", "PT1", new Date("2026-10-11T09:00:00Z"), "A0");
    expect(result).toMatchObject({ next: "N1", leads: [{ id: "L2" }] });
    const q = stub.requests[0]!.url.searchParams;
    expect(stub.requests[0]!.url.pathname).toBe("/v26.0/F1/leads");
    expect(JSON.parse(q.get("filtering")!)).toEqual([{ field: "time_created", operator: "GREATER_THAN", value: 1_791_709_200 }]);
    expect(q.get("limit")).toBe("100");
    expect(q.get("after")).toBe("A0");
  });

  it("reads Leads Access, and can't tell when Meta leaves it out", async () => {
    const stub = stubFetch([
      { body: { id: "p1", has_lead_access: { can_access_lead: false, enabled_lead_access_manager: true, failure_reason: "No CRM assigned", failure_resolution: "Assign the CRM" } } },
      { body: { id: "p1" } },
      { status: 400, body: metaError(100, "(#100) Tried accessing nonexisting field (has_lead_access)") },
    ]);
    const graph = metaGraphClient(OPTS, stub.fn);
    expect(await graph.leadAccess("p1", "555", "PT1")).toEqual({
      canAccess: false,
      managerEnabled: true,
      failureReason: "No CRM assigned",
      failureResolution: "Assign the CRM",
    });
    expect(stub.requests[0]!.url.searchParams.get("fields")).toBe("has_lead_access.user_id(555)");
    const unknown = { canAccess: true, managerEnabled: false, failureReason: null, failureResolution: null };
    expect(await graph.leadAccess("p1", "555", "PT1")).toEqual(unknown);
    expect(await graph.leadAccess("p1", "555", "PT1")).toEqual(unknown);
  });

  it("sorts Meta's errors, and never puts a token, address or body in the message", async () => {
    const failing = async (answer: { status?: number; body: unknown; headers?: Record<string, string> }) => {
      const graph = metaGraphClient(OPTS, stubFetch([answer]).fn);
      return (await graph.getForm("F1", "EAAB-secret-page-token").catch((e: unknown) => e)) as GraphError;
    };
    const token = await failing({ status: 400, body: metaError(190, "Error validating access token EAAB-secret-page-token at https://graph.facebook.com/v26.0/F1", { error_subcode: 463 }) });
    expect(token).toBeInstanceOf(GraphError);
    expect(token).toMatchObject({ kind: "token", code: 190, subcode: 463, fbtraceId: "Trace1", ambiguous: false });
    expect(token.message).not.toContain("EAAB-secret-page-token");
    expect(token.message).not.toContain("https://");
    expect(token.message).not.toContain("{");

    expect(await failing({ status: 403, body: metaError(200, "(#200) Requires leads_retrieval") })).toMatchObject({ kind: "permission", code: 200 });
    expect(await failing({ status: 400, body: metaError(10, "(#10) Not enough permission") })).toMatchObject({ kind: "permission" });
    const missing = await failing({ status: 400, body: metaError(100, "Unsupported get request. Object with ID 'F1' does not exist", { error_subcode: 33 }) });
    expect(missing).toMatchObject({ kind: "not_found", code: 100, subcode: 33, ambiguous: true });
    const limited = await failing({
      status: 400,
      body: metaError(613, "Calls to this api have exceeded the rate limit."),
      headers: { "x-business-use-case-usage": JSON.stringify({ "123": [{ type: "pages", call_count: 100, estimated_time_to_regain_access: 5 }] }) },
    });
    expect(limited).toMatchObject({ kind: "rate_limit", code: 613, retryAfterMs: 5 * 60_000 });
    expect(await failing({ status: 400, body: metaError(80004, "Too many calls") })).toMatchObject({ kind: "rate_limit", retryAfterMs: DEFAULT_RATE_LIMIT_WAIT_MS });
    expect(await failing({ status: 500, body: { error: { message: "An unknown error occurred", code: 1 } } })).toMatchObject({ kind: "transient" });
    expect(await failing({ status: 502, body: "Bad gateway <html>" })).toMatchObject({ kind: "transient", message: "Meta answered 502" });
    expect(await failing({ status: 400, body: metaError(2, "Service temporarily unavailable", { is_transient: true }) })).toMatchObject({ kind: "transient" });
    expect(await failing({ status: 400, body: metaError(100, "Invalid parameter") })).toMatchObject({ kind: "other", ambiguous: false });

    const offline = metaGraphClient(OPTS, stubFetch([]).fn);
    const network = (await offline.getLead("L1", "EAAB-x").catch((e: unknown) => e)) as GraphError;
    expect(network).toMatchObject({ kind: "transient", message: "Couldn't reach Meta" });

    expect(classifyGraphError(400, metaError(17, "User request limit reached"))).toMatchObject({ kind: "rate_limit", retryAfterMs: 15 * 60_000 });
    expect(classifyGraphError(0, null)).toMatchObject({ kind: "transient" });
  });
});

describe("the pretend Facebook", () => {
  const SECRET = "fake-app-secret";
  const REDIRECT = "http://localhost:3000/connect/meta";
  const ids = fakeIds(1);

  /** Signs in with a scenario code the way the connect flow will. */
  async function connect(graph: ReturnType<typeof createFakeGraph>, code: string) {
    const short = await graph.exchangeCode(code, REDIRECT);
    const long = await graph.longLivedUserToken(short.accessToken);
    return { short: short.accessToken, user: long.accessToken };
  }

  it("goes straight back to the app from the dialog", () => {
    const graph = createFakeGraph({ appSecret: SECRET });
    const url = new URL(graph.loginUrl({ state: "abc.def", redirectUri: REDIRECT }));
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get("code")).toBe("fake:two-pages");
    expect(url.searchParams.get("state")).toBe("abc.def");
    expect(createFakeGraph({ appSecret: SECRET, loginCode: "fake:one-page" }).loginUrl({ state: "s", redirectUri: REDIRECT })).toContain("code=fake%3Aone-page");
  });

  it("plays each sign-in scenario", async () => {
    const graph = createFakeGraph({ appSecret: SECRET });
    const one = await connect(graph, "fake:one-page");
    expect(one).toEqual({ short: `fake-short-token-${ids.userId}`, user: `fake-user-token-${ids.userId}` });
    expect(await graph.me(one.user)).toEqual({ id: ids.userId, name: "Asha Mehra" });
    const info = await graph.debugToken(one.user);
    expect(info).toMatchObject({ isValid: true, appId: "fake-app", type: "USER", userId: ids.userId });
    expect(info.scopes).toContain("leads_retrieval");
    expect(info.granularScopes.find((g) => g.scope === "leads_retrieval")!.targetIds).toEqual([ids.pageIds[0]]);
    expect(info.dataAccessExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    const pages = await graph.listPages(one.user);
    expect(pages).toEqual([{ id: ids.pageIds[0], name: "Shubh Vivah Weddings", accessToken: `fake-page-token-${ids.pageIds[0]}`, tasks: expect.arrayContaining(["ADVERTISE", "MANAGE"]) }]);

    const two = await connect(graph, "fake:two-pages");
    expect((await graph.listPages(two.user)).map((p) => p.id)).toEqual(ids.pageIds);
    const none = await connect(graph, "fake:no-pages");
    expect(await graph.listPages(none.user)).toEqual([]);

    const other = await connect(graph, "fake:other-user");
    expect((await graph.me(other.user)).id).toBe(ids.otherUserId);
    expect((await graph.listPages(other.user)).map((p) => p.id)).toEqual([ids.pageIds[0]]);

    const world2 = await connect(graph, "fake:one-page:2");
    expect((await graph.listPages(world2.user)).map((p) => p.id)).toEqual([fakeIds(2).pageIds[0]]);
    expect(fakeIds(2).pageIds[0]).not.toBe(ids.pageIds[0]);

    const refused = await connect(graph, "fake:missing-leads-permission");
    expect((await graph.debugToken(refused.user)).scopes).not.toContain("leads_retrieval");
    const lead = graph.seedLead(ids.pageIds[0], ids.formIds[0]);
    await expect(graph.getLead(lead.id, `fake-page-token-${ids.pageIds[0]}`)).rejects.toMatchObject({ kind: "permission" });

    await expect(graph.exchangeCode("not-a-code", REDIRECT)).rejects.toMatchObject({ kind: "other" });
  });

  it("subscribes Pages and lists their forms with lead counts", async () => {
    const graph = createFakeGraph({ appSecret: SECRET });
    const pageToken = `fake-page-token-${ids.pageIds[0]}`;
    expect(await graph.pageSubscribed(ids.pageIds[0], pageToken)).toBe(false);
    await graph.subscribePage(ids.pageIds[0], pageToken);
    expect(graph.isSubscribed(ids.pageIds[0])).toBe(true);
    expect(await graph.pageSubscribed(ids.pageIds[0], pageToken)).toBe(true);
    await graph.unsubscribePage(ids.pageIds[0], pageToken);
    expect(graph.isSubscribed(ids.pageIds[0])).toBe(false);

    graph.seedLead(ids.pageIds[0], ids.formIds[0]);
    const extra = graph.addForm(ids.pageIds[0], { name: "Winter offer" });
    const forms = await graph.listForms(ids.pageIds[0], pageToken);
    expect(forms.map((f) => [f.id, f.name, f.leadsCount])).toEqual([
      [ids.formIds[0], "Wedding enquiry", 1],
      [extra.id, "Winter offer", 0],
    ]);
    expect(forms[0]!.questions.map((q) => q.key)).toContain("phone_number");
    expect((await graph.getForm(extra.id, pageToken)).name).toBe("Winter offer");
    // Another Page's token can't see this Page's things.
    await expect(graph.listForms(ids.pageIds[0], `fake-page-token-${ids.pageIds[1]}`)).rejects.toMatchObject({ kind: "not_found", ambiguous: true });
  });

  it("serves seeded leads by id and by form, newest first, with paging", async () => {
    let clock = new Date("2026-10-11T10:00:00Z");
    const graph = createFakeGraph({ appSecret: SECRET, pageSize: 2, now: () => clock });
    const pageToken = `fake-page-token-${ids.pageIds[0]}`;
    const seeded = [];
    for (let i = 0; i < 3; i++) {
      clock = new Date(clock.getTime() + 60_000);
      seeded.push(graph.seedLead(ids.pageIds[0], ids.formIds[0], i === 2 ? { platform: "ig" } : {}));
    }
    const lead = await graph.getLead(seeded[2]!.id, pageToken);
    expect(lead).toEqual(seeded[2]);
    expect(lead).toMatchObject({ platform: "ig", campaignName: "Winter weddings 2026", formId: ids.formIds[0], createdTime: "2026-10-11T10:03:00.000Z" });
    expect(lead.fieldData.find((f) => f.name === "full_name")!.values).toEqual(["Priya Sharma"]);
    expect(seeded[0]!.fieldData.find((f) => f.name === "phone_number")!.values).not.toEqual(seeded[1]!.fieldData.find((f) => f.name === "phone_number")!.values);

    const first = await graph.formLeads(ids.formIds[0], pageToken, new Date("2026-10-11T10:00:30Z"));
    expect(first.leads.map((l) => l.id)).toEqual([seeded[2]!.id, seeded[1]!.id]);
    expect(first.next).not.toBeNull();
    const second = await graph.formLeads(ids.formIds[0], pageToken, new Date("2026-10-11T10:00:30Z"), first.next!);
    expect(second).toEqual({ leads: [seeded[0]], next: null });
    const recent = await graph.formLeads(ids.formIds[0], pageToken, new Date("2026-10-11T10:02:00Z"));
    expect(recent.leads.map((l) => l.id)).toEqual([seeded[2]!.id]);
  });

  it("withholds ad names, blocks Leads Access, and makes test leads like Meta's", async () => {
    const graph = createFakeGraph({ appSecret: SECRET });
    const pageToken = `fake-page-token-${ids.pageIds[0]}`;
    const seeded = graph.seedLead(ids.pageIds[0], ids.formIds[0]);

    graph.withholdAdNames(true);
    const plain = await graph.getLead(seeded.id, pageToken);
    expect(plain).toMatchObject({ id: seeded.id, adName: null, adsetName: null, campaignName: null, campaignId: seeded.campaignId });
    graph.withholdAdNames(false);

    graph.setLeadAccess(ids.pageIds[0], { canAccess: false, managerEnabled: true, failureReason: "This app isn't assigned in Leads Access" });
    await expect(graph.getLead(seeded.id, pageToken)).rejects.toMatchObject({ kind: "not_found", code: 100, subcode: 33, ambiguous: true });
    expect(await graph.leadAccess(ids.pageIds[0], ids.userId, pageToken)).toMatchObject({ canAccess: false, managerEnabled: true });
    graph.setLeadAccess(ids.pageIds[0], { canAccess: true });
    expect(await graph.leadAccess(ids.pageIds[0], ids.userId, pageToken)).toMatchObject({ canAccess: true });

    const test = await graph.createTestLead(ids.formIds[0], pageToken);
    expect(test.id).toBeTruthy();
    const testLead = await graph.getLead(test.id!, pageToken);
    expect(testLead.fieldData.find((f) => f.name === "full_name")!.values).toEqual(["<test lead: dummy data for full_name>"]);
    expect(testLeadValue("phone_number")).toBe("<test lead: dummy data for phone_number>");
  });

  it("fails on request, checks tokens and recomputes appsecret_proof", async () => {
    const graph = createFakeGraph({ appSecret: SECRET });
    const { user } = await connect(graph, "fake:one-page");
    graph.failNext("listPages", new GraphError("transient", "Meta is down"));
    await expect(graph.listPages(user)).rejects.toMatchObject({ kind: "transient" });
    expect(await graph.listPages(user)).toHaveLength(1);
    graph.failAlways("me", new GraphError("rate_limit", "Slow down", { retryAfterMs: 1000 }));
    await expect(graph.me(user)).rejects.toMatchObject({ kind: "rate_limit" });
    await expect(graph.me(user)).rejects.toMatchObject({ kind: "rate_limit" });
    graph.failAlways("me", null);
    expect((await graph.me(user)).id).toBe(ids.userId);
    expect(graph.calls.map((c) => c.method)).toEqual(["exchangeCode", "longLivedUserToken", "listPages", "listPages", "me", "me", "me"]);
    expect(graph.calls[0]!.args).toEqual(["fake:one-page", REDIRECT]);

    const pageToken = `fake-page-token-${ids.pageIds[0]}`;
    graph.setTokenExpiry(pageToken, { dataAccessExpiresAt: new Date("2026-12-02T00:00:00Z") });
    expect((await graph.debugToken(pageToken)).dataAccessExpiresAt).toEqual(new Date("2026-12-02T00:00:00Z"));
    graph.revokeToken(pageToken);
    await expect(graph.listForms(ids.pageIds[0], pageToken)).rejects.toMatchObject({ kind: "token", code: 190 });
    expect(await graph.debugToken(pageToken)).toMatchObject({ isValid: false, error: { code: 190 } });

    // A client with another app secret sends a proof the pretend Meta refuses.
    const wrong = metaGraphClient({ appId: "fake-app", appSecret: "not-the-secret", version: "v26.0", loginConfigId: null }, graph.fetch);
    const refused = (await wrong.me(user).catch((e: unknown) => e)) as GraphError;
    expect(refused).toMatchObject({ kind: "other", code: 100 });
    expect(refused.message).toMatch(/appsecret_proof/);
    // Without the proof at all, also refused.
    const res = await graph.fetch("https://graph.facebook.com/v26.0/me", { headers: { authorization: `Bearer ${user}` } });
    expect((await res.json()).error.message).toMatch(/appsecret_proof/);
  });

  it("gives the same ids every time", async () => {
    const a = createFakeGraph({ appSecret: SECRET });
    const b = createFakeGraph({ appSecret: SECRET });
    expect(a.seedLead(ids.pageIds[0], ids.formIds[0]).id).toBe(b.seedLead(ids.pageIds[0], ids.formIds[0]).id);
    expect((await a.createTestLead(ids.formIds[0], `fake-page-token-${ids.pageIds[0]}`)).id).toBe(
      (await b.createTestLead(ids.formIds[0], `fake-page-token-${ids.pageIds[0]}`)).id,
    );
  });
});

describe("the reviewer's sign-in", () => {
  let t: TestContext;
  let app: FastifyInstance;
  const sent: string[] = [];
  const REVIEW = { phone: "+919800000077", code: "246810", until: new Date(Date.now() + 86_400_000) };
  const base = () => loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", AUTH_OTP_MAX_PER_IP: "10000" });

  beforeAll(async () => {
    t = await setup();
    app = await buildApp({
      config: { ...base(), reviewLogin: REVIEW },
      db: t.db,
      logger: false,
      otpSender: { send: async (phone) => (sent.push(phone), "sms" as const) },
      files: t.files,
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await t.close();
  });

  it("sends nothing to the review number, and the fixed code signs in", async () => {
    const requested = await call<{ channel: string; devCode?: string }>(app, "POST", "/auth/otp/request", { body: { phone: "98000 00077" } });
    expect(requested.status).toBe(200);
    expect(requested.body.data).toMatchObject({ sent: true, channel: "none" });
    expect(requested.body.data.devCode).toBeUndefined();
    expect(sent).toEqual([]);

    const wrong = await call(app, "POST", "/auth/otp/verify", { body: { phone: "9800000077", code: "111111" } });
    expect(wrong.status).toBe(400);
    const ok = await call<{ token: string }>(app, "POST", "/auth/otp/verify", { body: { phone: "9800000077", code: "246810" } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.token).toBeTruthy();
    // Used once, like any code.
    const again = await call(app, "POST", "/auth/otp/verify", { body: { phone: "9800000077", code: "246810" } });
    expect(again.status).toBe(400);
  });

  it("leaves every other number alone", async () => {
    const res = await call(app, "POST", "/auth/otp/request", { body: { phone: "9800000078" } });
    expect(res.status).toBe(200);
    expect(sent).toEqual(["+919800000078"]);
    const bad = await call(app, "POST", "/auth/otp/verify", { body: { phone: "9800000078", code: "246810" } });
    expect(bad.status).toBe(400);
  });

  it("stops after the date, and logs each use", async () => {
    const warnings: string[] = [];
    const log = { warn: (_obj: unknown, msg?: string) => void warnings.push(msg ?? "") } as never;
    await auth.requestOtp(t.db, { send: async () => "sms" as const }, { phone: "+919800000079", ip: "1.1.1.1", echo: false, maxPerIp: 100, review: { ...REVIEW, phone: "+919800000079" }, log });
    await auth.verifyOtp(t.db, { phone: "+919800000079", code: "246810", userAgent: null, review: { ...REVIEW, phone: "+919800000079" }, log });
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toMatch(/reviewer/);

    const expired = { ...REVIEW, phone: "+919800000080", until: new Date(Date.now() - 1000) };
    const codes: string[] = [];
    await auth.requestOtp(t.db, { send: async (_p, code) => (codes.push(code), "sms" as const) }, { phone: "+919800000080", ip: "1.1.1.1", echo: false, maxPerIp: 100, review: expired, log });
    expect(codes).toHaveLength(1);
    await expect(auth.verifyOtp(t.db, { phone: "+919800000080", code: "246810", userAgent: null, review: expired, log })).rejects.toMatchObject({ statusCode: 400 });
    expect(warnings).toHaveLength(2);
  });
});
