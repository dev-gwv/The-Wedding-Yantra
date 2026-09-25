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
