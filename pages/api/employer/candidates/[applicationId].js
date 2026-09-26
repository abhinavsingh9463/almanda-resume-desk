// GET -> full evidence-based view of one candidate (Phase 9): parsed
// profile with evidence_text per fact, requirement-by-requirement
// results, and override history — everything a recruiter needs to
// verify a decision without leaving the evidence trail.

import { requireEmployerSession } from "../../../../lib/auth/employerSession.js";
import { query } from "../../../../lib/db/client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  const { applicationId } = req.query;

  try {
    const appRow = await query(
      `select a.id, a.candidate_file_name, a.parsed_json, a.created_at, a.job_posting_id
       from applications a
       where a.id = $1 and a.organization_id = $2`,
      [applicationId, session.organizationId]
    );
    if (!appRow.rows[0]) return res.status(404).json({ error: "Candidate not found." });

    const srRow = await query(
      `select eligibility, mandatory_passed, mandatory_total, preferred_passed, preferred_total, requirement_results, missing_mandatory
       from screening_results where application_id = $1 order by created_at desc limit 1`,
      [applicationId]
    );

    const overrides = await query(
      `select ro.id, ro.override_status, ro.reason, ro.created_at, u.email as overridden_by_email
       from recruiter_overrides ro join users u on u.id = ro.overridden_by
       where ro.application_id = $1 order by ro.created_at desc`,
      [applicationId]
    );

    return res.status(200).json({
      application_id: appRow.rows[0].id,
      file_name: appRow.rows[0].candidate_file_name,
      profile: appRow.rows[0].parsed_json,
      screening: srRow.rows[0] || null,
      overrides: overrides.rows,
    });
  } catch (err) {
    console.error("[employer/candidate-detail] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't load that candidate just now." });
  }
}
