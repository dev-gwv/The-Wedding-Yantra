import { appSecretProof } from "../../lib/crypto.js";

/**
 * Meta's Graph API, as far as lead ads need it. Injectable: tests and META_FAKE use
 * `createFakeGraph` (fake-graph.ts), which runs this same client against a pretend Graph API.
 *
 * Tokens travel in the Authorization header with an appsecret_proof, secrets (the sign-in
 * code, the token being exchanged or checked) in POST bodies, never in a URL. A GraphError
 * never carries a URL, a token or a response body, so it is safe to log and to show.
 */

export type GraphErrorKind = "token" | "permission" | "lead_access" | "rate_limit" | "not_found" | "transient" | "other";

export class GraphError extends Error {
  readonly kind: GraphErrorKind;
  /** Meta's error code, e.g. 190 */
  readonly code?: number;
  readonly subcode?: number;
  /** How long to wait before trying again (rate limits) */
  readonly retryAfterMs?: number;
  /** Meta's trace id, to quote to Meta's support */
  readonly fbtraceId?: string;
  /**
   * True for Meta's 100/33 ("object does not exist, cannot be loaded due to missing permissions,
   * or does not support this operation"). It is reported as "not_found", but a Leads Access
   * block, a missing permission and a lead Meta hasn't finished saving all look the same, so the
   * worker must never treat it as final: it retries, then runs the Leads Access and Page-token
   * checks before giving up.
   */
  readonly ambiguous: boolean;

  constructor(
    kind: GraphErrorKind,
    message: string,
    details: { code?: number; subcode?: number; retryAfterMs?: number; fbtraceId?: string; ambiguous?: boolean } = {},
  ) {
    super(message);
    this.name = "GraphError";
    this.kind = kind;
    if (details.code !== undefined) this.code = details.code;
    if (details.subcode !== undefined) this.subcode = details.subcode;
    if (details.retryAfterMs !== undefined) this.retryAfterMs = details.retryAfterMs;
    if (details.fbtraceId !== undefined) this.fbtraceId = details.fbtraceId;
    this.ambiguous = details.ambiguous ?? false;
  }
}

export const isGraphError = (err: unknown): err is GraphError => err instanceof GraphError;

/** Rate limits without Meta's estimate wait this long. */
export const DEFAULT_RATE_LIMIT_WAIT_MS = 15 * 60 * 1000;

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Takes URLs, long token-like strings and any known secret out of Meta's message, and keeps it short. */
function cleanMessage(message: string, secrets: readonly string[] = []): string {
  let out = message;
  for (const secret of secrets) if (secret) out = out.split(secret).join("…");
  out = out
    .replace(/https?:\/\/\S+/gi, "…")
    .replace(/[A-Za-z0-9_\-|]{40,}/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  return out.length > 300 ? `${out.slice(0, 299)}…` : out;
}

/** The longest "estimated_time_to_regain_access" (minutes) in Meta's usage headers or error data. */
function regainMinutes(headers: Headers | undefined, errorData: unknown): number | null {
  const found: number[] = [];
  const collect = (value: unknown, depth = 0): void => {
    if (depth > 4 || !value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === "estimated_time_to_regain_access" && typeof v === "number" && Number.isFinite(v)) found.push(v);
      else collect(v, depth + 1);
    }
  };
  for (const name of ["x-business-use-case-usage", "x-ad-account-usage", "x-page-usage", "x-app-usage"]) {
    const raw = headers?.get(name);
    if (!raw) continue;
    try {
      collect(JSON.parse(raw));
    } catch {
      // Not JSON: ignore it.
    }
  }
  collect(errorData);
  return found.length ? Math.max(...found) : null;
}

interface MetaErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  fbtrace_id?: string;
  error_data?: unknown;
}

/**
 * Sorts a failed Graph call into what the caller should do about it:
 * - 190 (and 102): `token`, the token is dead; the owner reconnects.
 * - 10, 200-299: `permission`; for lead reads the worker then runs the Leads Access check.
 * - 4, 17, 32, 613, 80000-80014: `rate_limit`, wait `estimated_time_to_regain_access`
 *   minutes (15 when Meta doesn't say).
 * - 100 with subcode 33: `not_found` with `ambiguous: true` (see GraphError.ambiguous).
 * - HTTP 5xx, network trouble (status 0), is_transient, code 2: `transient`.
 * - anything else: `other`.
 */
