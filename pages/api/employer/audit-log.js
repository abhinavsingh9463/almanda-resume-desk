// GET ?limit=50&before=<ISO timestamp> -> paginated audit log for the
// caller's organization (Phase 9). Every entry was written by
// logAudit() at the moment of the action — this route only reads, it
// never reconstructs history after the fact.

import { requireEmployerSession } from "../../../lib/auth/employerSession.js";
import { query } from "../../../lib/db/client.js";

const MAX_LIMIT = 200;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  const limit = Math.min(Number(req.query.limit) || 50, MAX_LIMIT);
  const before = req.query.before || null;

  try {
    const params = [session.organizationId];
    let where = "al.organization_id = $1";
    if (before) {
      params.push(before);
      where += ` and al.created_at < $${params.length}`;
    }
    const rows = await query(
      `select al.id, al.action, al.target_type, al.target_id, al.details, al.created_at, u.email as actor_email
       from audit_log al left join users u on u.id = al.actor_user_id
       where ${where}
       order by al.created_at desc
       limit ${limit}`,
      params
    );
    return res.status(200).json({ entries: rows.rows });
  } catch (err) {
    console.error("[employer/audit-log] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't load the audit log just now." });
  }
}
