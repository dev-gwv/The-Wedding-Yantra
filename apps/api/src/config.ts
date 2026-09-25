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
  };
}