export function classifyGraphError(status: number, body: unknown, headers?: Headers, secrets: readonly string[] = []): GraphError {
  const error: MetaErrorBody | null =
    body && typeof body === "object" && "error" in body && body.error && typeof body.error === "object" ? (body.error as MetaErrorBody) : null;
  const code = typeof error?.code === "number" ? error.code : undefined;
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : undefined;
  const fbtraceId = (typeof error?.fbtrace_id === "string" ? error.fbtrace_id : undefined) ?? headers?.get("x-fb-trace-id") ?? undefined;
  const said = error?.message ? cleanMessage(`Meta: ${error.message}`, secrets) : status ? `Meta answered ${status}` : "Couldn't reach Meta";
  const details = { code, subcode, fbtraceId };

  if (code === 190 || code === 102) return new GraphError("token", said, details);
  if (code !== undefined && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014))) {
    const minutes = regainMinutes(headers, error?.error_data);
    return new GraphError("rate_limit", said, { ...details, retryAfterMs: minutes !== null ? minutes * 60_000 : DEFAULT_RATE_LIMIT_WAIT_MS });
  }
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) return new GraphError("permission", said, details);
  if (code === 100 && subcode === 33) return new GraphError("not_found", said, { ...details, ambiguous: true });
  if (status === 0 || status >= 500 || error?.is_transient === true || code === 2) {
    return new GraphError("transient", said, details);
  }
  if (status === 429) return new GraphError("rate_limit", said, { ...details, retryAfterMs: DEFAULT_RATE_LIMIT_WAIT_MS });
  return new GraphError("other", said, details);
}

/** A lead as Meta gives it. Ad, ad set and campaign names are best effort (null when withheld). */
export interface GraphLead {
  id: string;
  /** ISO 8601 */
  createdTime: string;
  formId: string | null;
  adId: string | null;
  adName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  isOrganic: boolean;
  /** "fb", "ig", ... as Meta sends it */
  platform: string | null;
  fieldData: { name: string; values: string[] }[];
}

export interface GraphForm {
  id: string;
  name: string;
  /** ACTIVE, ARCHIVED, ... */
  status: string;
  leadsCount: number;
  questions: { key: string; label: string; type: string }[];
}

export interface GraphPage {
  id: string;
  name: string;
  accessToken: string;
  /** ADVERTISE, MANAGE, ... what this person may do on the Page */
  tasks: string[];
}

export interface GraphToken {
  accessToken: string;
  expiresAt: Date | null;
}

export interface GraphTokenInfo {
  isValid: boolean;
  appId: string | null;
  /** USER or PAGE */
  type: string | null;
  userId: string | null;
  /** null: never expires */
  expiresAt: Date | null;
  /** When Meta stops sharing data for this login unless the person logs in again */
  dataAccessExpiresAt: Date | null;
  scopes: string[];
  granularScopes: { scope: string; targetIds: string[] }[];
  error: { code: number | null; subcode: number | null; message: string } | null;
}

export interface LeadAccess {
  canAccess: boolean;
  /** The business uses Leads Access Manager, so CRMs must be assigned there */
  managerEnabled: boolean;
  failureReason: string | null;
  failureResolution: string | null;
}

export interface MetaGraph {
  /** Facebook's sign-in dialog. `rerequest` asks again for permissions the person refused. */
  loginUrl(input: { state: string; redirectUri: string; rerequest?: boolean }): string;
  exchangeCode(code: string, redirectUri: string): Promise<GraphToken>;
  longLivedUserToken(shortLivedToken: string): Promise<GraphToken>;
  me(userToken: string): Promise<{ id: string; name: string }>;
  debugToken(token: string): Promise<GraphTokenInfo>;
  /** Every Page the person granted, with its Page token (all result pages followed). */
  listPages(userToken: string): Promise<GraphPage[]>;
  /** Asks Meta to send this Page's leadgen events to our webhook. */
  subscribePage(pageId: string, pageToken: string): Promise<void>;
  unsubscribePage(pageId: string, pageToken: string): Promise<void>;
  /** Whether our app is subscribed to the Page's leadgen events. */
  pageSubscribed(pageId: string, pageToken: string): Promise<boolean>;
  listForms(pageId: string, pageToken: string): Promise<GraphForm[]>;
  getForm(formId: string, pageToken: string): Promise<GraphForm>;
  getLead(leadgenId: string, pageToken: string): Promise<GraphLead>;
  /** One page of a form's leads created after `since`, newest first; pass `next` back as `after`. */
  formLeads(formId: string, pageToken: string, since: Date, after?: string): Promise<{ leads: GraphLead[]; next: string | null }>;
  leadAccess(pageId: string, fbUserId: string, pageToken: string): Promise<LeadAccess>;
  /** Meta's test lead for a form. id is null when Meta answered without one. */
  createTestLead(formId: string, pageToken: string): Promise<{ id: string | null }>;
}

