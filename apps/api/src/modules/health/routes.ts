import type { FastifyInstance } from "fastify";
import type { SystemHealth } from "@wedding-yantra/types";
import type { Config } from "../../config.js";
import type { Db } from "../../db.js";
import { ok } from "../../lib/http.js";

export function healthRoutes(app: FastifyInstance, deps: { db: Db; config: Config }) {
  const handler = async (_request: unknown, reply: import("fastify").FastifyReply) => {
    let dbStatus: SystemHealth["database"]["status"] = "down";
    let latencyMs: number | null = null;

    const started = performance.now();
    try {
      await deps.db.query("SELECT 1");
      latencyMs = Math.round((performance.now() - started) * 100) / 100;
      dbStatus = "up";
    } catch (err) {
      app.log.warn({ err }, "health check: database unreachable");
    }

    const health: SystemHealth = {
      status: dbStatus === "up" ? "ok" : "degraded",
      service: "wedding-yantra-api",
      version: deps.config.appVersion,
      environment: deps.config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: { status: dbStatus, latencyMs },
    };

    // 503 lets the proxy / deploy script detect a degraded instance; the body stays useful.
    return reply.status(health.status === "ok" ? 200 : 503).send(ok(health));
  };

  // /api/health is used by the Docker health check and the deploy script.
  app.get("/api/health", handler);
  app.get("/api/v1/health", handler);
}
