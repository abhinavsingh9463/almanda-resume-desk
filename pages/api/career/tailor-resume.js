// POST { resumeVersionId, jobId } -> generates a tailored resume version
// (Phase 6), using the template recommendation (Phase 2) and eligibility
// evidence (Phase 4) already computed and stored for this resume+job
// pair. Deterministic emphasis/reordering always happens; the AI-written
// summary is best-effort — if it fails, the tailored version is still
// returned and stored without a summary rather than failing the request.

import { getOrCreateCandidateProfile } from "../../../lib/db/session.js";
import { query } from "../../../lib/db/client.js";
import {
  selectEmphasis,
  generateTailoredSummary,
  renderPlainText,
  TAILOR_VERSION,
} from "../../../lib/tailoring/resumeTailor.js";

const DEFAULT_SECTION_ORDER = ["header", "summary", "experience", "skills", "education", "certifications"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { resumeVersionId, jobId } = req.body || {};
  if (!resumeVersionId || !jobId) {
    return res.status(400).json({ error: "resumeVersionId and jobId are required." });
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
    const profile = versionRow.rows[0].parsed_json; // {parsed, computed}

    const jobRow = await query(
      `select id, title from jobs where id = $1 and candidate_profile_id = $2`,
      [jobId, candidateProfile.id]
    );
    if (!jobRow.rows[0]) {
      return res.status(404).json({ error: "That job wasn't found for this session." });
    }
    const jobTitle = jobRow.rows[0].title;

    const matchRow = await query(
      `select requirement_results, missing_mandatory from job_matches
       where job_id = $1 and resume_version_id = $2
       order by created_at desc limit 1`,
      [jobId, resumeVersionId]
    );
    if (!matchRow.rows[0]) {
      return res.status(400).json({
        error: "Analyze this job against this resume first (Compare Jobs) before generating a tailored version.",
      });
    }
    const eligibilityResult = {
      requirement_results: matchRow.rows[0].requirement_results,
      missing_mandatory: matchRow.rows[0].missing_mandatory,
    };

    const templateRow = await query(
      `select t.slug, t.recommended_section_order from template_recommendations tr
       join templates t on t.id = tr.template_id
       where tr.resume_version_id = $1
       order by tr.created_at desc limit 1`,
      [resumeVersionId]
    );
    const sectionOrder = templateRow.rows[0] ? templateRow.rows[0].recommended_section_order : DEFAULT_SECTION_ORDER;
    const templateSlug = templateRow.rows[0] ? templateRow.rows[0].slug : "experience-led";

    const emphasis = selectEmphasis(profile, { section_order: sectionOrder }, eligibilityResult);

    const evidenceFacts = [
      ...emphasis.ranked_experiences.filter((e) => e._matched).map((e) => e.evidence).filter(Boolean),
      ...emphasis.ranked_achievements.filter((a) => a._matched).map((a) => a.evidence).filter(Boolean),
    ];

    let summary = null;
    try {
      summary = await generateTailoredSummary({ jobTitle, evidenceFacts });
    } catch (err) {
      console.error("[tailor-resume] summary generation failed, continuing without it:", err.message || err);
    }

    const fullText = renderPlainText({ profile, emphasis, summary });

    const saved = await query(
      `insert into tailored_resumes
         (candidate_profile_id, resume_version_id, job_id, template_slug, section_order, tailored_summary, emphasized_bullets, addressed_gaps, full_text, generator_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id, created_at`,
      [
        candidateProfile.id,
        resumeVersionId,
        jobId,
        templateSlug,
        JSON.stringify(sectionOrder),
        summary,
        JSON.stringify(evidenceFacts),
        JSON.stringify(emphasis.addressed_gaps),
        fullText,
        TAILOR_VERSION,
      ]
    );

    return res.status(200).json({
      tailored_resume_id: saved.rows[0].id,
      template_slug: templateSlug,
      section_order: sectionOrder,
      summary,
      full_text: fullText,
      addressed_gaps: emphasis.addressed_gaps,
      unaddressed_gaps: emphasis.unaddressed_gaps,
    });
  } catch (err) {
    console.error("[tailor-resume] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't generate a tailored resume just now — please try again." });
  }
}
