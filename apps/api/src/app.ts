import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { AppError, fail } from "./lib/http.js";
import { registerAuth } from "./modules/auth/guard.js";
import { createConsoleOtpSender, type OtpSender } from "./modules/auth/otp-sender.js";
import { authRoutes } from "./modules/auth/routes.js";
import { businessTypeRoutes } from "./modules/business-types/routes.js";
import { healthRoutes } from "./modules/health/routes.js";
import { moneyRoutes } from "./modules/money/routes.js";
import { bookingRoutes } from "./modules/bookings/routes.js";
import { salesRoutes } from "./modules/sales/routes.js";
import { teamRoutes } from "./modules/team/routes.js";
import { workspaceRoutes } from "./modules/workspaces/routes.js";

export interface AppDeps {
  config: Config;
  db: Db;
  otpSender?: OtpSender;
  logger?: boolean;
}

/**
 * Builds the HTTP app without starting it, so tests can call it directly.
 * Every product route lives under /api/v1 so installed mobile apps keep working
 * while newer versions of the API are released.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const app = Fastify({
    logger: deps.logger === false ? false : { level: config.logLevel },
    // Running behind the shared reverse proxy: trust X-Forwarded-* headers.
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  const otpSender =
    deps.otpSender ??
    createConsoleOtpSender(app.log, { revealCode: config.nodeEnv !== "production" || config.otpDevEcho });
  if (config.otpDevEcho && config.nodeEnv === "production") {
    app.log.warn("AUTH_OTP_DEV_ECHO is on: sign-in codes are returned in API responses. Turn it off before real customers use the app.");
  }

  await app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser clients (mobile apps, curl, health checks) send no Origin.
      if (!origin) return cb(null, true);
      cb(null, config.corsOrigins.has(origin) || (config.corsPreviewPattern?.test(origin) ?? false));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    maxAge: 86_400,
  });

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(fail(error.code, error.message, error.fields));
    }
    // Two people changing the same thing at once.
    if ((error as { code?: string }).code === "23505") {
      return reply.status(409).send(fail("CONFLICT", "This was just changed by someone else. Please try again."));
    }
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) request.log.error({ err: error }, "request failed");
    const message = statusCode >= 500 ? "Something went wrong on our side. Please try again." : error.message;
    return reply.status(statusCode).send(fail(error.code ?? "INTERNAL_ERROR", message));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(fail("NOT_FOUND", `Route ${request.method} ${request.url} not found`));
  });

  registerAuth(app, db);
  healthRoutes(app, { db, config });

  await app.register(
    async (v1) => {
      authRoutes(v1, { db, config, otpSender });
      businessTypeRoutes(v1, { db });
      workspaceRoutes(v1, { db });
      teamRoutes(v1, { db });
      salesRoutes(v1, { db });
      bookingRoutes(v1, { db });
      moneyRoutes(v1, { db });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
