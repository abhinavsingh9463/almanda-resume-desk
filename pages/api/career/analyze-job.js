// POST { jobTitle?, rawDescription, resumeVersionId } ->
// parses the job description (Phase 3), runs the deterministic eligibility
// engine against the given resume version (Phase 4), and stores both so
// Compare Jobs (Phase 5) can read them back later without re-parsing.

import { getOrCreateCandidateProfile } from "../../../lib/db/session.js";
import { query } from "../../../lib/db/client.js";
import { parseJobDescription } from "../../../lib/parsing/jobParser.js";
import { computeEligibility } from "../../../lib/eligibility/eligibilityEngine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { jobTitle, rawDescription, resumeVersionId } = req.body || {};
  if (!rawDescription || typeof rawDescription !== "string") {
    return res.status(400).json({ error: "rawDescription is required" });
  }
  if (!resumeVersionId) {
    return res.status(400).json({ error: "resumeVersionId is required — parse a resume first." });
  }

  try {
    const candidateProfile = await getOrCreateCandidateProfile(req, res);

    const versionRow = await query(
      `select rv.parsed_json from resume_versions rv
       join resumes r on r.id = rv.resume_id
       where rv.id = $1 and r.candidate_profile_id = $2`,
      [resumeVersionId, candidateProfile.id]
    );
    if (!versionRow.rows[0]) {
      return res.status(404).json({ error: "That resume wasn't found for this session." });
    }
    const profile = versionRow.rows[0].parsed_json;

    const { title, requirements } = await parseJobDescription(rawDescription);

    const jobRow = await query(
      "insert into jobs (candidate_profile_id, title, raw_description) values ($1,$2,$3) returning *",
      [candidateProfile.id, jobTitle || title, rawDescription]
    );
    const jobId = jobRow.rows[0].id;

    await Promise.all(
      requirements.map((r) =>
        query(
          `insert into job_requirements (job_id, requirement_text, requirement_type, classification, parsed_value, classification_reason)
           values ($1,$2,$3,$4,$5,$6)`,
          [jobId, r.requirement_text, r.requirement_type, r.classification, JSON.stringify(r.parsed_value), r.classification_reason]
        )
      )
    );

    const eligibilityResult = computeEligibility(requirements, profile);

    await query(
      `insert into job_matches (job_id, resume_version_id, eligibility, mandatory_passed, mandatory_total, preferred_passed, preferred_total, requirement_results, missing_mandatory)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        jobId,
        resumeVersionId,
        eligibilityResult.eligibility,
        eligibilityResult.mandatory_passed,
        eligibilityResult.mandatory_total,
        eligibilityResult.preferred_passed,
        eligibilityResult.preferred_total,
        JSON.stringify(eligibilityResult.requirement_results),
        JSON.stringify(eligibilityResult.missing_mandatory),
      ]
    );

    return res.status(200).json({
      job_id: jobId,
      job_title: jobTitle || title,
      requirements,
      eligibility: eligibilityResult,
    });
  } catch (err) {
    console.error("[analyze-job] failed:", err.message || err);
    return res.status(500).json({
      error: err.message === "job_description_too_short"
        ? "That job description looks too short to analyze."
        : "Couldn't analyze that job just now — please try again.",
    });
  }
}
