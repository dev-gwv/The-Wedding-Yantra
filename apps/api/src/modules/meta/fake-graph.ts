import { appSecretProof } from "../../lib/crypto.js";
import { GraphError, metaGraphClient, type GraphForm, type GraphLead, type LeadAccess, type MetaGraph } from "./graph.js";

/**
 * A pretend Facebook for tests and META_FAKE=true. It answers the real Graph client
 * (`metaGraphClient`) through a fake `fetch`, so every call goes through the same headers,
 * POST bodies, paging and appsecret_proof as in production, and the fake recomputes the proof
 * from the Bearer token on every call and refuses a wrong one. Everything is in memory and
 * deterministic: ids come from counters and the world number, never from chance.
 *
 * Sign-in codes pick a scenario, optionally with a world number for a separate set of people
 * and Pages ("fake:one-page:2"):
 * - "fake:one-page": the main person grants Page 1
 * - "fake:two-pages": the main person grants Pages 1 and 2
 * - "fake:no-pages": the main person grants no Page
 * - "fake:missing-leads-permission": Page 1, but leads_retrieval was refused
 * - "fake:other-user": a different Facebook person who also manages Page 1 (with MANAGE)
 * Tokens: "fake-short-token-<user id>" (from the code), "fake-user-token-<user id>" (long-lived),
 * "fake-page-token-<page id>". `fakeIds(world)` gives the ids.
 */

export type GraphMethod = keyof MetaGraph;

export interface FakeCall {
  method: GraphMethod;
  args: unknown[];
}

export interface FakeGraphOptions {
  appSecret: string;
  /** Defaults to "fake-app", the META_FAKE default */
  appId?: string;
  version?: string;
  /** The code the pretend Facebook dialog comes back with (default "fake:two-pages") */
  loginCode?: string;
  /** Results per page of a list, to exercise paging (default 100) */
  pageSize?: number;
  now?: () => Date;
}

export interface FakeGraph extends MetaGraph {
  readonly appId: string;
  /** The pretend Graph API itself, e.g. to build a client with another app secret */
  readonly fetch: typeof fetch;
  /** Every MetaGraph call, oldest first (the last 1,000) */
  readonly calls: FakeCall[];
  /** The next call of `method` fails with `error`. */
  failNext(method: GraphMethod, error: GraphError): void;
  /** Every call of `method` fails with `error` until called again with null. */
  failAlways(method: GraphMethod, error: GraphError | null): void;
  /** A lead someone filled on the form; getLead and formLeads see it, and the form's count goes up. */
  seedLead(pageId: string, formId: string, partial?: Partial<GraphLead>): GraphLead;
  /** Another form on the Page. */
  addForm(pageId: string, partial?: Partial<GraphForm>): GraphForm;
  /** Leads Access for a Page; while canAccess is false, lead reads fail with 100/33 as Meta's do. */
  setLeadAccess(pageId: string, access: Partial<LeadAccess>): void;
  /** Refuse ad, ad set and campaign names (no ads permission), as Meta does without ads_management. */
  withholdAdNames(on: boolean): void;
  /** What a person may do on a Page (ADVERTISE, MANAGE, ...). */
  setTasks(userId: string, pageId: string, tasks: string[]): void;
  /** Calls with this token then fail with 190, and debug_token says it isn't valid. */
  revokeToken(token: string): void;
  /** Overrides what debug_token says about a token's expiry dates. */
  setTokenExpiry(token: string, times: { expiresAt?: Date | null; dataAccessExpiresAt?: Date | null }): void;
  /** Whether our app is subscribed to the Page's leadgen events. */
  isSubscribed(pageId: string): boolean;
}

/** Ids in fake world `n` (1 to 9999). */
export function fakeIds(world = 1): { userId: string; otherUserId: string; pageIds: [string, string]; formIds: [string, string] } {
  const w = String(world).padStart(4, "0");
  return {
    userId: `100${w}1`,
    otherUserId: `100${w}2`,
    pageIds: [`200${w}1`, `200${w}2`],
    formIds: [`300${w}1`, `300${w}2`],
  };
}

/** What Meta puts in every answer of a test lead. */
export const testLeadValue = (key: string): string => `<test lead: dummy data for ${key}>`;

