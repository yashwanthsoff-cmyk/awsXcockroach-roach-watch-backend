import { readonlyPool } from "../db/readonlyPool.js";

/**
 * Runs cluster/table health checks through a dedicated SELECT-only
 * database role - not the admin user, not the MCP Admin key. This is
 * the genuinely least-privilege path for SQL-level introspection.
 */
export async function getRegions() {
  const result = await readonlyPool.query("SHOW REGIONS");
  return result.rows;
}

export async function getIncidentCount() {
  const result = await readonlyPool.query("SELECT count(*) AS total_incidents FROM incidents");
  return result.rows[0];
}
