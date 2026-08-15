import pg from "pg";
const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.COCKROACHDB_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", (err) => {
      console.error("Unexpected CockroachDB pool error:", err.message);
    });
  }
  return pool;
}

/**
 * Forcibly tears down the current connection pool, simulating a lost
 * database connection. The next call to getPool() will transparently
 * build a brand new pool — this is the actual recovery mechanism being
 * demonstrated, not a mock.
 */
export async function forceDisconnect() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
