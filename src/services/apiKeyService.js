import { getPool } from "../db/pool.js";
import crypto from "crypto";

let cache = { keys: null, expiresAt: 0 };
const CACHE_TTL_MS = 10000;

async function loadActiveKeys() {
  const result = await getPool().query(
    `SELECT key_value FROM api_keys WHERE active = true`
  );
  return new Set(result.rows.map((r) => r.key_value));
}

export async function isValidApiKey(candidate) {
  if (!candidate) return false;
  if (!cache.keys || Date.now() > cache.expiresAt) {
    cache.keys = await loadActiveKeys();
    cache.expiresAt = Date.now() + CACHE_TTL_MS;
  }
  return cache.keys.has(candidate);
}

export function invalidateApiKeyCache() {
  cache = { keys: null, expiresAt: 0 };
}

export async function rotateApiKey(label = "rotated") {
  const newKey = "rw_" + crypto.randomBytes(24).toString("hex");
  const pool = getPool();

  await pool.query(
    `UPDATE api_keys SET active = false, revoked_at = now() WHERE active = true`
  );
  await pool.query(
    `INSERT INTO api_keys (key_value, label) VALUES ($1, $2)`,
    [newKey, label]
  );

  invalidateApiKeyCache();
  return newKey;
}
