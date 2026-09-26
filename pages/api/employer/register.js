// POST { email, password, fullName?, organizationName } -> creates a new
// user and a new organization with that user as 'owner', signs them in,
// and returns the organization id. Phase 7. Employer accounts are
// entirely separate from candidate sessions (lib/db/session.js) — no
// data is shared between the two.

import crypto from "crypto";
import { query } from "../../../lib/db/client.js";
import { hashPassword } from "../../../lib/auth/password.js";
import { createSession, issueSessionCookie } from "../../../lib/auth/employerSession.js";
import { rateLimit, clientIp } from "../../../lib/org/rateLimit.js";
import { logAudit } from "../../../lib/audit/auditLog.js";

function slugify(name) {
  return (name || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "org";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!rateLimit(`register:${clientIp(req)}`, { max: 5, windowMs: 10 * 60 * 1000 })) {
    return res.status(429).json({ error: "Too many attempts — please try again in a few minutes." });
  }

  const { email, password, fullName, organizationName } = req.body || {};
  if (!email || !password || !organizationName) {
    return res.status(400).json({ error: "email, password, and organizationName are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "That doesn't look like a valid email address." });
  }
  if (password.length < 10) {
    return res.status(400).json({ error: "Password must be at least 10 characters." });
  }
  if (organizationName.length > 200) {
    return res.status(400).json({ error: "Organization name is too long." });
  }

  try {
    const existing = await query("select id from users where email = $1", [email.toLowerCase()]);
    if (existing.rows[0]) {
      return res.status(409).json({ error: "An account with that email already exists." });
    }

    const userRow = await query(
      "insert into users (email, password_hash, full_name) values ($1,$2,$3) returning id",
      [email.toLowerCase(), hashPassword(password), fullName || null]
    );
    const userId = userRow.rows[0].id;

    let slug = slugify(organizationName);
    const slugTaken = await query("select 1 from organizations where slug = $1", [slug]);
    if (slugTaken.rows[0]) slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;

    const orgRow = await query(
      "insert into organizations (name, slug, created_by) values ($1,$2,$3) returning id",
      [organizationName, slug, userId]
    );
    const organizationId = orgRow.rows[0].id;

    await query(
      "insert into organization_members (organization_id, user_id, role) values ($1,$2,'owner')",
      [organizationId, userId]
    );

    const token = await createSession(userId, organizationId);
    issueSessionCookie(res, token);

    await logAudit({
      organizationId,
      actorUserId: userId,
      action: "organization.created",
      targetType: "organization",
      targetId: organizationId,
    });

    return res.status(200).json({ organization_id: organizationId, role: "owner" });
  } catch (err) {
    console.error("[employer/register] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't create that account just now — please try again." });
  }
}
