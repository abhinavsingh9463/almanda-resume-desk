// Anonymous candidate sessions.
//
// Phases 1-5 are candidate-only and don't need login (Part 19 Phase 7 is
// where Employer auth is added). Instead, each browser gets a random,
// unguessable session id in an httpOnly cookie the first time it hits any
// /api/career/* route. That id is the only thing linking a candidate to
// their profile until real accounts exist.
//
// When Phase 7 adds accounts: candidate_profiles gets a user_id column,
// and on login we look up (or create) the profile by session_id and
// attach it to the new user_id. No data model change needed here.

import crypto from "crypto";
import { query } from "./client.js";

const COOKIE_NAME = "almanda_session";
const COOKIE_MAX_AGE_DAYS = 365;

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

/**
 * Ensures a session id exists (setting the cookie if needed) and returns
 * the corresponding candidate_profiles row, creating one if necessary.
 * Call this at the top of any /api/career/* handler.
 */
export async function getOrCreateCandidateProfile(req, res) {
  const cookies = parseCookies(req);
  let sessionId = cookies[COOKIE_NAME];

  if (!sessionId) {
    sessionId = crypto.randomBytes(24).toString("hex");
    const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
    res.setHeader(
      "Set-Cookie",
      `${COOKIE_NAME}=${sessionId}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; ${
        process.env.NODE_ENV === "production" ? "Secure;" : ""
      }`
    );
  }

  const existing = await query(
    "select * from candidate_profiles where session_id = $1",
    [sessionId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await query(
    "insert into candidate_profiles (session_id) values ($1) returning *",
    [sessionId]
  );
  return created.rows[0];
}
