import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { runMigrations } from "./db/migrate.js";
import { cleanupAuth } from "./modules/auth/service.js";
import { runSchedule } from "./modules/notifications/scheduler.js";

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const pool = createPool(config.databaseUrl);
const app = await buildApp({ config, db: pool });

// Idle clients emit 'error' when Postgres restarts or drops the connection. Without a
// listener that is an unhandled 'error' event and kills the process; the pool discards
// the broken client and /api/health reports "degraded" until the DB is back.
pool.on("error", (err) => {
  app.log.error({ err }, "idle postgres client error");
});

const housekeeping = setInterval(
  () => void cleanupAuth(pool).catch((err) => app.log.warn({ err }, "auth cleanup failed")),
  60 * 60 * 1000,
);
housekeeping.unref();

// Reminders and round-ups every minute (each business in its own time zone), then push
// anything waiting. A slow run is never overlapped by the next.
let scheduling = false;
const scheduler = setInterval(() => {
  if (scheduling) return;
  scheduling = true;
  runSchedule(pool)
    .catch((err) => app.log.warn({ err }, "scheduled alerts failed"))
    .then(() => app.pusher.flush())
    .finally(() => {
      scheduling = false;
    });
}, 60 * 1000);
scheduler.unref();

app.addHook("onClose", async () => {
  clearInterval(housekeeping);
  clearInterval(scheduler);
  await pool.end();
});

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
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.fatal({ err }, "failed to start");
  process.exit(1);
}
