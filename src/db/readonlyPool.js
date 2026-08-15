import pg from "pg";
const { Pool } = pg;

// Separate, least-privilege connection - SELECT-only role, no admin
// credentials, used exclusively for cluster health/SQL introspection.
export const readonlyPool = new Pool({
  connectionString: process.env.COCKROACHDB_READONLY_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

readonlyPool.on("error", (err) => {
  console.error("Unexpected readonly pool error:", err.message);
});
