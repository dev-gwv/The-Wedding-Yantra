import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPool, type Db } from "../src/db.js";
import { runMigrations } from "../src/db/migrate.js";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

/** A fresh, fully migrated database and an app instance. Wipes TEST_DATABASE_URL. */
export async function setup(): Promise<TestContext> {
  if (!TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a throwaway Postgres database");
  const db = createPool(TEST_DATABASE_URL);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations(db, { info: () => undefined });

  const config = loadConfig({
    DATABASE_URL: TEST_DATABASE_URL,
    NODE_ENV: "test",
    AUTH_OTP_DEV_ECHO: "true",
    LOG_LEVEL: "silent",
  });
  const app = await buildApp({ config, db, logger: false, otpSender: { send: async () => undefined } });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.end();
    },
  };
}

type Json = Record<string, unknown>;

export interface CallResult<T = Json> {
  status: number;
  body: { success: boolean; data: T; error: { code: string; message: string; fields?: Record<string, string> } };
}

export async function call<T = Json>(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  options: { token?: string; body?: unknown } = {},
): Promise<CallResult<T>> {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    headers: options.token ? { authorization: `Bearer ${options.token}` } : {},
    payload: options.body as Json | undefined,
  });
  return { status: res.statusCode, body: res.json() };
}

/** Signs a phone number in and returns its bearer token. */
export async function signIn(app: FastifyInstance, phone: string, name?: string): Promise<string> {
  const requested = await call<{ devCode: string }>(app, "POST", "/auth/otp/request", { body: { phone } });
  const code = requested.body.data.devCode;
  const verified = await call<{ token: string }>(app, "POST", "/auth/otp/verify", { body: { phone, code } });
  const token = verified.body.data.token;
  if (name) await call(app, "PATCH", "/auth/me", { token, body: { name } });
  return token;
}

export async function createBusiness(app: FastifyInstance, token: string, name = "Riya Makeup Studio") {
  const res = await call<{ id: string }>(app, "POST", "/workspaces", {
    token,
    body: { name, businessTypeId: "makeup_artist", city: "Jaipur" },
  });
  return res.body.data.id;
}
