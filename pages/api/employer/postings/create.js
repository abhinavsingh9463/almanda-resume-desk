// POST { title?, rawDescription } -> creates a job posting for the
// caller's organization and parses it into requirements, reusing the
// exact same deterministic classifier as the candidate side (Phase 3's
// lib/parsing/jobParser.js) — mandatory/preferred classification must
// never be able to silently diverge between what a candidate sees on
// Compare Jobs and what a recruiter's screening uses.

import { requireEmployerSession } from "../../../../lib/auth/employerSession.js";
import { query } from "../../../../lib/db/client.js";
import { parseJobDescription } from "../../../../lib/parsing/jobParser.js";
import { logAudit } from "../../../../lib/audit/auditLog.js";

const MAX_DESCRIPTION_LENGTH = 20000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  const session = await requireEmployerSession(req, res);
  if (!session) return;

  const { title, rawDescription } = req.body || {};
  if (!rawDescription || typeof rawDescription !== "string") {
    return res.status(400).json({ error: "rawDescription is required" });
  }
  if (rawDescription.length > MAX_DESCRIPTION_LENGTH) {
    return res.status(400).json({ error: `Job description is too long (max ${MAX_DESCRIPTION_LENGTH} characters).` });
  }

  try {
    const { title: parsedTitle, requirements } = await parseJobDescription(rawDescription);

    const postingRow = await query(
      "insert into job_postings (organization_id, created_by, title, raw_description) values ($1,$2,$3,$4) returning id, created_at",
      [session.organizationId, session.userId, title || parsedTitle, rawDescription]
    );
    const postingId = postingRow.rows[0].id;

    await Promise.all(
      requirements.map((r) =>
        query(
          `insert into posting_requirements (job_posting_id, requirement_text, requirement_type, classification, parsed_value, classification_reason)
           values ($1,$2,$3,$4,$5,$6)`,
          [postingId, r.requirement_text, r.requirement_type, r.classification, JSON.stringify(r.parsed_value), r.classification_reason]
        )
      )
    );

    await logAudit({
      organizationId: session.organizationId,
      actorUserId: session.userId,
      action: "posting.created",
      targetType: "job_posting",
      targetId: postingId,
      details: { title: title || parsedTitle, requirement_count: requirements.length },
    });

    return res.status(200).json({ posting_id: postingId, title: title || parsedTitle, requirements });
  } catch (err) {
    console.error("[employer/postings/create] failed:", err.message || err);
    return res.status(500).json({
      error:
        err.message === "job_description_too_short"
          ? "That job description looks too short to analyze."
          : "Couldn't create that posting just now — please try again.",
    });
  }
}
