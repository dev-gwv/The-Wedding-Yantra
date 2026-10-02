import { createHash } from "node:crypto";

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  return {
    port: Number(env.PORT ?? 4000),
    host: env.HOST ?? "0.0.0.0",
    nodeEnv: env.NODE_ENV ?? "development",
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
  };
}
