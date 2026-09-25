import pg from "pg";

// Return DATE columns as plain `YYYY-MM-DD` strings instead of local-TZ Date objects.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

export type Db = pg.Pool;

export function createPool(connectionString: string): Db {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/** Runs `fn` inside a transaction and commits, or rolls back if it throws. */
export async function withTransaction<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Anything with a `query` method: the pool or a client inside a transaction. */
export type Queryable = Pick<pg.Pool, "query">;
