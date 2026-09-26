// POST { status, reason } -> records a recruiter override (Phase 9).
// Overrides never rewrite the original screening_results row — the
// deterministic result stays intact as the system-of-record, and the
// override is layered on top with who/why/when, so "the algorithm said
// X but a human overrode it to Y, because Z" is always reconstructable
// from the evidence dashboard and the audit log.

import { requireEmployerSession } from "../../../../../lib/auth/employerSession.js";
import { query } from "../../../../../lib/db/client.js";
import { logAudit } from "../../../../../lib/audit/auditLog.js";

const VALID_STATUSES = ["eligible", "not_eligible", "shortlist", "reject"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  const { applicationId } = req.query;
  const { status, reason } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "A reason is required for every override — it's shown in the audit log." });
  }

  try {
    const appRow = await query(
      "select id from applications where id = $1 and organization_id = $2",
      [applicationId, session.organizationId]
    );
    if (!appRow.rows[0]) return res.status(404).json({ error: "Candidate not found." });

    const saved = await query(
      `insert into recruiter_overrides (application_id, overridden_by, override_status, reason)
       values ($1,$2,$3,$4) returning id, created_at`,
      [applicationId, session.userId, status, reason.trim()]
    );

    await logAudit({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "application.overridden",
      targetType: "application",
      targetId: applicationId,
      details: { status, reason: reason.trim() },
    });

    return res.status(200).json({ override_id: saved.rows[0].id, created_at: saved.rows[0].created_at });
  } catch (err) {
    console.error("[employer/override] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't save that override just now." });
  }
}
