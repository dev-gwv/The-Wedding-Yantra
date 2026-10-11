import { createHash } from "node:crypto";
import { normalizePhone } from "@wedding-yantra/core";

/** Everything the API reads from the environment, in one place. */
export interface Config {
  port: number;
  host: string;
  nodeEnv: string;
  appVersion: string;
  databaseUrl: string;
  logLevel: string;
  corsOrigins: Set<string>;
  corsPreviewPattern: RegExp | null;
  /**
   * Return the sign-in code in the API response. Only for development and testing,
   * until an SMS/WhatsApp provider is connected. Never enable for real customers.
   */
  otpDevEcho: boolean;
  /** Sign-in codes one IP address may request per 15 minutes. */
  otpMaxPerIp: number;
  /** Sign-in codes one phone number may get per day (India time), so nobody floods a number. */
  otpMaxPerPhoneDay: number;
  /** Sign-in codes sent to everyone together per day: a ceiling on the SMS bill if a bot gets through. */
  otpMaxGlobalDay: number;
  /**
   * Which X-Forwarded-For hops to believe when working out a caller's IP address: a hop
   * count (1 = the one reverse proxy on the VPS), proxy addresses/CIDRs, or true/false.
   * `true` believes anyone, so a caller could pick their own IP and dodge the per-IP limits.
   */
  trustProxy: boolean | number | string | string[];
  /** Requests per minute from one IP address. Off in tests. */
  rateLimit: {
    enabled: boolean;
    /** Writes to /api/v1/auth/* (sign-in codes, account changes) */
    authPerMinute: number;
    /** /api/v1/public/* reads: enquiry form, quote, invoice and client links */
    publicPerMinute: number;
    /** /api/v1/public/* writes: submitting the enquiry form, accepting a quote */
    publicPostPerMinute: number;
  };
  /** How sign-in codes reach people, tried in order. Empty: not delivered (development). */
  otp: {
    providers: OtpProvider[];
    whatsapp: { token: string; phoneNumberId: string; template: string; language: string } | null;
    msg91: { authKey: string; templateId: string } | null;
    /** 2Factor.in: SMS codes from its ready-approved template, no DLT registration of your own */
    twoFactor: { apiKey: string; template: string | null } | null;
  };
  /** Who sends push alerts: a mailto: or https: address the push services can reach. */
  pushSubject: string;
  /** Where uploaded photos (bill photos, receipts) are kept on disk. */
  uploadsDir: string;
  /** Signs the short-lived links that show uploaded files. */
  filesSecret: Buffer;
  billing: {
    /**
     * Lock writes when a trial ends unpaid, and hold businesses to their plan's limits.
     * Off until prices are final and online payment works.
     */
    enforced: boolean;
    /** Razorpay subscriptions; null when its keys aren't set. */
    razorpay: {
      keyId: string;
      keySecret: string;
      webhookSecret: string;
      /** Razorpay plan ids, keyed "studio:monthly" */
      plans: Record<string, string>;
    } | null;
    /** Lets whoever runs Wedding Yantra record a plan paid another way. Null turns that off. */
    adminToken: string | null;
  };
  /** The web app's address (WEB_APP_URL), e.g. https://app.weddingyantra.com. Facebook sends owners back here. */
  webAppUrl: string | null;
  /** Facebook & Instagram lead ads; null when META_APP_ID isn't set (and META_FAKE is off). */
  meta: MetaConfig | null;
  /** A fixed sign-in code for one number, for Meta's app reviewer, only until the date. */
  reviewLogin: ReviewLogin | null;
  incoming: {
    /** Process incoming leads on the API's own timer. Off in tests, which drain the queue themselves. */
    autoDrain: boolean;
  };
}

export interface MetaConfig {
  appId: string;
  appSecret: string;
  /** What Meta sends back when it checks the webhook address */
  verifyToken: string;
  /** Seals Facebook tokens in the database and signs the sign-in state (32 bytes). */
  tokenKey: Buffer;
  /** Facebook Login for Business configuration id; without it the dialog asks for the permissions by name. */
  loginConfigId: string | null;
  /** Graph API version, e.g. "v26.0" */
  graphVersion: string;
  /** `${webAppUrl}/connect/meta`, exactly as registered with Meta */
  redirectUri: string;
  /** How often each Page is checked for leads the webhook missed */
  pollMinutes: number;
  /** "all", or the businesses that may connect (while Meta reviews the app) */
  enabledFor: "all" | Set<string>;
  /** A pretend Facebook in memory (local runs and tests); refused in production. */
  fake: boolean;
}

