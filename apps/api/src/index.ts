import cors from "@fastify/cors";
import Fastify, { type FastifyError } from "fastify";
import pg from "pg";
import {
  BOOKING_STATUSES,
  type ApiResponse,
  type Booking,
  type BookingStatus,
  type SystemHealth,
} from "@wedding-yantra/types";
import { runMigrations } from "./db/migrate.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV ?? "development";
const APP_VERSION = process.env.APP_VERSION ?? "dev";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
);
const previewPattern = process.env.CORS_VERCEL_PREVIEW_PATTERN
  ? new RegExp(process.env.CORS_VERCEL_PREVIEW_PATTERN)
  : null;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

// Return DATE columns as plain `YYYY-MM-DD` strings instead of local-TZ Date objects.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

interface BookingRow {
  id: string;
  client_name: string;
  event_date: string;
  venue: string;
  guest_count: number;
  status: BookingStatus;
  total_amount: string; // NUMERIC arrives as a string
  created_at: Date;
}

const toBooking = (row: BookingRow): Booking => ({
  id: row.id,
  clientName: row.client_name,
  eventDate: row.event_date,
  venue: row.venue,
  guestCount: row.guest_count,
  status: row.status,
  totalAmount: Number(row.total_amount),
  createdAt: row.created_at.toISOString(),
});

// Schema lives in apps/api/migrations (applied by runMigrations at startup).
async function seedDemoData(): Promise<void> {
  if (process.env.SEED_DEMO_DATA !== "true") return;

  const { rows } = await pool.query<{ count: string }>("SELECT count(*) FROM bookings");
  if (Number(rows[0]?.count ?? 0) > 0) return;

  await pool.query(`
    INSERT INTO bookings (client_name, event_date, venue, guest_count, status, total_amount) VALUES
      ('Sharma & Kapoor', CURRENT_DATE + 21, 'The Leela Palace, Udaipur', 320, 'confirmed', 1850000),
      ('Iyer & Menon',    CURRENT_DATE + 45, 'Taj Falaknuma, Hyderabad',  180, 'inquiry',    950000),
      ('Singh & Gill',    CURRENT_DATE + 9,  'ITC Grand Chola, Chennai',  450, 'confirmed', 2600000),
      ('Patel & Desai',   CURRENT_DATE - 14, 'Rambagh Palace, Jaipur',    260, 'completed', 1420000),
      ('Banerjee & Roy',  CURRENT_DATE + 70, 'Oberoi Grand, Kolkata',     140, 'cancelled',  600000)
  `);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const ok = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});

const fail = (code: string, message: string): ApiResponse<never> => ({
  success: false,
  error: { code, message },
  timestamp: new Date().toISOString(),
});

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  // Running behind the shared reverse proxy: trust X-Forwarded-* headers.
  trustProxy: true,
});

// Idle clients emit 'error' when Postgres restarts or drops the connection. Without a
// listener that is an unhandled 'error' event and kills the process; the pool discards
// the broken client and /api/health reports "degraded" until the DB is back.
pool.on("error", (err) => {
  app.log.error({ err }, "idle postgres client error");
});

await app.register(cors, {
  origin: (origin, cb) => {
    // Non-browser clients (curl, health checks, server-to-server) send no Origin.
    if (!origin) return cb(null, true);
    cb(null, allowedOrigins.has(origin) || (previewPattern?.test(origin) ?? false));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  maxAge: 86_400,
});

app.setErrorHandler((error: FastifyError, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500) request.log.error({ err: error }, "request failed");
  const message = statusCode >= 500 ? "Internal server error" : error.message;
  reply.status(statusCode).send(fail(error.code ?? "INTERNAL_ERROR", message));
});

app.setNotFoundHandler((request, reply) => {
  reply.status(404).send(fail("NOT_FOUND", `Route ${request.method} ${request.url} not found`));
});

app.get("/api/health", async (_request, reply) => {
  let dbStatus: SystemHealth["database"]["status"] = "down";
  let latencyMs: number | null = null;

  const started = performance.now();
  try {
    await pool.query("SELECT 1");
    latencyMs = Math.round((performance.now() - started) * 100) / 100;
    dbStatus = "up";
  } catch (err) {
    app.log.warn({ err }, "health check: database unreachable");
  }

  const health: SystemHealth = {
    status: dbStatus === "up" ? "ok" : "degraded",
    service: "wedding-yantra-api",
    version: APP_VERSION,
    environment: NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: { status: dbStatus, latencyMs },
  };

  // 503 lets the proxy / deploy script detect a degraded instance; the body stays useful.
  return reply.status(health.status === "ok" ? 200 : 503).send(ok(health));
});

interface BookingsQuery {
  status?: BookingStatus;
  limit?: number;
}

app.get<{ Querystring: BookingsQuery }>(
  "/api/bookings",
  {
    schema: {
      querystring: {
        type: "object",
        properties: {
          status: { type: "string", enum: [...BOOKING_STATUSES] },
          limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  async (request) => {
    const { status, limit = 50 } = request.query;
    const { rows } = await pool.query<BookingRow>(
      `SELECT id, client_name, event_date, venue, guest_count, status, total_amount, created_at
         FROM bookings
        WHERE ($1::text IS NULL OR status = $1)
        ORDER BY event_date ASC
        LIMIT $2`,
      [status ?? null, limit],
    );
    return ok(rows.map(toBooking));
  },
);

app.addHook("onClose", async () => {
  await pool.end();
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Only connectivity is retried; a failing migration aborts immediately.
async function waitForDatabase(attempts = 10, delayMs = 2_000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (i === attempts) throw err;
      app.log.warn({ err }, `database not ready (attempt ${i}/${attempts}), retrying`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, "error during shutdown");
    process.exit(1);
  }
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await waitForDatabase();
  await runMigrations(pool, app.log);
  await seedDemoData();
  await app.listen({ port: PORT, host: HOST });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  process.exit(1);
}
