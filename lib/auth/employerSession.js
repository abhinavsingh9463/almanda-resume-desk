// Employer auth sessions (Phase 7).
//
// Deliberately separate from the candidate `almanda_session` cookie
// (lib/db/session.js) — different cookie name, different table, and
// unlike the anonymous candidate session, this one requires a real
// password login. Only a hash of the session token is stored in the DB
// (employer_sessions.session_token_hash), same reasoning as the password
// hash: a leaked DB row alone can't be replayed as a cookie.
//
// Role is re-read from organization_members on every request (joined in
// getEmployerSession) rather than cached in the token, so removing
// someone from an org — or changing their role — takes effect
// immediately without needing to revoke their session separately.

import crypto from "crypto";
import { query } from "../db/client.js";

const COOKIE_NAME = "almanda_employer_session";
const SESSION_MAX_AGE_DAYS = 7;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").map((c) => {
      const idx = c.indexOf("=");
      return [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1))];
    })
  );
}

export function issueSessionCookie(res, token) {
  const maxAge = SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; ${
      process.env.NODE_ENV === "production" ? "Secure;" : ""
    }`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;`);
}

/** Creates a new session row for (userId, organizationId) and returns the raw token to cookie. */
export async function createSession(userId, organizationId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  await query(
    `insert into employer_sessions (user_id, session_token_hash, organization_id, expires_at) values ($1,$2,$3,$4)`,
    [userId, hashToken(token), organizationId, expiresAt]
  );
  return token;
}

/** Deletes the DB session row matching the request's cookie, if any (used by logout). */
export async function revokeSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return;
  await query("delete from employer_sessions where session_token_hash = $1", [hashToken(token)]);
}

/**
 * Validates the employer session cookie and returns
 * {userId, organizationId, role, email} — or null if there's no valid,
 * unexpired session. Callers must treat null as unauthenticated; never
 * fall back to a default organization.
 */
export async function getEmployerSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;

  const result = await query(
    `select s.user_id, s.organization_id, s.expires_at, m.role, u.email
     from employer_sessions s
     join users u on u.id = s.user_id
     join organization_members m on m.organization_id = s.organization_id and m.user_id = s.user_id
     where s.session_token_hash = $1`,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  return { userId: row.user_id, organizationId: row.organization_id, role: row.role, email: row.email };
}

/**
 * Guard for API routes (Phase 10 org isolation): resolves the session
 * and writes a 401 response if absent. Returns null when unauthenticated
 * (caller must return immediately after), or the session object.
 */
export async function requireEmployerSession(req, res) {
  const session = await getEmployerSession(req);
  if (!session) {
    res.status(401).json({ error: "Not signed in." });
    return null;
  }
  return session;
}
