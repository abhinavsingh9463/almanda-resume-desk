// Phase 9 — audit log helper.
//
// Every state-changing employer action (posting created, batch
// screened, candidate overridden) calls this so the org has a durable,
// queryable trail — the employer-side counterpart to the evidence_text
// traceability Phases 1-5 already give candidates. A logging failure
// must never block the action it's describing, so errors here are
// caught and swallowed (logged to the function's own console instead).

import { query } from "../db/client.js";

export async function logAudit({ organizationId, actorUserId, action, targetType, targetId, details }) {
  try {
    await query(
      `insert into audit_log (organization_id, actor_user_id, action, target_type, target_id, details)
       values ($1,$2,$3,$4,$5,$6)`,
      [organizationId, actorUserId || null, action, targetType || null, targetId || null, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error("[auditLog] failed to write audit entry (non-fatal):", err.message || err);
  }
}
