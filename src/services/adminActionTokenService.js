import crypto from "crypto";
import { getPool } from "../db/pool.js";

const TOKEN_DURATION_MS = 5 * 60 * 1000; // 5 minutes, single use

export async function issueAdminActionToken(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_DURATION_MS);
  await getPool().query(
    `INSERT INTO admin_action_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

export async function consumeAdminActionToken(token) {
  const result = await getPool().query(
    `SELECT t.token, t.used, t.expires_at, u.id, u.email, u.role
     FROM admin_action_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token = $1`,
    [token]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Invalid admin action token");
  if (row.used) throw new Error("This admin action token has already been used");
  if (new Date(row.expires_at) < new Date()) throw new Error("Admin action token has expired");

  await getPool().query(`UPDATE admin_action_tokens SET used = true WHERE token = $1`, [token]);

  return { id: row.id, email: row.email, role: row.role };
}