const ALL_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval", "ads_management"];
const PAGE_SCOPES = new Set(["pages_show_list", "pages_read_engagement", "pages_manage_metadata", "pages_manage_ads", "leads_retrieval"]);
const FULL_TASKS = ["ADVERTISE", "ANALYZE", "CREATE_CONTENT", "MESSAGING", "MODERATE", "MANAGE"];
const NAME_FIELDS = ["ad_name", "adset_name", "campaign_name"];
const SCENARIOS = new Set(["one-page", "two-pages", "no-pages", "missing-leads-permission", "other-user"]);

const DEFAULT_QUESTIONS: GraphForm["questions"] = [
  { key: "full_name", label: "Full name", type: "FULL_NAME" },
  { key: "phone_number", label: "Phone number", type: "PHONE" },
  { key: "email", label: "Email", type: "EMAIL" },
  { key: "city", label: "City", type: "CITY" },
  { key: "wedding_date", label: "Wedding date?", type: "CUSTOM" },
  { key: "budget", label: "Budget", type: "CUSTOM" },
];

interface PageState {
  id: string;
  name: string;
  formIds: string[];
  access: LeadAccess;
}
interface FormState extends GraphForm {
  pageId: string;
  leadIds: string[];
}
interface UserState {
  id: string;
  name: string;
  /** Which Pages this person granted on their last login, and the permissions */
  grantedPages: string[];
  scopes: string[];
}

type Json = Record<string, unknown>;
type MetaErrorBody = { message: string; type: string; code: number; error_subcode?: number };

const err = (code: number, message: string, type = "OAuthException", subcode?: number): MetaErrorBody => ({
  message,
  type,
  code,
  ...(subcode !== undefined ? { error_subcode: subcode } : {}),
});
const TOKEN_ERROR = err(190, "Error validating access token: The session has been invalidated.", "OAuthException", 460);
const notFound = (id: string) =>
  err(
    100,
    `Unsupported get request. Object with ID '${id}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.`,
    "GraphMethodException",
    33,
  );

/** Meta's time format: 2026-10-11T10:00:00+0000 */
const metaTime = (iso: string) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "+0000");
const toSeconds = (date: Date) => new Date(Math.floor(date.getTime() / 1000) * 1000);

