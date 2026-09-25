import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { call, createBusiness, setup, signIn, type TestContext } from "./helpers.js";

const WEBHOOK_SECRET = "whsec_test_secret";
const ADMIN_TOKEN = "a".repeat(40);
const started: { planId: string; totalCount: number; notes: Record<string, string> }[] = [];

let t: TestContext;
beforeAll(async () => {
  t = await setup({
    env: {
      BILLING_ENFORCED: "true",
      RAZORPAY_KEY_ID: "rzp_test_key",
      RAZORPAY_KEY_SECRET: "rzp_test_secret",
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_PLANS: "studio:monthly=plan_studio_m, starter:yearly=plan_starter_y",
      ADMIN_TOKEN,
    },
    gateway: {
      async createSubscription(input) {
        started.push(input);
        return { id: `sub_${started.length}`, url: `https://rzp.io/i/pay${started.length}` };
      },
    },
  });
});
afterAll(async () => {
  await t.close();
});

type Billing = {
  status: string;
  plan: string | null;
  period: string | null;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  cancelled: boolean;
  usage: { members: number; membersLimit: number; eventsThisYear: number; eventsLimit: number | null };
  onlinePayment: boolean;
  enforced: boolean;
};

/** Sends a Razorpay-signed message the way Razorpay does. */
async function webhook(event: string, subscriptionId: string, currentEnd: number | null, eventId: string, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify({ event, payload: { subscription: { entity: { id: subscriptionId, current_end: currentEnd } } } });
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/billing/razorpay/webhook",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature": createHmac("sha256", secret).update(body).digest("hex"),
      "x-razorpay-event-id": eventId,
    },
    payload: body,
  });
  return { status: res.statusCode, body: res.json() as { data: { result: string } } };
}

const invite = (token: string, ws: string, n: number) =>
  call(t.app, "POST", `/workspaces/${ws}/invitations`, { token, body: { name: `Person ${n}`, phone: `99100000${String(n).padStart(2, "0")}`, role: "staff" } });

