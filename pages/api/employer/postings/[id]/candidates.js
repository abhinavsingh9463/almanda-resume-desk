// GET ?eligibility=eligible|not_eligible|needs_review&q=<text> -> the
// evidence-based candidate list for this posting (Phase 9). Every row
// here is the same requirement_results already computed during Phase 8
// screening — this route only filters/sorts, it never re-scores.

import { requireEmployerSession } from "../../../../../lib/auth/employerSession.js";
import { query } from "../../../../../lib/db/client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  const { id: postingId, eligibility, q } = req.query;

  try {
    const postingRow = await query(
      "select id from job_postings where id = $1 and organization_id = $2",
      [postingId, session.organizationId]
    );
    if (!postingRow.rows[0]) return res.status(404).json({ error: "Posting not found." });

    const params = [postingId];
    let where = "a.job_posting_id = $1";
    if (eligibility) {
      params.push(eligibility);
      where += ` and sr.eligibility = $${params.length}`;
    }
    if (q) {
      // Coarse substring match on file name + the stringified parsed
      // profile — good enough for "find John's resume in this batch",
      // not a real search index.
      params.push(`%${q}%`);
      where += ` and (a.candidate_file_name ilike $${params.length} or a.parsed_json::text ilike $${params.length})`;
    }

    const rows = await query(
      `select a.id as application_id, a.candidate_file_name, a.created_at,
              sr.eligibility, sr.mandatory_passed, sr.mandatory_total, sr.preferred_passed, sr.preferred_total, sr.missing_mandatory,
              ro.override_status, ro.reason as override_reason
       from applications a
       join screening_results sr on sr.application_id = a.id
       left join lateral (
         select override_status, reason from recruiter_overrides
         where application_id = a.id order by created_at desc limit 1
       ) ro on true
       where ${where}
       order by sr.mandatory_passed desc, a.created_at desc`,
      params
    );

    return res.status(200).json({ candidates: rows.rows });
  } catch (err) {
    console.error("[employer/candidates] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't load candidates just now." });
  }
}
