import type { FastifyInstance } from "fastify";
import { otpRequestInput, otpVerifyInput, updateMeInput } from "@wedding-yantra/types";
import type { Config } from "../../config.js";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireUser } from "./guard.js";
import type { OtpSender } from "./otp-sender.js";
import * as auth from "./service.js";

export function authRoutes(app: FastifyInstance, deps: { db: Db; config: Config; otpSender: OtpSender }) {
  const { db, config, otpSender } = deps;
  if (config.reviewLogin && config.nodeEnv === "production") {
    app.log.warn(
      `AUTH_REVIEW_PHONE is on: one number signs in with a fixed code until ${config.reviewLogin.until.toISOString()}. Remove the AUTH_REVIEW_* settings once Meta's review is done.`,
    );
  }

  app.post("/auth/otp/request", async (request) => {
    const { phone } = parse(otpRequestInput, request.body);
    return ok(
      await auth.requestOtp(db, otpSender, {
        phone,
        ip: request.ip,
        echo: config.otpDevEcho,
        maxPerIp: config.otpMaxPerIp,
        maxPerPhoneDay: config.otpMaxPerPhoneDay,
        maxGlobalDay: config.otpMaxGlobalDay,
        production: config.nodeEnv === "production",
        review: config.reviewLogin,
        log: request.log,
      }),
    );
  });

  app.post("/auth/otp/verify", async (request) => {
    const input = parse(otpVerifyInput, request.body);
    return ok(
      await auth.verifyOtp(db, { ...input, userAgent: request.headers["user-agent"] ?? null, review: config.reviewLogin, log: request.log }),
    );
  });

  app.get("/auth/me", async (request) => {
    const { userId } = requireUser(request);
    return ok(await auth.getMe(db, userId));
  });

  app.patch("/auth/me", async (request) => {
    const { userId } = requireUser(request);
    return ok(await auth.updateMe(db, userId, parse(updateMeInput, request.body)));
  });

  app.post("/auth/logout", async (request) => {
    const { sessionId } = requireUser(request);
    await auth.logout(db, sessionId);
    return ok({ loggedOut: true as const });
  });
}