export interface MetaGraphOptions {
  appId: string;
  appSecret: string;
  /** e.g. "v26.0" */
  version: string;
  loginConfigId: string | null;
}

/** Permissions asked for by name when there is no Facebook Login for Business configuration. */
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "leads_retrieval",
  "ads_management",
] as const;

const TIMEOUT_MS = 10_000;
/** At most this many result pages per list (100 each), so a bad cursor can't loop forever. */
const MAX_RESULT_PAGES = 50;
const LEAD_FIELDS = [
  "id",
  "created_time",
  "field_data",
  "form_id",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "platform",
  "is_organic",
];
/** Need ads permissions on the ad account; asked for again without them when refused. */
const NAME_FIELDS = new Set(["ad_name", "adset_name", "campaign_name"]);
const FORM_FIELDS = "id,name,status,leads_count,questions";

type Json = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);

/** Meta writes times as "2026-10-11T10:00:00+0000". */
function isoTime(v: unknown): string {
  const raw = str(v);
  if (!raw) return new Date(0).toISOString();
  const date = new Date(raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

/** Unix seconds to a date; 0 (or nothing) means never. */
const fromUnix = (v: unknown): Date | null => (typeof v === "number" && v > 0 ? new Date(v * 1000) : null);

function toLead(raw: Json): GraphLead {
  const fields = Array.isArray(raw.field_data) ? (raw.field_data as Json[]) : [];
  return {
    id: str(raw.id) ?? "",
    createdTime: isoTime(raw.created_time),
    formId: str(raw.form_id),
    adId: str(raw.ad_id),
    adName: str(raw.ad_name),
    adsetId: str(raw.adset_id),
    adsetName: str(raw.adset_name),
    campaignId: str(raw.campaign_id),
    campaignName: str(raw.campaign_name),
    isOrganic: raw.is_organic === true,
    platform: str(raw.platform),
    fieldData: fields.map((f) => ({
      name: str(f.name) ?? "",
      values: Array.isArray(f.values) ? (f.values as unknown[]).map((v) => (v === null || v === undefined ? "" : String(v))) : [],
    })),
  };
}

function toForm(raw: Json): GraphForm {
  const questions = Array.isArray(raw.questions) ? (raw.questions as Json[]) : [];
  return {
    id: str(raw.id) ?? "",
    name: str(raw.name) ?? "",
    status: str(raw.status) ?? "ACTIVE",
    leadsCount: Number(raw.leads_count ?? 0) || 0,
    questions: questions.map((q) => ({ key: str(q.key) ?? "", label: str(q.label) ?? str(q.key) ?? "", type: str(q.type) ?? "CUSTOM" })),
  };
}

/** The real Graph API over HTTPS. `fetchImpl` lets tests (and the fake) stand in for Meta. */
export function metaGraphClient(options: MetaGraphOptions, fetchImpl: typeof fetch = fetch): MetaGraph {
  const { appId, appSecret, version, loginConfigId } = options;
  const base = `https://graph.facebook.com/${version}`;
  const appToken = `${appId}|${appSecret}`;

  async function call<T = Json>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts: { token?: string; query?: Record<string, string>; form?: Record<string, string>; secrets?: string[] } = {},
  ): Promise<T> {
    const query = new URLSearchParams(opts.query);
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.token) {
      headers.authorization = `Bearer ${opts.token}`;
      query.set("appsecret_proof", appSecretProof(opts.token, appSecret));
    }
    let body: string | undefined;
    if (opts.form) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(opts.form).toString();
    }
    const qs = query.toString();
    const secrets = [appSecret, appToken, ...(opts.token ? [opts.token] : []), ...(opts.secrets ?? [])];
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}${qs ? `?${qs}` : ""}`, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const timedOut = (err as Error)?.name === "TimeoutError" || (err as Error)?.name === "AbortError";
      throw new GraphError("transient", timedOut ? "Meta took too long to answer" : "Couldn't reach Meta");
    }
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    if (!res.ok || (parsed && typeof parsed === "object" && "error" in parsed)) {
      throw classifyGraphError(res.status, parsed, res.headers, secrets);
    }
    if (!parsed || typeof parsed !== "object") throw new GraphError("transient", "Meta's answer couldn't be read");
    return parsed as T;
  }

  /** Follows `paging.cursors.after` (never the `next` URL, which can carry a token). */
  async function everyPage(path: string, token: string, query: Record<string, string>): Promise<Json[]> {
    const out: Json[] = [];
    let after: string | undefined;
    for (let i = 0; i < MAX_RESULT_PAGES; i++) {
      const body = await call<{ data?: Json[]; paging?: { next?: string; cursors?: { after?: string } } }>("GET", path, {
        token,
        query: { ...query, limit: "100", ...(after ? { after } : {}) },
      });
      out.push(...(body.data ?? []));
      after = body.paging?.next ? body.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  }

  /** Lead reads: when the ad names are refused (no ads permission), ask once more without them. */
  async function withNames<T>(read: (fields: string) => Promise<T>): Promise<T> {
    try {
      return await read(LEAD_FIELDS.join(","));
    } catch (err) {
      if (!(err instanceof GraphError) || err.kind !== "permission") throw err;
      return read(LEAD_FIELDS.filter((f) => !NAME_FIELDS.has(f)).join(","));
    }
  }

  const id = (value: string) => encodeURIComponent(value);

  const toToken = (body: { access_token?: string; expires_in?: number }): GraphToken => {
    if (!body.access_token) throw new GraphError("other", "Meta didn't give a token");
    return {
      accessToken: body.access_token,
      expiresAt: typeof body.expires_in === "number" && body.expires_in > 0 ? new Date(Date.now() + body.expires_in * 1000) : null,
    };
  };

  return {
    loginUrl({ state, redirectUri, rerequest }) {
      const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: "code" });
      if (loginConfigId) params.set("config_id", loginConfigId);
      else params.set("scope", META_SCOPES.join(","));
      if (rerequest) params.set("auth_type", "rerequest");
      return `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}`;
    },

    async exchangeCode(code, redirectUri) {
      const body = await call<{ access_token?: string; expires_in?: number }>("POST", "/oauth/access_token", {
        form: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
        secrets: [code],
      });
      return toToken(body);
    },

    async longLivedUserToken(shortLivedToken) {
      const body = await call<{ access_token?: string; expires_in?: number }>("POST", "/oauth/access_token", {
        form: { grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortLivedToken },
        secrets: [shortLivedToken],
      });
      return toToken(body);
    },

    async me(userToken) {
      const body = await call("GET", "/me", { token: userToken, query: { fields: "id,name" } });
      return { id: str(body.id) ?? "", name: str(body.name) ?? "" };
    },

    async debugToken(token) {
      // The token being checked goes in a POST body; "method=GET" tells the Graph API to treat
      // it as a read. If Meta ever refuses that, read it the plain way, which still works.
      let body: { data?: Json };
      try {
        body = await call("POST", "/debug_token", { token: appToken, form: { input_token: token, method: "GET" }, secrets: [token] });
      } catch (err) {
        if (!(err instanceof GraphError) || err.kind !== "other") throw err;
        body = await call("GET", "/debug_token", { token: appToken, query: { input_token: token }, secrets: [token] });
      }
      const d = body.data ?? {};
      const error = d.error && typeof d.error === "object" ? (d.error as Json) : null;
      return {
        isValid: d.is_valid === true,
        appId: str(d.app_id),
        type: str(d.type),
        userId: str(d.user_id),
        expiresAt: fromUnix(d.expires_at),
        dataAccessExpiresAt: fromUnix(d.data_access_expires_at),
        scopes: Array.isArray(d.scopes) ? (d.scopes as unknown[]).map(String) : [],
        granularScopes: Array.isArray(d.granular_scopes)
          ? (d.granular_scopes as Json[]).map((g) => ({
              scope: str(g.scope) ?? "",
              targetIds: Array.isArray(g.target_ids) ? (g.target_ids as unknown[]).map(String) : [],
            }))
          : [],
        error: error
          ? {
              code: typeof error.code === "number" ? error.code : null,
              subcode: typeof error.subcode === "number" ? error.subcode : null,
              message: cleanMessage(str(error.message) ?? "", [token, appSecret]),
            }
          : null,
      };
    },

    async listPages(userToken) {
      const rows = await everyPage("/me/accounts", userToken, { fields: "id,name,access_token,tasks" });
      return rows.map((p) => ({
        id: str(p.id) ?? "",
        name: str(p.name) ?? "",
        accessToken: str(p.access_token) ?? "",
        tasks: Array.isArray(p.tasks) ? (p.tasks as unknown[]).map(String) : [],
      }));
    },

    async subscribePage(pageId, pageToken) {
      const body = await call("POST", `/${id(pageId)}/subscribed_apps`, { token: pageToken, form: { subscribed_fields: "leadgen" } });
      if (body.success !== true) throw new GraphError("other", "Meta didn't switch on lead alerts for this Page");
    },

    async unsubscribePage(pageId, pageToken) {
      await call("DELETE", `/${id(pageId)}/subscribed_apps`, { token: pageToken });
    },

    async pageSubscribed(pageId, pageToken) {
      const body = await call<{ data?: Json[] }>("GET", `/${id(pageId)}/subscribed_apps`, { token: pageToken });
      return (body.data ?? []).some((app) => {
        if (str(app.id) !== appId) return false;
        // Older answers leave the field list out; the subscription itself is what counts then.
        return !Array.isArray(app.subscribed_fields) || (app.subscribed_fields as unknown[]).includes("leadgen");
      });
    },

    async listForms(pageId, pageToken) {
      return (await everyPage(`/${id(pageId)}/leadgen_forms`, pageToken, { fields: FORM_FIELDS })).map(toForm);
    },

    async getForm(formId, pageToken) {
      return toForm(await call("GET", `/${id(formId)}`, { token: pageToken, query: { fields: FORM_FIELDS } }));
    },

    async getLead(leadgenId, pageToken) {
      return withNames(async (fields) => toLead(await call("GET", `/${id(leadgenId)}`, { token: pageToken, query: { fields } })));
    },

    async formLeads(formId, pageToken, since, after) {
      const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: Math.floor(since.getTime() / 1000) }]);
      return withNames(async (fields) => {
        const body = await call<{ data?: Json[]; paging?: { next?: string; cursors?: { after?: string } } }>("GET", `/${id(formId)}/leads`, {
          token: pageToken,
          query: { fields, limit: "100", filtering, ...(after ? { after } : {}) },
        });
        return { leads: (body.data ?? []).map(toLead), next: body.paging?.next ? (body.paging.cursors?.after ?? null) : null };
      });
    },

    async leadAccess(pageId, fbUserId, pageToken) {
      // Meta's Leads Access check: has_lead_access on the Page, for the person who connected.
      // Its answer has can_access_lead, enabled_lead_access_manager, failure_reason and
      // failure_resolution. When the field is missing or shaped differently (or Meta doesn't
      // know it), we can't tell: report "can access" with no manager, so callers fall back to
      // Meta's own error on the lead. Token, permission, rate-limit and network errors still throw.
      const field = /^\d+$/.test(fbUserId) ? `has_lead_access.user_id(${fbUserId})` : "has_lead_access";
      const unknown: LeadAccess = { canAccess: true, managerEnabled: false, failureReason: null, failureResolution: null };
      let body: Json;
      try {
        body = await call("GET", `/${id(pageId)}`, { token: pageToken, query: { fields: field } });
      } catch (err) {
        if (err instanceof GraphError && err.kind === "other") return unknown;
        throw err;
      }
      let raw: unknown = body.has_lead_access;
      if (raw && typeof raw === "object" && Array.isArray((raw as Json).data)) raw = ((raw as Json).data as unknown[])[0];
      if (!raw || typeof raw !== "object" || typeof (raw as Json).can_access_lead !== "boolean") return unknown;
      const access = raw as Json;
      return {
        canAccess: access.can_access_lead === true,
        managerEnabled: access.enabled_lead_access_manager === true,
        failureReason: str(access.failure_reason),
        failureResolution: str(access.failure_resolution),
      };
    },

    async createTestLead(formId, pageToken) {
      const body = await call("POST", `/${id(formId)}/test_leads`, { token: pageToken, form: {} });
      return { id: str(body.id) };
    },
  };
}
