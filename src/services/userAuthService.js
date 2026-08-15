import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getPool } from "../db/pool.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function initialsFor(name) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("") || "RW"
  );
}

export async function signUp({ name, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await getPool().query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     RETURNING id, name, email, role`,
    [name, email.toLowerCase().trim(), passwordHash]
  );
  const user = result.rows[0];

  const token = await createSession(user.id);
  return { user: { ...user, initials: initialsFor(user.name) }, token };
}

export async function logIn({ email, password }) {
  const result = await getPool().query(
    `SELECT id, name, email, role, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase().trim()]
  );
  const user = result.rows[0];
  if (!user) throw new Error("Invalid email or password");

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error("Invalid email or password");

  const token = await createSession(user.id);
  const { password_hash, ...safeUser } = user;
  return { user: { ...safeUser, initials: initialsFor(safeUser.name) }, token };
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await getPool().query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

export async function getUserFromSession(token) {
  const result = await getPool().query(
    `SELECT u.id, u.name, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
  const user = result.rows[0];
  if (!user) return null;
  return { ...user, initials: initialsFor(user.name) };
}

export async function logOut(token) {
  await getPool().query(`DELETE FROM sessions WHERE token = $1`, [token]);
}