export function createFakeGraph(options: FakeGraphOptions): FakeGraph {
  const appSecret = options.appSecret;
  const appId = options.appId ?? "fake-app";
  const version = options.version ?? "v26.0";
  const loginCode = options.loginCode ?? "fake:two-pages";
  const pageSize = Math.max(1, options.pageSize ?? 100);
  const now = options.now ?? (() => new Date());

  const users = new Map<string, UserState>();
  const pages = new Map<string, PageState>();
  const forms = new Map<string, FormState>();
  const leads = new Map<string, GraphLead & { pageId: string }>();
  /** user id -> page id -> tasks */
  const tasks = new Map<string, Map<string, string[]>>();
  /** Permissions each Page token carries: those of whoever last listed the Page */
  const pageScopes = new Map<string, string[]>();
  const subscriptions = new Set<string>();
  const revoked = new Set<string>();
  const expiryOverrides = new Map<string, { expiresAt?: Date | null; dataAccessExpiresAt?: Date | null }>();
  const worlds = new Set<number>();
  let withholdNames = false;
  let formSeq = 0;
  let leadSeq = 0;

  const calls: FakeCall[] = [];
  const nextFailures = new Map<GraphMethod, GraphError[]>();
  const alwaysFailures = new Map<GraphMethod, GraphError>();

  function ensureWorld(n: number): void {
    if (worlds.has(n)) return;
    worlds.add(n);
    const ids = fakeIds(n);
    const suffix = n === 1 ? "" : ` ${n}`;
    users.set(ids.userId, { id: ids.userId, name: `Asha Mehra${suffix}`, grantedPages: [], scopes: [] });
    users.set(ids.otherUserId, { id: ids.otherUserId, name: `Rohan Gupta${suffix}`, grantedPages: [], scopes: [] });
    const pageNames = [`Shubh Vivah Weddings${suffix}`, `Shubh Vivah Decor${suffix}`];
    const formNames = ["Wedding enquiry", "Decor enquiry"];
    ids.pageIds.forEach((pageId, i) => {
      pages.set(pageId, {
        id: pageId,
        name: pageNames[i]!,
        formIds: [ids.formIds[i]!],
        access: { canAccess: true, managerEnabled: false, failureReason: null, failureResolution: null },
      });
      forms.set(ids.formIds[i]!, {
        id: ids.formIds[i]!,
        name: formNames[i]!,
        status: "ACTIVE",
        leadsCount: 0,
        questions: DEFAULT_QUESTIONS.map((q) => ({ ...q })),
        pageId,
        leadIds: [],
      });
      setTaskList(ids.userId, pageId, FULL_TASKS);
    });
    setTaskList(ids.otherUserId, ids.pageIds[0], ["ADVERTISE", "ANALYZE", "CREATE_CONTENT", "MODERATE", "MANAGE"]);
  }

  function setTaskList(userId: string, pageId: string, list: string[]): void {
    const forUser = tasks.get(userId) ?? new Map<string, string[]>();
    forUser.set(pageId, [...list]);
    tasks.set(userId, forUser);
  }

  /** Pages (and their world) are made on first mention, so tests can seed before connecting. */
  function page(pageId: string): PageState | undefined {
    const m = /^200(\d{4})[12]$/.exec(pageId);
    if (m && Number(m[1]) >= 1) ensureWorld(Number(m[1]));
    return pages.get(pageId);
  }

  function form(formId: string): FormState | undefined {
    const m = /^300(\d{4})[12]$/.exec(formId);
    if (m && Number(m[1]) >= 1) ensureWorld(Number(m[1]));
    return forms.get(formId);
  }

  ensureWorld(1);

  // ---- tokens -------------------------------------------------------------------------

  /** The person behind a user token, if it is one we gave out and still valid. */
  function userOf(token: string | null): UserState | null {
    if (!token || revoked.has(token)) return null;
    const m = /^fake-(?:short|user)-token-(\d+)$/.exec(token);
    const user = m ? users.get(m[1]!) : undefined;
    return user && user.scopes.length ? user : null;
  }

  /** The Page a Page token is for, if valid. */
  function pageOf(token: string | null): PageState | null {
    if (!token || revoked.has(token)) return null;
    const m = /^fake-page-token-(\d+)$/.exec(token);
    return (m && page(m[1]!)) || null;
  }

  function newLeadId(): string {
    leadSeq += 1;
    return `9${String(leadSeq).padStart(12, "0")}`;
  }

  function storeLead(pageId: string, formId: string, partial: Partial<GraphLead>, defaults: Partial<GraphLead>): GraphLead {
    const f = forms.get(formId)!;
    const lead: GraphLead = {
      id: partial.id ?? newLeadId(),
      createdTime: now().toISOString(),
      formId,
      adId: null,
      adName: null,
      adsetId: null,
      adsetName: null,
      campaignId: null,
      campaignName: null,
      isOrganic: false,
      platform: null,
      fieldData: [],
      ...defaults,
      ...partial,
    };
    lead.createdTime = toSeconds(new Date(lead.createdTime)).toISOString();
    lead.formId = formId;
    leads.set(lead.id, { ...lead, pageId });
    f.leadIds.push(lead.id);
    f.leadsCount += 1;
    return { ...lead, fieldData: lead.fieldData.map((fd) => ({ name: fd.name, values: [...fd.values] })) };
  }

  function leadJson(lead: GraphLead, fields: Set<string>): Json {
    const all: Json = {
      id: lead.id,
      created_time: metaTime(lead.createdTime),
      field_data: lead.fieldData.map((fd) => ({ name: fd.name, values: [...fd.values] })),
      form_id: lead.formId,
      ad_id: lead.adId,
      ad_name: lead.adName,
      adset_id: lead.adsetId,
      adset_name: lead.adsetName,
      campaign_id: lead.campaignId,
      campaign_name: lead.campaignName,
      platform: lead.platform,
      is_organic: lead.isOrganic,
    };
    const out: Json = { id: lead.id };
    // Meta leaves out fields it has no value for, and only answers the fields asked for.
    for (const [key, value] of Object.entries(all)) if (fields.has(key) && value !== null && value !== undefined) out[key] = value;
    return out;
  }

  function formJson(f: FormState): Json {
    return { id: f.id, name: f.name, status: f.status, leads_count: f.leadsCount, questions: f.questions.map((q) => ({ ...q, id: `${f.id}-${q.key}` })) };
  }

  /** One page of a list, with Meta's cursor paging. */
  function paged(rows: Json[], params: URLSearchParams): Json {
    const limit = Math.min(pageSize, Math.max(1, Number(params.get("limit") ?? 25) || 25));
    const after = params.get("after");
    const start = after ? Number(Buffer.from(after, "base64url").toString("utf8")) || 0 : 0;
    const data = rows.slice(start, start + limit);
    const end = start + data.length;
    const cursor = (n: number) => Buffer.from(String(n), "utf8").toString("base64url");
    return {
      data,
      paging: {
        cursors: { before: cursor(start), after: cursor(end) },
        // Meta's next link; the client must use the cursor instead.
        ...(end < rows.length ? { next: `https://graph.facebook.com/${version}/next-page?after=${cursor(end)}` } : {}),
      },
    };
  }

  // ---- the pretend Graph API ----------------------------------------------------------

  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-fb-trace-id": "FakeTrace" } });
  const fail = (body: MetaErrorBody, status = 400) => reply(status, { error: { ...body, fbtrace_id: "FakeTrace" } });

  /** Lead reads: the right Page token, leads_retrieval, Leads Access, and ad names if withheld. */
  function leadReadProblem(pageId: string, token: string | null, objectId: string, fields: Set<string>): MetaErrorBody | null {
    const tokenPage = pageOf(token);
    if (!tokenPage) return TOKEN_ERROR;
    if (tokenPage.id !== pageId) return notFound(objectId);
    if (!(pageScopes.get(pageId) ?? ALL_SCOPES).includes("leads_retrieval")) {
      return err(200, "(#200) Requires leads_retrieval permission to manage the object", "OAuthException");
    }
    if (!pages.get(pageId)!.access.canAccess) return notFound(objectId);
    if (withholdNames && NAME_FIELDS.some((f) => fields.has(f))) {
      return err(200, "(#200) Ad account owner has not granted ads_management or ads_read permission", "OAuthException");
    }
    return null;
  }

  function handle(method: string, segments: string[], params: URLSearchParams, token: string | null): Response {
    const [first, second, ...rest] = segments;
    if (!first || rest.length) return fail(err(2500, "Unknown path components", "OAuthException"));

    // Sign-in codes and token exchange: the app's id and secret, no access token.
    if (first === "oauth" && second === "access_token") {
      if (params.get("client_id") !== appId || params.get("client_secret") !== appSecret) {
        return fail(err(1, "Error validating client secret.", "OAuthException"));
      }
      if (params.get("grant_type") === "fb_exchange_token") {
        const user = userOf(params.get("fb_exchange_token"));
        if (!user) return fail(TOKEN_ERROR);
        return reply(200, { access_token: `fake-user-token-${user.id}`, token_type: "bearer", expires_in: 60 * 86_400 });
      }
      const m = /^fake:([a-z-]+)(?::(\d{1,4}))?$/.exec(params.get("code") ?? "");
      if (!m || !SCENARIOS.has(m[1]!) || !params.get("redirect_uri") || Number(m[2] ?? 1) < 1) {
        return fail(err(100, "Invalid verification code format.", "OAuthException", 36007));
      }
      const world = Number(m[2] ?? 1);
      ensureWorld(world);
      const ids = fakeIds(world);
      const scenario = m[1]!;
      const user = users.get(scenario === "other-user" ? ids.otherUserId : ids.userId)!;
      user.grantedPages = scenario === "two-pages" ? [...ids.pageIds] : scenario === "no-pages" ? [] : [ids.pageIds[0]];
      user.scopes = scenario === "missing-leads-permission" ? ALL_SCOPES.filter((s) => s !== "leads_retrieval") : [...ALL_SCOPES];
      // Page tokens carry what the person granted on this login.
      for (const pageId of user.grantedPages) pageScopes.set(pageId, [...user.scopes]);
      for (const t of [`fake-short-token-${user.id}`, `fake-user-token-${user.id}`]) revoked.delete(t);
      return reply(200, { access_token: `fake-short-token-${user.id}`, token_type: "bearer", expires_in: 3600 });
    }

    // Everything else needs an access token with the right proof.
    if (!token) return fail(err(104, "An access token is required to request this resource.", "OAuthException"));
    const proof = params.get("appsecret_proof");
    if (!proof) return fail(err(100, "API calls from the server require an appsecret_proof argument", "GraphMethodException"));
    if (proof !== appSecretProof(token, appSecret)) {
      return fail(err(100, "Invalid appsecret_proof provided in the API argument", "GraphMethodException"));
    }

    if (first === "debug_token" && !second && method === "GET") {
      if (token !== `${appId}|${appSecret}`) return fail(TOKEN_ERROR);
      const input = params.get("input_token") ?? "";
      const override = expiryOverrides.get(input) ?? {};
      const unix = (d: Date | null | undefined, fallback: number) => (d === null ? 0 : d ? Math.floor(d.getTime() / 1000) : fallback);
      const nowSec = Math.floor(now().getTime() / 1000);
      const user = userOf(input);
      const pg = pageOf(input);
      if (!user && !pg) {
        return reply(200, { data: { app_id: appId, is_valid: false, scopes: [], error: { code: 190, message: "Invalid OAuth access token.", subcode: 460 } } });
      }
      const owner = user ?? [...users.values()].find((u) => u.grantedPages.includes(pg!.id)) ?? null;
      const scopes = user ? user.scopes : (pageScopes.get(pg!.id) ?? ALL_SCOPES);
      const targets = user ? user.grantedPages : [pg!.id];
      return reply(200, {
        data: {
          app_id: appId,
          type: user ? "USER" : "PAGE",
          application: "Wedding Yantra",
          data_access_expires_at: unix(override.dataAccessExpiresAt, nowSec + 90 * 86_400),
          expires_at: unix(override.expiresAt, user ? nowSec + 60 * 86_400 : 0),
          is_valid: true,
          issued_at: nowSec,
          scopes,
          granular_scopes: scopes.map((scope) => ({ scope, ...(PAGE_SCOPES.has(scope) ? { target_ids: targets } : {}) })),
          ...(owner ? { user_id: owner.id } : {}),
          ...(pg ? { profile_id: pg.id } : {}),
        },
      });
    }

    if (first === "me") {
      const user = userOf(token);
      if (!user) return fail(TOKEN_ERROR);
      if (!second && method === "GET") return reply(200, { id: user.id, name: user.name });
      if (second === "accounts" && method === "GET") {
        const rows = user.grantedPages.map((pageId) => {
          pageScopes.set(pageId, [...user.scopes]);
          return {
            id: pageId,
            name: pages.get(pageId)!.name,
            access_token: `fake-page-token-${pageId}`,
            category: "Wedding Planning Service",
            tasks: tasks.get(user.id)?.get(pageId) ?? [],
          };
        });
        return reply(200, paged(rows, params));
      }
      return fail(notFound(second ?? "me"));
    }

    const pg = page(first);
    if (pg) {
      const tokenPage = pageOf(token);
      if (!tokenPage) return fail(TOKEN_ERROR);
      if (tokenPage.id !== pg.id) return fail(notFound(first));
      if (second === "subscribed_apps") {
        if (method === "POST") {
          if (!(params.get("subscribed_fields") ?? "").split(",").includes("leadgen")) {
            return fail(err(100, "(#100) Param subscribed_fields must be one of the allowed fields", "OAuthException"));
          }
          subscriptions.add(pg.id);
          return reply(200, { success: true });
        }
        if (method === "DELETE") {
          subscriptions.delete(pg.id);
          return reply(200, { success: true });
        }
        const data = subscriptions.has(pg.id) ? [{ id: appId, name: "Wedding Yantra", category: "Business", subscribed_fields: ["leadgen"] }] : [];
        return reply(200, { data });
      }
      if (second === "leadgen_forms" && method === "GET") {
        return reply(200, paged(pg.formIds.map((id) => formJson(forms.get(id)!)), params));
      }
      if (!second && method === "GET") {
        const fields = params.get("fields") ?? "id,name";
        const out: Json = { id: pg.id };
        if (fields.includes("name")) out.name = pg.name;
        if (fields.includes("has_lead_access")) {
          const m = /has_lead_access\.user_id\((\d+)\)/.exec(fields);
          out.has_lead_access = {
            can_access_lead: pg.access.canAccess,
            enabled_lead_access_manager: pg.access.managerEnabled,
            ...(pg.access.failureReason ? { failure_reason: pg.access.failureReason } : {}),
            ...(pg.access.failureResolution ? { failure_resolution: pg.access.failureResolution } : {}),
            ...(m ? { user_id: m[1] } : {}),
          };
        }
        return reply(200, out);
      }
      return fail(err(100, `Unsupported ${method.toLowerCase()} request.`, "GraphMethodException"));
    }

    const f = form(first);
    if (f) {
      const tokenPage = pageOf(token);
      if (!tokenPage) return fail(TOKEN_ERROR);
      if (tokenPage.id !== f.pageId) return fail(notFound(first));
      if (!second && method === "GET") return reply(200, formJson(f));
      if (second === "leads" && method === "GET") {
        const fields = new Set((params.get("fields") ?? "id,created_time,field_data").split(","));
        const problem = leadReadProblem(f.pageId, token, first, fields);
        if (problem) return fail(problem);
        let since = 0;
        try {
          const filtering = JSON.parse(params.get("filtering") ?? "[]") as { field?: string; operator?: string; value?: unknown }[];
          const rule = filtering.find((x) => x.field === "time_created" && x.operator === "GREATER_THAN");
          if (rule) since = Number(rule.value) || 0;
        } catch {
          return fail(err(100, "(#100) Invalid filtering", "OAuthException"));
        }
        const rows = f.leadIds
          .map((id) => leads.get(id)!)
          .filter((lead) => new Date(lead.createdTime).getTime() / 1000 > since)
          .sort((a, b) => b.createdTime.localeCompare(a.createdTime) || b.id.localeCompare(a.id))
          .map((lead) => leadJson(lead, fields));
        return reply(200, paged(rows, params));
      }
      if (second === "test_leads" && method === "POST") {
        const lead = storeLead(f.pageId, f.id, {}, {
          fieldData: f.questions.map((q) => ({ name: q.key, values: [testLeadValue(q.key)] })),
        });
        return reply(200, { id: lead.id });
      }
      return fail(err(100, `Unsupported ${method.toLowerCase()} request.`, "GraphMethodException"));
    }

    const lead = leads.get(first);
    if (lead && !second && method === "GET") {
      const fields = new Set((params.get("fields") ?? "id,created_time,field_data").split(","));
      const problem = leadReadProblem(lead.pageId, token, first, fields);
      if (problem) return fail(problem);
      return reply(200, leadJson(lead, fields));
    }

    if (!userOf(token) && !pageOf(token)) return fail(TOKEN_ERROR);
    return fail(notFound(first));
  }

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.host !== "graph.facebook.com" || !url.pathname.startsWith(`/${version}/`)) {
      return fail(err(2500, "Unknown path components", "OAuthException"), 404);
    }
    const params = new URLSearchParams(url.searchParams);
    const body = init?.body;
    if (typeof body === "string" || body instanceof URLSearchParams) {
      for (const [key, value] of new URLSearchParams(body)) params.set(key, value);
    }
    let method = (init?.method ?? "GET").toUpperCase();
    // The Graph API reads a POST as a GET when asked to.
    if (method === "POST" && params.get("method")?.toUpperCase() === "GET") method = "GET";
    const header = new Headers(init?.headers).get("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : params.get("access_token");
    const segments = url.pathname.slice(version.length + 2).split("/").filter(Boolean).map(decodeURIComponent);
    return handle(method, segments, params, token);
  }) as typeof fetch;

  // ---- MetaGraph, through the real client -----------------------------------------------

  const client = metaGraphClient({ appId, appSecret, version, loginConfigId: null }, fakeFetch);

  /** Logs the call and throws a failure set up for it. */
  function use(method: GraphMethod, args: unknown[]): void {
    calls.push({ method, args });
    if (calls.length > 1000) calls.splice(0, calls.length - 1000);
    const queued = nextFailures.get(method);
    const next = queued?.shift();
    if (next) throw next;
    const always = alwaysFailures.get(method);
    if (always) throw always;
  }

  return {
    appId,
    fetch: fakeFetch,
    calls,

    // The pretend Facebook dialog comes straight back to the app, already "logged in".
    loginUrl(input) {
      use("loginUrl", [input]);
      const params = new URLSearchParams({ code: loginCode, state: input.state });
      return `${input.redirectUri}?${params.toString()}`;
    },
    async exchangeCode(code, redirectUri) {
      use("exchangeCode", [code, redirectUri]);
      return client.exchangeCode(code, redirectUri);
    },
    async longLivedUserToken(token) {
      use("longLivedUserToken", [token]);
      return client.longLivedUserToken(token);
    },
    async me(userToken) {
      use("me", [userToken]);
      return client.me(userToken);
    },
    async debugToken(token) {
      use("debugToken", [token]);
      return client.debugToken(token);
    },
    async listPages(userToken) {
      use("listPages", [userToken]);
      return client.listPages(userToken);
    },
    async subscribePage(pageId, pageToken) {
      use("subscribePage", [pageId, pageToken]);
      return client.subscribePage(pageId, pageToken);
    },
    async unsubscribePage(pageId, pageToken) {
      use("unsubscribePage", [pageId, pageToken]);
      return client.unsubscribePage(pageId, pageToken);
    },
    async pageSubscribed(pageId, pageToken) {
      use("pageSubscribed", [pageId, pageToken]);
      return client.pageSubscribed(pageId, pageToken);
    },
    async listForms(pageId, pageToken) {
      use("listForms", [pageId, pageToken]);
      return client.listForms(pageId, pageToken);
    },
    async getForm(formId, pageToken) {
      use("getForm", [formId, pageToken]);
      return client.getForm(formId, pageToken);
    },
    async getLead(leadgenId, pageToken) {
      use("getLead", [leadgenId, pageToken]);
      return client.getLead(leadgenId, pageToken);
    },
    async formLeads(formId, pageToken, since, after) {
      use("formLeads", [formId, pageToken, since, after]);
      return client.formLeads(formId, pageToken, since, after);
    },
    async leadAccess(pageId, fbUserId, pageToken) {
      use("leadAccess", [pageId, fbUserId, pageToken]);
      return client.leadAccess(pageId, fbUserId, pageToken);
    },
    async createTestLead(formId, pageToken) {
      use("createTestLead", [formId, pageToken]);
      return client.createTestLead(formId, pageToken);
    },

    failNext(method, error) {
      const queued = nextFailures.get(method) ?? [];
      queued.push(error);
      nextFailures.set(method, queued);
    },
    failAlways(method, error) {
      if (error) alwaysFailures.set(method, error);
      else alwaysFailures.delete(method);
    },

    seedLead(pageId, formId, partial = {}) {
      const pg = page(pageId);
      const f = form(formId);
      if (!pg || !f || f.pageId !== pageId) throw new Error(`Fake graph: form ${formId} isn't on Page ${pageId}`);
      const n = leadSeq + 1;
      return storeLead(pageId, formId, partial, {
        adId: "610000000000001",
        adName: "Wedding enquiries ad",
        adsetId: "620000000000001",
        adsetName: "Jaipur 25-35",
        campaignId: "630000000000001",
        campaignName: "Winter weddings 2026",
        platform: "fb",
        fieldData: [
          { name: "full_name", values: ["Priya Sharma"] },
          { name: "phone_number", values: [`+919876${String(n).padStart(6, "0")}`] },
          { name: "city", values: ["Jaipur"] },
          { name: "wedding_date", values: ["14/12/2026"] },
        ],
        ...(partial.isOrganic ? { adId: null, adName: null, adsetId: null, adsetName: null, campaignId: null, campaignName: null } : {}),
      });
    },

    addForm(pageId, partial = {}) {
      const pg = page(pageId);
      if (!pg) throw new Error(`Fake graph: no Page ${pageId}`);
      formSeq += 1;
      const f: FormState = {
        id: partial.id ?? `39${String(formSeq).padStart(8, "0")}`,
        name: partial.name ?? `Enquiry form ${formSeq}`,
        status: partial.status ?? "ACTIVE",
        leadsCount: partial.leadsCount ?? 0,
        questions: (partial.questions ?? DEFAULT_QUESTIONS).map((q) => ({ ...q })),
        pageId,
        leadIds: [],
      };
      forms.set(f.id, f);
      pg.formIds.push(f.id);
      return { id: f.id, name: f.name, status: f.status, leadsCount: f.leadsCount, questions: f.questions.map((q) => ({ ...q })) };
    },

    setLeadAccess(pageId, access) {
      const pg = page(pageId);
      if (!pg) throw new Error(`Fake graph: no Page ${pageId}`);
      pg.access = { ...pg.access, ...access };
    },

    withholdAdNames(on) {
      withholdNames = on;
    },

    setTasks(userId, pageId, list) {
      if (!page(pageId)) throw new Error(`Fake graph: no Page ${pageId}`);
      setTaskList(userId, pageId, list);
    },

    revokeToken(token) {
      revoked.add(token);
    },

    setTokenExpiry(token, times) {
      expiryOverrides.set(token, { ...expiryOverrides.get(token), ...times });
    },

    isSubscribed(pageId) {
      return subscriptions.has(pageId);
    },
  };
}