describe("plans and billing", () => {
  it("starts every business on a free trial and shows the owner where it stands", async () => {
    const owner = await signIn(t.app, "9900000001", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Trial Studio");
    const billing = await call<Billing>(t.app, "GET", `/workspaces/${ws}/billing`, { token: owner });
    expect(billing.status).toBe(200);
    expect(billing.body.data).toMatchObject({
      status: "trial",
      plan: null,
      onlinePayment: true,
      enforced: true,
      usage: { members: 1, membersLimit: 15, eventsThisYear: 0, eventsLimit: null },
    });
    const days = (Date.parse(billing.body.data.trialEndsAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const home = await call<{ billing: { status: string; trialDaysLeft: number; enforced: boolean } | null }>(t.app, "GET", `/workspaces/${ws}/home`, {
      token: owner,
    });
    expect(home.body.data.billing).toEqual({ status: "trial", trialDaysLeft: 14, enforced: true });

    // Only the owner handles the plan.
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, {
      token: owner,
      body: { name: "Manager Person", phone: "9900000002", role: "manager" },
    });
    const manager = await signIn(t.app, "9900000002", "Manager Person");
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token: manager });
    expect((await call(t.app, "GET", `/workspaces/${ws}/billing`, { token: manager })).status).toBe(403);
    expect((await call(t.app, "POST", `/workspaces/${ws}/billing/checkout`, { token: manager, body: { plan: "studio", period: "monthly" } })).status).toBe(403);
    expect((await call<{ billing: unknown }>(t.app, "GET", `/workspaces/${ws}/home`, { token: manager })).body.data.billing).toBeNull();
  });

  it("locks adding things when the trial runs out, and opens again once paid", async () => {
    const owner = await signIn(t.app, "9900000011", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Lapsed Studio");
    await t.db.query(`UPDATE workspaces SET trial_ends_at = now() - interval '1 day' WHERE id = $1`, [ws]);

    const blocked = await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "New Lead" } });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe("PAYMENT_REQUIRED");
    // Reading still works, and so does choosing a plan.
    expect((await call(t.app, "GET", `/workspaces/${ws}/leads`, { token: owner })).status).toBe(200);
    expect((await call<Billing>(t.app, "GET", `/workspaces/${ws}/billing`, { token: owner })).body.data.status).toBe("expired");
    // Someone outside the business learns nothing about it.
    const stranger = await signIn(t.app, "9900000019", "Stranger");
    expect((await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: stranger, body: { name: "X Y" } })).status).toBe(404);

    // A plan that isn't set up for online payment says so.
    expect((await call(t.app, "POST", `/workspaces/${ws}/billing/checkout`, { token: owner, body: { plan: "business", period: "yearly" } })).status).toBe(503);
    const checkout = await call<{ url: string }>(t.app, "POST", `/workspaces/${ws}/billing/checkout`, {
      token: owner,
      body: { plan: "studio", period: "monthly" },
    });
    expect(checkout.status).toBe(200);
    expect(checkout.body.data.url).toMatch(/^https:\/\/rzp\.io\/i\/pay\d+$/);
    expect(started.at(-1)).toMatchObject({ planId: "plan_studio_m", totalCount: 120, notes: { workspace_id: ws, plan: "studio" } });
    const subId = `sub_${started.length}`;
    // Paying hasn't happened yet: still locked.
    expect((await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "New Lead" } })).status).toBe(402);

    // Razorpay says it's paid. Forged or repeated messages change nothing.
    const monthAhead = Math.floor(Date.now() / 1000) + 30 * 86_400;
    expect((await webhook("subscription.activated", subId, monthAhead, "evt_1", "not-the-secret")).status).toBe(400);
    const paid = await webhook("subscription.activated", subId, monthAhead, "evt_1");
    expect(paid.body.data.result).toBe("handled");
    expect((await webhook("subscription.activated", subId, monthAhead, "evt_1")).body.data.result).toBe("repeat");
    expect((await webhook("subscription.charged", "sub_unknown", monthAhead, "evt_2")).body.data.result).toBe("ignored");

    const now = await call<Billing>(t.app, "GET", `/workspaces/${ws}/billing`, { token: owner });
    expect(now.body.data).toMatchObject({ status: "active", plan: "studio", period: "monthly", cancelled: false, usage: { membersLimit: 5 } });
    expect((await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "New Lead" } })).status).toBe(201);
    // One plan at a time.
    expect((await call(t.app, "POST", `/workspaces/${ws}/billing/checkout`, { token: owner, body: { plan: "studio", period: "monthly" } })).status).toBe(409);

    // Studio is for five people, the owner included.
    for (let n = 1; n <= 4; n++) expect((await invite(owner, ws, n)).status).toBe(201);
    const fifth = await invite(owner, ws, 5);
    expect(fifth.status).toBe(402);
    expect(fifth.body.error.code).toBe("PLAN_LIMIT");

    // Cancelled: keeps working until the paid month ends.
    await webhook("subscription.cancelled", subId, monthAhead, "evt_3");
    expect((await call<Billing>(t.app, "GET", `/workspaces/${ws}/billing`, { token: owner })).body.data).toMatchObject({ status: "active", cancelled: true });
    expect((await call(t.app, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Another Lead" } })).status).toBe(201);
  });

  it("lets whoever runs the service record a plan paid another way, and holds it to its limits", async () => {
    const owner = await signIn(t.app, "9900000021", "Owner Person");
    const ws = await createBusiness(t.app, owner, "Solo Artist");
    const until = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const body = { plan: "starter", period: "yearly", until, note: "Paid by UPI" };
    const admin = (token?: string) =>
      t.app.inject({ method: "POST", url: `/api/v1/admin/workspaces/${ws}/plan`, headers: token ? { "x-admin-token": token } : {}, payload: body });
    expect((await admin()).statusCode).toBe(404);
    expect((await admin("b".repeat(40))).statusCode).toBe(404);
    expect((await admin(ADMIN_TOKEN)).statusCode).toBe(200);

    const billing = await call<Billing>(t.app, "GET", `/workspaces/${ws}/billing`, { token: owner });
    expect(billing.body.data).toMatchObject({ status: "active", plan: "starter", usage: { membersLimit: 1, eventsLimit: 30 } });

    // Starter is for one person and 30 events a year.
    const inv = await invite(owner, ws, 31);
    expect(inv.status).toBe(402);
    expect(inv.body.error.message).toMatch(/one person/);
    await t.db.query(
      `INSERT INTO events (workspace_id, title, created_by) SELECT $1, 'Event ' || n, NULL FROM generate_series(1, 29) n`,
      [ws],
    );
    const event = (title: string) =>
      call(t.app, "POST", `/workspaces/${ws}/events`, {
        token: owner,
        body: { newClient: { name: `${title} Family` }, title, functions: [{ name: "Wedding", date: until }] },
      });
    expect((await event("The 30th")).status).toBe(201);
    const over = await event("The 31st");
    expect(over.status).toBe(402);
    expect(over.body.error.message).toMatch(/30 events a year/);
  });
});

describe("while billing isn't enforced", () => {
  it("shows the trial but never locks anything, and says online payment is off", async () => {
    const plain = await buildApp({
      config: loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL, NODE_ENV: "test", AUTH_OTP_DEV_ECHO: "true", AUTH_OTP_MAX_PER_IP: "10000" }),
      db: t.db,
      logger: false,
      otpSender: { send: async () => undefined },
      files: t.files,
    });
    await plain.ready();
    try {
      const owner = await signIn(plain, "9900000031", "Owner Person");
      const ws = await createBusiness(plain, owner, "Relaxed Studio");
      await t.db.query(`UPDATE workspaces SET trial_ends_at = now() - interval '1 day' WHERE id = $1`, [ws]);
      expect((await call(plain, "POST", `/workspaces/${ws}/leads`, { token: owner, body: { name: "Still Fine" } })).status).toBe(201);
      const billing = await call<Billing>(plain, "GET", `/workspaces/${ws}/billing`, { token: owner });
      expect(billing.body.data).toMatchObject({ status: "expired", onlinePayment: false, enforced: false });
      const checkout = await call(plain, "POST", `/workspaces/${ws}/billing/checkout`, { token: owner, body: { plan: "studio", period: "monthly" } });
      expect(checkout.status).toBe(503);
      expect(checkout.body.error.code).toBe("BILLING_UNAVAILABLE");
      expect((await plain.inject({ method: "POST", url: "/api/v1/billing/razorpay/webhook", payload: {} })).statusCode).toBe(404);
    } finally {
      await plain.close();
    }
  });
});
