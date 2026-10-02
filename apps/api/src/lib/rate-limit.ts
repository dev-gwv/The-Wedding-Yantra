import type { FastifyInstance } from "fastify";
import { fail } from "./http.js";

/** One group of routes that shares a per-IP budget. A limit of 0 means no limit. */
export interface RateRule {
  name: string;
  limit: number;
  matches: (method: string, path: string) => boolean;
}

/**
 * A small fixed-window limiter kept in memory: each IP gets `limit` requests per window
 * for each group of routes. The API runs as one process on the VPS, so memory is enough;
 * a restart simply starts every count again.
 *
 * Over the limit: 429 in the usual error shape, with Retry-After in seconds. The first
 * matching rule wins, so list the narrowest rule first.
 */
export function registerRateLimit(
  app: FastifyInstance,
  options: { rules: RateRule[]; windowMs?: number; now?: () => number },
): void {
  const windowMs = options.windowMs ?? 60_000;
  const now = options.now ?? Date.now;
  const rules = options.rules.filter((r) => r.limit > 0);
  if (!rules.length) return;
  const hits = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = now() + windowMs;

  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const path = request.url.split("?", 1)[0]!;
    const rule = rules.find((r) => r.matches(request.method, path));
    if (!rule) return;

    const t = now();
    // Forget finished windows now and then, so the map can't grow without end.
    if (t >= nextSweep) {
      for (const [key, hit] of hits) if (hit.resetAt <= t) hits.delete(key);
      nextSweep = t + windowMs;
    }

    const key = `${rule.name}|${request.ip}`;
    let hit = hits.get(key);
    if (!hit || hit.resetAt <= t) {
      hit = { count: 0, resetAt: t + windowMs };
      hits.set(key, hit);
    }
    hit.count += 1;
    if (hit.count <= rule.limit) return;

    const retryAfter = Math.max(1, Math.ceil((hit.resetAt - t) / 1000));
    reply
      .code(429)
      .header("Retry-After", String(retryAfter))
      .send(fail("TOO_MANY_REQUESTS", "Too many requests. Please wait a minute and try again."));
    return reply;
  });
}
