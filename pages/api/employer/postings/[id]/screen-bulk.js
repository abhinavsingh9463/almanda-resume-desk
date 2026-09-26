// POST { resumes: [{fileName, rawText}] } -> parses + screens each
// resume against this posting's requirements (Phase 8) and stores an
// `applications` + `screening_results` row per resume. Files are
// converted to plain text client-side first (same pdf/docx/txt pipeline
// already used on the candidate side, see pages/index.js) — this route
// never parses a raw file itself.

import { requireEmployerSession } from "../../../../../lib/auth/employerSession.js";
import { query } from "../../../../../lib/db/client.js";
import { screenBatch } from "../../../../../lib/screening/bulkScreen.js";
import { logAudit } from "../../../../../lib/audit/auditLog.js";

const MAX_BATCH_SIZE = 25;

export const config = { api: { bodyParser: { sizeLimit: "15mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  const { id: postingId } = req.query;
  const { resumes } = req.body || {};
  if (!Array.isArray(resumes) || resumes.length === 0) {
    return res.status(400).json({ error: "resumes must be a non-empty array of {fileName, rawText}." });
  }
  if (resumes.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ error: `Please upload at most ${MAX_BATCH_SIZE} resumes at a time.` });
  }

  try {
    // Org isolation: only ever operate on a posting owned by the caller's org.
    const postingRow = await query(
      "select id from job_postings where id = $1 and organization_id = $2",
      [postingId, session.organizationId]
    );
    if (!postingRow.rows[0]) return res.status(404).json({ error: "Posting not found." });

    const reqRows = await query(
      "select requirement_text, requirement_type, classification, parsed_value from posting_requirements where job_posting_id = $1",
      [postingId]
    );

    const results = await screenBatch(resumes, reqRows.rows);

    const saved = [];
    for (const r of results) {
      if (r.status !== "ok") {
        saved.push({ file_name: r.fileName, status: "error", error: r.error });
        continue;
      }

      const appRow = await query(
        `insert into applications (job_posting_id, organization_id, candidate_file_name, raw_resume_text, parsed_json, parser_version, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [
          postingId,
          session.organizationId,
          r.fileName || null,
          r.rawText,
          JSON.stringify({ parsed: r.parsed, computed: r.computed }),
          r.parserVersion,
          session.userId,
        ]
      );
      const applicationId = appRow.rows[0].id;

      await query(
        `insert into screening_results (application_id, eligibility, mandatory_passed, mandatory_total, preferred_passed, preferred_total, requirement_results, missing_mandatory)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          applicationId,
          r.eligibility.eligibility,
          r.eligibility.mandatory_passed,
          r.eligibility.mandatory_total,
          r.eligibility.preferred_passed,
          r.eligibility.preferred_total,
          JSON.stringify(r.eligibility.requirement_results),
          JSON.stringify(r.eligibility.missing_mandatory),
        ]
      );

      saved.push({
        file_name: r.fileName,
        status: "ok",
        application_id: applicationId,
        eligibility: r.eligibility.eligibility,
        mandatory_passed: r.eligibility.mandatory_passed,
        mandatory_total: r.eligibility.mandatory_total,
      });
    }

    await logAudit({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "posting.bulk_screened",
      targetType: "job_posting",
      targetId: postingId,
      details: { batch_size: resumes.length, ok: saved.filter((s) => s.status === "ok").length },
    });

    return res.status(200).json({ results: saved });
  } catch (err) {
    console.error("[employer/screen-bulk] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't screen that batch just now — please try again." });
  }
}
