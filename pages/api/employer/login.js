// POST { email, password } -> signs in an existing employer user.

import { query } from "../../../lib/db/client.js";
import { verifyPassword } from "../../../lib/auth/password.js";
import { createSession, issueSessionCookie } from "../../../lib/auth/employerSession.js";
import { rateLimit, clientIp } from "../../../lib/org/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!rateLimit(`login:${clientIp(req)}`, { max: 10, windowMs: 10 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many attempts — please try again in a few minutes." });
  }

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  try {
    const userRow = await query("select id, password_hash from users where email = $1", [String(email).toLowerCase()]);
    const user = userRow.rows[0];

    // Same error message whether the email exists or the password is
    // wrong, so login can't be used to enumerate registered accounts.
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const memberRow = await query(
      "select organization_id from organization_members where user_id = $1 order by created_at asc limit 1",
      [user.id]
    );
    if (!memberRow.rows[0]) {
      return res.status(403).json({ error: "This account isn't attached to an organization." });
    }

    const token = await createSession(user.id, memberRow.rows[0].organization_id);
    issueSessionCookie(res, token);

    return res.status(200).json({ organization_id: memberRow.rows[0].organization_id });
  } catch (err) {
    console.error("[employer/login] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't sign in just now — please try again." });
  }
}
