import { createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createFakeGraph, type FakeGraph, type FakeGraphOptions } from "../src/modules/meta/fake-graph.js";
import { call, createBusiness, signIn, type TestContext } from "./helpers.js";

/**
 * Facebook lead ads in tests: real settings (not META_FAKE), with the pretend Facebook passed in
 * through `setup({ metaGraph })`, so a test can seed leads and make Meta fail on purpose.
 */

export const META_APP_ID = "1234567890";
export const META_APP_SECRET = "test-app-secret";
export const META_VERIFY_TOKEN = "test-verify-token";

export const META_ENV: Record<string, string> = {
  META_APP_ID,
  META_APP_SECRET,
  META_VERIFY_TOKEN,
  META_TOKEN_KEY: randomBytes(32).toString("base64"),
  WEB_APP_URL: "http://localhost:3000",
  META_FAKE: "false",
};

/** The pretend Facebook, answering for the test app. */
export const fakeGraph = (options: Partial<FakeGraphOptions> = {}): FakeGraph =>
  createFakeGraph({ appSecret: META_APP_SECRET, appId: META_APP_ID, ...options });

/** X-Hub-Signature-256 for a webhook body, as Meta signs it. */
export const signMeta = (raw: string, secret = META_APP_SECRET): string => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

/** Meta's `signed_request`: "<signature>.<payload>", both base64url. */
export function signedRequest(payload: Record<string, unknown>, secret = META_APP_SECRET): string {
  const body = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: Math.floor(Date.now() / 1000), ...payload })).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${signature}.${body}`;
}

/** A webhook body with one `leadgen` change per lead. */
export function leadgenBody(leads: { pageId: string; leadgenId: string; formId?: string | null; adId?: string | null }[]): string {
  const byPage = new Map<string, typeof leads>();
  for (const l of leads) byPage.set(l.pageId, [...(byPage.get(l.pageId) ?? []), l]);
  return JSON.stringify({
    object: "page",
    entry: [...byPage].map(([pageId, list]) => ({
      id: pageId,
      time: Math.floor(Date.now() / 1000),
      changes: list.map((l) => ({
        field: "leadgen",
        value: {
          leadgen_id: l.leadgenId,
          page_id: pageId,
          form_id: l.formId ?? null,
          ad_id: l.adId ?? null,
          adgroup_id: l.adId ?? null,
          created_time: Math.floor(Date.now() / 1000),
        },
      })),
    })),
  });
}

/** Posts a webhook as Meta does (signed unless a signature is given). */
export function postWebhook(app: FastifyInstance, raw: string, signature: string | null = signMeta(raw), headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/api/v1/integrations/meta/webhook",
    headers: { "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}), ...headers },
    payload: raw,
  });
}

/** A form-encoded post with a signed_request (deauthorize, data deletion). */
export function postSigned(app: FastifyInstance, path: "deauthorize" | "data-deletion", signed: string) {
  return app.inject({
    method: "POST",
    url: `/api/v1/integrations/meta/${path}`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: `signed_request=${encodeURIComponent(signed)}`,
  });
}

/** An owner with a business and two salespeople (staff have Leads), each with their user id. */
export async function businessWithTeam(t: TestContext, prefix: string, name = `${prefix} Weddings`) {
  const owner = await signIn(t.app, `${prefix}0000001`, "Riya Owner");
  const ws = await createBusiness(t.app, owner, name);
  const join = async (phone: string, person: string, role = "staff") => {
    const inv = await call<{ token: string }>(t.app, "POST", `/workspaces/${ws}/invitations`, { token: owner, body: { name: person, phone, role } });
    const token = await signIn(t.app, phone, person);
    await call(t.app, "POST", `/invitations/${inv.body.data.token}/accept`, { token });
    return { token, userId: await userId(t, phone) };
  };
  const arfin = await join(`${prefix}0000002`, "Arfin Khan");
  const bina = await join(`${prefix}0000003`, "Bina Shah");
  const manager = await join(`${prefix}0000004`, "Meena Manager", "manager");
  return { owner, ownerId: await userId(t, `${prefix}0000001`), ws, arfin, bina, manager };
}

async function userId(t: TestContext, phone: string): Promise<string> {
  const { rows } = await t.db.query<{ id: string }>(`SELECT id FROM users WHERE phone = $1`, [`+91${phone}`]);
  return rows[0]!.id;
}

/** "Continue with Facebook" and back: the state from the login link, completed with `code`. */
export async function connectMeta<T = Record<string, unknown>>(app: FastifyInstance, token: string, ws: string, code = "fake:one-page") {
  const started = await call<{ url: string }>(app, "POST", `/workspaces/${ws}/meta/connect`, { token, body: {} });
  const state = new URL(started.body.data.url).searchParams.get("state")!;
  const done = await call<T>(app, "POST", `/workspaces/${ws}/meta/complete`, { token, body: { code, state } });
  return { state, ...done };
}

/** The business's Page rows, by Meta's Page id. */
export async function pageRows(t: TestContext, ws: string) {
  const { rows } = await t.db.query<{ id: string; page_id: string; active: boolean; status: string; page_token_enc: string | null; problem: string | null }>(
    `SELECT id, page_id, active, status, page_token_enc, problem FROM meta_pages WHERE workspace_id = $1 ORDER BY page_id`,
    [ws],
  );
  return new Map(rows.map((r) => [r.page_id, r]));
}

/** Everything in incoming_leads for the business, oldest first. */
export async function incoming(t: TestContext, ws: string) {
  const { rows } = await t.db.query<{
    id: string;
    external_id: string;
    status: string;
    received_via: string;
    attempts: number;
    error_kind: string | null;
    last_error: string | null;
    lead_id: string | null;
    created_lead: boolean;
    is_test: boolean;
    next_attempt_at: Date;
    platform: string | null;
    campaign_name: string | null;
  }>(`SELECT * FROM incoming_leads WHERE workspace_id = $1 ORDER BY received_at, id`, [ws]);
  return rows;
}

/** Alerts a person has, newest first. */
export async function alerts(app: FastifyInstance, ws: string, token: string, kind?: string) {
  const res = await call<{ items: { kind: string; title: string; body: string; link: string | null }[] }>(app, "GET", `/workspaces/${ws}/notifications`, { token });
  return res.body.data.items.filter((a) => !kind || a.kind === kind);
}
