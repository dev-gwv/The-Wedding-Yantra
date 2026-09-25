import cors from "@fastify/cors";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { AppError, fail } from "./lib/http.js";
import { localFileStore } from "./lib/storage.js";
import { registerAuth } from "./modules/auth/guard.js";
import { createOtpSender, type OtpSender } from "./modules/auth/otp-sender.js";
import { authRoutes } from "./modules/auth/routes.js";
import { billingGuard, billingRoutes } from "./modules/billing/routes.js";
import { razorpayGateway, type PaymentGateway } from "./modules/billing/gateway.js";
import { businessTypeRoutes } from "./modules/business-types/routes.js";
import { fileRoutes } from "./modules/files/routes.js";
import { deliverableRoutes } from "./modules/deliverables/routes.js";
import { growRoutes } from "./modules/grow/routes.js";
import { vendorRoutes } from "./modules/vendors/routes.js";
import type { Files } from "./modules/files/service.js";
import { healthRoutes } from "./modules/health/routes.js";
import { moneyRoutes } from "./modules/money/routes.js";
import { reportRoutes } from "./modules/reports/routes.js";
import { reviewRoutes } from "./modules/review/routes.js";
import { bookingRoutes } from "./modules/bookings/routes.js";
import { salesRoutes } from "./modules/sales/routes.js";
import { taskRoutes } from "./modules/tasks/routes.js";
import { teamRoutes } from "./modules/team/routes.js";
import { workspaceRoutes } from "./modules/workspaces/routes.js";

export interface AppDeps {
  config: Config;
  db: Db;
  otpSender?: OtpSender;
  logger?: boolean;
  /** Uploaded files; tests pass a temporary folder */
  files?: Files;
  /** The payment provider; tests pass a fake. Defaults to Razorpay when its keys are set. */
  gateway?: PaymentGateway | null;
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

  const otpSender = deps.otpSender ?? createOtpSender(config, app.log);
  if (config.nodeEnv === "production" && config.otp.providers.length === 0 && !config.otpDevEcho) {
    app.log.warn("No OTP_PROVIDER is set: sign-in codes aren't delivered, so nobody can sign in.");
  }
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

  const files: Files = deps.files ?? { store: localFileStore(config.uploadsDir), secret: config.filesSecret };

  const gateway = deps.gateway !== undefined ? deps.gateway : config.billing.razorpay ? razorpayGateway(config.billing.razorpay) : null;

  registerAuth(app, db);
  healthRoutes(app, { db, config });

  await app.register(
    async (v1) => {
      // First, so it covers every route below.
      billingGuard(v1, { db, config });
      authRoutes(v1, { db, config, otpSender });
      businessTypeRoutes(v1, { db });
      workspaceRoutes(v1, { db, config });
      teamRoutes(v1, { db });
      salesRoutes(v1, { db });
      bookingRoutes(v1, { db });
      moneyRoutes(v1, { db, files });
      fileRoutes(v1, { db, files });
      reportRoutes(v1, { db });
      taskRoutes(v1, { db });
      reviewRoutes(v1, { db });
      growRoutes(v1, { db });
      deliverableRoutes(v1, { db });
      vendorRoutes(v1, { db });
      billingRoutes(v1, { db, config, gateway });
    },
    { prefix: "/api/v1" },
  );

  return app;
}
