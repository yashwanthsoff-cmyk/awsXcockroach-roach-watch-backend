import bcrypt from "bcryptjs";
import { getPool } from "../db/pool.js";

/**
 * Re-verifies email + password fresh, regardless of any existing
 * session. Used as a step-up check before sensitive actions (like
 * rotating the API key) - even a logged-in admin must prove they still
 * know the password right now, not just that they logged in earlier.
 * Returns a short-lived, single-purpose "admin action token" on
 * success - separate from the normal long-lived session token.
 */
export async function verifyAdminCredentials({ email, password }) {
  const result = await getPool().query(
    `SELECT id, name, email, role, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  const user = result.rows[0];
  if (!user) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid email or password");

  if (user.role !== "admin") throw new Error("This account does not have admin access");

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
