// POST { rawText, fileName?, sourceFormat? } -> stores a structured
// candidate profile (Phase 1) and returns it, along with the deterministic
// template recommendation (Phase 2) computed on the same request so the
// candidate doesn't need a second round trip.

import { getOrCreateCandidateProfile } from "../../../lib/db/session.js";
import { query } from "../../../lib/db/client.js";
import { parseResume } from "../../../lib/parsing/resumeParser.js";
import { recommendTemplate } from "../../../lib/matching/templateEngine.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { rawText, fileName, sourceFormat } = req.body || {};
  if (!rawText || typeof rawText !== "string") {
    return res.status(400).json({ error: "rawText is required" });
  }

  try {
    const candidateProfile = await getOrCreateCandidateProfile(req, res);

    const resumeRow = await query(
      "insert into resumes (candidate_profile_id, file_name, raw_text, source_format) values ($1,$2,$3,$4) returning *",
      [candidateProfile.id, fileName || null, rawText, sourceFormat || null]
    );

    const { parsed, computed, parserVersion } = await parseResume(rawText);

    const versionRow = await query(
      "insert into resume_versions (resume_id, parsed_json, parser_version) values ($1,$2,$3) returning *",
      [resumeRow.rows[0].id, JSON.stringify({ parsed, computed }), parserVersion]
    );
    const resumeVersionId = versionRow.rows[0].id;

    await Promise.all([
      ...(parsed.experiences || []).map((e, i) =>
        query(
          `insert into experiences (resume_version_id, job_title, company, start_date, end_date, is_current, months_duration, description, evidence_text, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [resumeVersionId, e.job_title, e.company, dateOrNull(e.startPoint), dateOrNull(e.endPoint), !!e.is_current, null, e.description, e.evidence, i]
        )
      ),
      ...(parsed.educations || []).map((e, i) =>
        query(
          `insert into educations (resume_version_id, degree, field_of_study, institution, graduation_year, evidence_text, sort_order) values ($1,$2,$3,$4,$5,$6,$7)`,
          [resumeVersionId, e.degree, e.field_of_study, e.institution, e.graduation_year, e.evidence, i]
        )
      ),
      ...(parsed.skills || []).map((s) =>
        query(
          `insert into skills (resume_version_id, name, category, proficiency, evidence_text) values ($1,$2,$3,$4,$5)`,
          [resumeVersionId, s.name, s.category, s.proficiency, s.evidence]
        )
      ),
      ...(parsed.certifications || []).map((c) =>
        query(
          `insert into certifications (resume_version_id, name, issuer, year_obtained, evidence_text) values ($1,$2,$3,$4,$5)`,
          [resumeVersionId, c.name, c.issuer, c.year_obtained, c.evidence]
        )
      ),
      ...(parsed.projects || []).map((p) =>
        query(
          `insert into projects (resume_version_id, name, description, evidence_text) values ($1,$2,$3,$4)`,
          [resumeVersionId, p.name, p.description, p.evidence]
        )
      ),
      ...(parsed.achievements || []).map((a) =>
        query(
          `insert into achievements (resume_version_id, description, is_quantified, evidence_text) values ($1,$2,$3,$4)`,
          [resumeVersionId, a.description, !!a.is_quantified, a.evidence]
        )
      ),
    ]);

    const recommendation = recommendTemplate({
      ...computed,
      certification_count: (parsed.certifications || []).length,
    });

    await query(
      `insert into template_recommendations (resume_version_id, template_id, reasons, sections_emphasized, sections_reduced, recommended_page_length)
       select $1, id, $2, $3, $4, $5 from templates where slug = $6`,
      [
        resumeVersionId,
        JSON.stringify(recommendation.reasons),
        JSON.stringify(recommendation.sections_emphasized),
        JSON.stringify(recommendation.sections_reduced),
        recommendation.recommended_page_length,
        recommendation.recommended_template,
      ]
    ).catch(() => {
      // Non-fatal: templates table may not be seeded yet in a fresh DB.
      // The recommendation is still returned to the client below.
    });

    return res.status(200).json({
      resume_version_id: resumeVersionId,
      profile: { parsed, computed },
      template_recommendation: recommendation,
    });
  } catch (err) {
    console.error("[parse-resume] failed:", err.message || err);
    return res.status(500).json({
      error: err.message === "resume_text_too_short"
        ? "That resume looks too short to parse — please check the upload."
        : "Couldn't parse that resume just now — please try again.",
    });
  }
}

function dateOrNull(point) {
  if (!point) return null;
  return `${point.year}-${String(point.month + 1).padStart(2, "0")}-01`;
}