export interface ReviewLogin {
  /** E.164, e.g. +919876543210 */
  phone: string;
  /** Six digits */
  code: string;
  until: Date;
}

/** `starter:monthly=plan_A, studio:yearly=plan_B` -> { "starter:monthly": "plan_A", ... } */
function parsePlanIds(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (value ?? "").split(",")) {
    const [key, id] = pair.split("=").map((s) => s.trim());
    if (key && id) out[key] = id;
  }
  return out;
}

const OTP_PROVIDERS = ["whatsapp", "msg91", "2factor"] as const;
type OtpProvider = (typeof OTP_PROVIDERS)[number];

/** OTP_PROVIDER="whatsapp,2factor": which providers send sign-in codes, and in what order. */
function otpConfig(env: NodeJS.ProcessEnv): Config["otp"] {
  const providers = (env.OTP_PROVIDER ?? "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p && p !== "console");
  for (const p of providers) {
    if (!(OTP_PROVIDERS as readonly string[]).includes(p)) throw new Error(`OTP_PROVIDER: "${p}" isn't known. Use whatsapp, msg91 or 2factor.`);
  }
  const whatsapp =
    env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
      ? {
          token: env.WHATSAPP_TOKEN,
          phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
          template: env.WHATSAPP_OTP_TEMPLATE || "sign_in_code",
          language: env.WHATSAPP_OTP_LANGUAGE || "en",
        }
      : null;
  const msg91 = env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID ? { authKey: env.MSG91_AUTH_KEY, templateId: env.MSG91_OTP_TEMPLATE_ID } : null;
  // Fail at start-up rather than silently not sending codes.
  if (providers.includes("whatsapp") && !whatsapp) throw new Error("OTP_PROVIDER=whatsapp needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID");
  if (providers.includes("msg91") && !msg91) throw new Error("OTP_PROVIDER=msg91 needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID");
  const twoFactor = env.TWOFACTOR_API_KEY ? { apiKey: env.TWOFACTOR_API_KEY, template: env.TWOFACTOR_OTP_TEMPLATE || null } : null;
  if (providers.includes("2factor") && !twoFactor) throw new Error("OTP_PROVIDER=2factor needs TWOFACTOR_API_KEY");
  return { providers: [...new Set(providers)] as OtpProvider[], whatsapp, msg91, twoFactor };
}

/**
 * TRUST_PROXY: "1" (hops, the default), "2", "true", "false", or a comma list of proxy
 * addresses/CIDRs such as "10.0.0.0/8,172.16.0.0/12".
 */
export function parseTrustProxy(value: string | undefined): Config["trustProxy"] {
  const v = (value ?? "").trim();
  if (!v) return 1;
  if (v.toLowerCase() === "true") return true;
  if (v.toLowerCase() === "false") return false;
  if (/^\d+$/.test(v)) return Number(v);
  const list = v.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 1 ? list[0]! : list;
}

/**
 * What Fastify needs. A hop count becomes a function that trusts the nearest `hops`
 * addresses (the proxy that connected, and any before it): Fastify 5.12+ treats a bare
 * number as "trust nothing", which would give every caller the proxy's own IP address.
 */
export function fastifyTrustProxy(value: Config["trustProxy"]): boolean | string | string[] | ((address: string, hop: number) => boolean) {
  if (typeof value !== "number") return value;
  const hops = value;
  return (_address, hop) => hop < hops;
}

/** A whole number from the environment, or the fallback when it's unset or not a number. */
function count(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** PUSH_VAPID_SUBJECT, else the web app's address, else a placeholder that still validates. */
function pushSubject(env: NodeJS.ProcessEnv): string {
  if (env.PUSH_VAPID_SUBJECT) return env.PUSH_VAPID_SUBJECT;
  const web = (env.CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).find((o) => o.startsWith("https://"));
  return web ?? "mailto:alerts@wedding-yantra.invalid";
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** WEB_APP_URL as a bare origin. Must be https in production, unless it's this computer. */
function webAppUrl(value: string | undefined, production: boolean): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`WEB_APP_URL "${raw}" isn't a web address. Use something like https://app.weddingyantra.com`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("WEB_APP_URL must start with https://");
  if (production && url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error("WEB_APP_URL must start with https:// in production");
  }
  if (url.pathname.replace(/\/+$/, "") !== "" || url.search || url.hash) {
    throw new Error("WEB_APP_URL is only the address of the web app, like https://app.weddingyantra.com (no path)");
  }
  return url.origin;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** META_ENABLED_FOR: "all" (the default) or business ids separated by commas. */
function metaEnabledFor(value: string | undefined): "all" | Set<string> {
  const v = (value ?? "").trim();
  if (!v || v.toLowerCase() === "all") return "all";
  const ids = v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = ids.find((id) => !UUID.test(id));
  if (bad) throw new Error(`META_ENABLED_FOR: "${bad}" isn't a business id. Use all, or business ids separated by commas.`);
  return new Set(ids);
}

/** Stand-ins for META_FAKE=true without real keys, so local runs work out of the box. */
const META_FAKE_DEFAULTS = {
  appId: "fake-app",
  appSecret: "fake-app-secret",
  verifyToken: "fake-verify-token",
  webAppUrl: "http://localhost:3000",
};

/**
 * Facebook & Instagram lead ads. Off (null) unless META_APP_ID is set or META_FAKE=true.
 * With META_APP_ID, everything it needs must be there too: fail at start-up, not at the
 * first lead.
 */
function metaConfig(env: NodeJS.ProcessEnv, production: boolean, web: string | null): { meta: MetaConfig | null; webAppUrl: string | null } {
  const fake = env.META_FAKE === "true";
  if (fake && production) throw new Error("META_FAKE=true is only for development and tests. Remove it on the server.");
  const appId = env.META_APP_ID?.trim();
  if (!appId && !fake) return { meta: null, webAppUrl: web };

  if (appId) {
    const missing = ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_TOKEN_KEY", "WEB_APP_URL"].filter((k) => !env[k]?.trim());
    if (production && !env.META_LOGIN_CONFIG_ID?.trim()) missing.push("META_LOGIN_CONFIG_ID");
    if (missing.length) throw new Error(`META_APP_ID is set, so these are needed too: ${missing.join(", ")}`);
  }

  const keyText = env.META_TOKEN_KEY?.trim();
  let tokenKey: Buffer;
  if (keyText) {
    tokenKey = /^[A-Za-z0-9+/_-]+={0,2}$/.test(keyText) ? Buffer.from(keyText, "base64") : Buffer.alloc(0);
    if (tokenKey.length !== 32) throw new Error("META_TOKEN_KEY must be 32 random bytes in base64. Make one with: openssl rand -base64 32");
  } else {
    // Only reachable with META_FAKE: a fixed key, so sealed tokens survive restarts on this computer.
    tokenKey = createHash("sha256").update("wedding-yantra-meta-fake-token-key").digest();
  }

  const graphVersion = env.META_GRAPH_VERSION?.trim() || "v26.0";
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error(`META_GRAPH_VERSION "${graphVersion}" should look like v26.0`);

  const webApp = web ?? META_FAKE_DEFAULTS.webAppUrl;
  return {
    webAppUrl: webApp,
    meta: {
      appId: appId || META_FAKE_DEFAULTS.appId,
      appSecret: env.META_APP_SECRET?.trim() || META_FAKE_DEFAULTS.appSecret,
      verifyToken: env.META_VERIFY_TOKEN?.trim() || META_FAKE_DEFAULTS.verifyToken,
      tokenKey,
      loginConfigId: env.META_LOGIN_CONFIG_ID?.trim() || null,
      graphVersion,
      redirectUri: `${webApp}/connect/meta`,
      pollMinutes: Math.max(1, count(env.META_POLL_MINUTES, 30)),
      enabledFor: metaEnabledFor(env.META_ENABLED_FOR),
      fake,
    },
  };
}

/**
 * AUTH_REVIEW_PHONE, AUTH_REVIEW_CODE and AUTH_REVIEW_UNTIL: all three or none. A date-only
 * UNTIL lasts to the end of that day in India.
 */
function reviewLogin(env: NodeJS.ProcessEnv, now: Date): ReviewLogin | null {
  const phone = env.AUTH_REVIEW_PHONE?.trim();
  const code = env.AUTH_REVIEW_CODE?.trim();
  const until = env.AUTH_REVIEW_UNTIL?.trim();
  const given = [phone, code, until].filter(Boolean).length;
  if (given === 0) return null;
  if (given < 3) throw new Error("AUTH_REVIEW_PHONE, AUTH_REVIEW_CODE and AUTH_REVIEW_UNTIL go together: set all three, or none.");
  const normalized = normalizePhone(phone!);
  if (!normalized) throw new Error("AUTH_REVIEW_PHONE isn't a valid mobile number");
  if (!/^\d{6}$/.test(code!)) throw new Error("AUTH_REVIEW_CODE must be 6 digits");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(until!) ? new Date(`${until}T23:59:59.999+05:30`) : new Date(until!);
  if (Number.isNaN(date.getTime())) throw new Error(`AUTH_REVIEW_UNTIL "${until}" isn't a date. Use something like 2026-12-31`);
  // Past its date the review sign-in is simply off: a restart after the review must not stop the API.
  if (date.getTime() <= now.getTime()) {
    console.warn("AUTH_REVIEW_UNTIL has passed, so the review sign-in is off. Remove the AUTH_REVIEW_* settings.");
    return null;
  }
  return { phone: normalized, code: code!, until: date };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const nodeEnv = env.NODE_ENV ?? "development";
  const production = nodeEnv === "production";
  const meta = metaConfig(env, production, webAppUrl(env.WEB_APP_URL, production));

  return {
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? "0.0.0.0",
    nodeEnv,
    appVersion: env.APP_VERSION ?? "dev",
    databaseUrl,
    logLevel: env.LOG_LEVEL ?? "info",
    corsOrigins: new Set(
      (env.CORS_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((o) => o.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
    corsPreviewPattern: env.CORS_VERCEL_PREVIEW_PATTERN ? new RegExp(env.CORS_VERCEL_PREVIEW_PATTERN) : null,
    otpDevEcho: env.AUTH_OTP_DEV_ECHO === "true",
    otpMaxPerIp: Number(env.AUTH_OTP_MAX_PER_IP ?? 20),
    otpMaxPerPhoneDay: count(env.AUTH_OTP_MAX_PER_PHONE_DAY, 10),
    otpMaxGlobalDay: count(env.AUTH_OTP_MAX_GLOBAL_DAY, 2000),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    rateLimit: {
      // Tests make hundreds of calls from one address, so the limiter is off there unless asked for.
      enabled: env.RATE_LIMIT_ENABLED ? env.RATE_LIMIT_ENABLED === "true" : (env.NODE_ENV ?? "development") !== "test",
      authPerMinute: count(env.RATE_LIMIT_AUTH_PER_MIN, 20),
      publicPerMinute: count(env.RATE_LIMIT_PUBLIC_PER_MIN, 60),
      publicPostPerMinute: count(env.RATE_LIMIT_PUBLIC_POST_PER_MIN, 10),
    },
    otp: otpConfig(env),
    pushSubject: pushSubject(env),
    uploadsDir: env.UPLOADS_DIR ?? "uploads",
    // FILES_SECRET is optional: by default it's derived from the database password, which
    // is already secret and stable across restarts.
    filesSecret: createHash("sha256")
      .update(env.FILES_SECRET ?? `wedding-yantra-files:${databaseUrl}`)
      .digest(),
    billing: {
      enforced: env.BILLING_ENFORCED === "true",
      razorpay:
        env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET
          ? {
              keyId: env.RAZORPAY_KEY_ID,
              keySecret: env.RAZORPAY_KEY_SECRET,
              webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
              plans: parsePlanIds(env.RAZORPAY_PLANS),
            }
          : null,
      // Too short to be safe is the same as not set.
      adminToken: env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 32 ? env.ADMIN_TOKEN : null,
    },
    webAppUrl: meta.webAppUrl,
    meta: meta.meta,
    reviewLogin: reviewLogin(env, new Date()),
    incoming: { autoDrain: nodeEnv !== "test" },
  };
}
