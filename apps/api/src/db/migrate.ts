import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

/**
 * Minimal SQL migration runner.
 *
 * - Files live in `apps/api/migrations/` and are named `NNNN_description.sql`.
 * - Each pending file runs once, in order, inside its own transaction, and is
 *   recorded in `schema_migrations`. A failing file is rolled back and aborts startup.
 * - A Postgres advisory lock makes concurrent starts safe.
 *
 * Works from both `src/db` (tsx) and `dist/db` (compiled): both are two levels below the package.
 */
const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
const FILE_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const LOCK_ID = 7_310_642; // arbitrary, unique to this app

interface Logger {
  info: (msg: string) => void;
}

export async function runMigrations(pool: pg.Pool, log: Logger): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  const badNames = entries.filter((f) => f.endsWith(".sql") && !FILE_PATTERN.test(f));
  if (badNames.length > 0) {
    throw new Error(
      `Invalid migration file name(s): ${badNames.join(", ")}. Expected NNNN_lowercase_words.sql`,
    );
  }
  const files = entries.filter((f) => FILE_PATTERN.test(f)).sort();

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed and was rolled back: ${(err as Error).message}`);
      }
      applied.push(file);
      log.info(`applied migration ${file}`);
    }
    if (applied.length === 0) log.info(`database schema up to date (${files.length} migrations)`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => undefined);
    client.release();
  }
  return applied;
}
