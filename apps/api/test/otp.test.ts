import type { FastifyBaseLogger } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createFallbackOtpSender, createMsg91OtpSender, createWhatsAppOtpSender, type OtpSender } from "../src/modules/auth/otp-sender.js";
import { setup, type TestContext } from "./helpers.js";

const quiet = { error() {}, warn() {}, info() {} } as unknown as FastifyBaseLogger;

/** A stand-in for fetch that records what was sent and answers as told. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

describe("sign-in code senders", () => {
  it("sends the code on WhatsApp with the authentication template", async () => {
    const f = fakeFetch(200, { messages: [{ id: "wamid.1" }] });
    const sender = createWhatsAppOtpSender({ token: "wa-token", phoneNumberId: "12345", template: "sign_in_code", language: "en" }, f.fn);
    expect(await sender.send("+919876543210", "482913")).toBe("whatsapp");
    expect(f.calls[0]!.url).toBe("https://graph.facebook.com/v21.0/12345/messages");
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer wa-token");
    const body = JSON.parse(f.calls[0]!.init.body as string);
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "919876543210", type: "template", template: { name: "sign_in_code", language: { code: "en" } } });
    expect(JSON.stringify(body.template.components)).toContain("482913");

    const failing = createWhatsAppOtpSender({ token: "x", phoneNumberId: "1", template: "t", language: "en" }, fakeFetch(400, { error: { message: "Template not approved" } }).fn);
    await expect(failing.send("+919876543210", "111111")).rejects.toThrow(/Template not approved/);
  });

  it("sends the code by SMS through MSG91", async () => {
    const f = fakeFetch(200, { type: "success", request_id: "r1" });
    const sender = createMsg91OtpSender({ authKey: "msg-key", templateId: "tmpl-1" }, f.fn);
    expect(await sender.send("+919876543210", "482913")).toBe("sms");
    const url = new URL(f.calls[0]!.url);
    expect(url.origin + url.pathname).toBe("https://control.msg91.com/api/v5/otp");
    expect(Object.fromEntries(url.searchParams)).toEqual({ template_id: "tmpl-1", mobile: "919876543210", otp: "482913" });
    expect((f.calls[0]!.init.headers as Record<string, string>).authkey).toBe("msg-key");
    // MSG91 can answer 200 with an error inside.
    const refused = createMsg91OtpSender({ authKey: "k", templateId: "t" }, fakeFetch(200, { type: "error", message: "Invalid template" }).fn);
    await expect(refused.send("+919876543210", "111111")).rejects.toThrow(/Invalid template/);
  });

  it("falls back to the next provider, and says so plainly when none gets through", async () => {
    const broken: OtpSender = { send: async () => Promise.reject(new Error("down")) };
    const sms: OtpSender = { send: async () => "sms" };
    expect(await createFallbackOtpSender([broken, sms], quiet).send("+919876543210", "123456")).toBe("sms");
    await expect(createFallbackOtpSender([broken, broken], quiet).send("+919876543210", "123456")).rejects.toMatchObject({
      statusCode: 502,
      code: "CODE_NOT_SENT",
    });
  });

  it("refuses to start with a provider that has no keys", () => {
    const base = { DATABASE_URL: "postgres://x/y" };
    expect(() => loadConfig({ ...base, OTP_PROVIDER: "whatsapp" })).toThrow(/WHATSAPP_TOKEN/);
    expect(() => loadConfig({ ...base, OTP_PROVIDER: "msg91" })).toThrow(/MSG91_AUTH_KEY/);
    expect(() => loadConfig({ ...base, OTP_PROVIDER: "pigeon" })).toThrow(/isn't known/);
    const both = loadConfig({
      ...base,
      OTP_PROVIDER: "whatsapp, msg91",
      WHATSAPP_TOKEN: "t",
      WHATSAPP_PHONE_NUMBER_ID: "1",
      MSG91_AUTH_KEY: "k",
      MSG91_OTP_TEMPLATE_ID: "m",
    });
    expect(both.otp.providers).toEqual(["whatsapp", "msg91"]);
    expect(both.otp.whatsapp).toMatchObject({ template: "sign_in_code", language: "en" });
    expect(loadConfig(base).otp.providers).toEqual([]);
  });
});

describe("asking for a sign-in code", () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(async () => {
    await t.close();
  });

  const appWith = async (otpSender: OtpSender) => {
    const app = await buildApp({
      config: loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", AUTH_OTP_MAX_PER_IP: "10000" }),
      db: t.db,
      logger: false,
      otpSender,
      files: t.files,
    });
    await app.ready();
    return app;
  };

  it("says how the code went out, and never shows it when a provider sends it", async () => {
    const app = await appWith({ send: async () => "whatsapp" });
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/otp/request", payload: { phone: "9876500001" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ sent: true, channel: "whatsapp" });
    expect(res.json().data.devCode).toBeUndefined();
    await app.close();
  });

  it("asks the person to try again when the code couldn't be sent", async () => {
    const app = await appWith(createFallbackOtpSender([{ send: async () => Promise.reject(new Error("down")) }], quiet));
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/otp/request", payload: { phone: "9876500002" } });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toMatch(/try again/);
    await app.close();
  });
});
