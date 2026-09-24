// Phase 1 — Candidate Profile Intelligence.
//
// Hybrid by design (Part 14): the AI's only job is *extraction* — pulling
// out fields and, for every field, the exact sentence/phrase in the
// resume it came from (evidence_text). We never let the AI compute
// years-of-experience, page length, or any downstream decision; those
// are deterministic (see dateUtils.js and templateEngine.js).
//
// If the AI's JSON is malformed or missing required shape, this throws —
// callers must NOT silently fall back to guessed data (Part 8: never
// invent candidate data).

import { askClaudeForJson } from "../ai/claude.js";
import { parseResumeDate, totalExperienceMonths } from "./dateUtils.js";

export const PARSER_VERSION = "resume-parser-v1";

const EXTRACTION_SYSTEM_PROMPT = `You extract structured data from resumes. You must:
- Only extract information that is literally present in the resume text. Never invent, infer beyond what's stated, or fill gaps with plausible-sounding content.
- For every extracted field, include the exact quote/phrase from the resume it came from in an "evidence" field.
- Output ONLY a single JSON object, no prose, no markdown fences.
- Use this exact shape:
{
  "full_name": string|null,
  "email": string|null,
  "phone": string|null,
  "experiences": [{"job_title": string, "company": string, "start_date": string|null, "end_date": string|null, "is_current": boolean, "description": string, "evidence": string}],
  "educations": [{"degree": string, "field_of_study": string|null, "institution": string, "graduation_year": number|null, "evidence": string}],
  "skills": [{"name": string, "category": "technical"|"soft"|"language"|"tool", "proficiency": string|null, "evidence": string}],
  "certifications": [{"name": string, "issuer": string|null, "year_obtained": number|null, "evidence": string}],
  "projects": [{"name": string, "description": string, "evidence": string}],
  "achievements": [{"description": string, "is_quantified": boolean, "evidence": string}],
  "leadership": [{"description": string, "evidence": string}]
}
start_date/end_date should be copied as they literally appear (e.g. "Jan 2021", "2019", "Present") — do not reformat or calculate anything.`;

/**
 * Parses raw resume text into a structured profile.
 * Returns { parsed, parserVersion } where `parsed` matches the DB shape
 * (resume_versions.parsed_json) plus a deterministic `computed` block.
 */
export async function parseResume(rawText) {
  if (!rawText || rawText.trim().length < 40) {
    throw new Error("resume_text_too_short");
  }

  const extracted = await askClaudeForJson({
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: rawText.slice(0, 15000), // stay well under context/cost limits
    maxTokens: 3000,
  });

  // Defensive shape-check: fail closed rather than store a half-formed profile.
  for (const key of ["experiences", "educations", "skills"]) {
    if (!Array.isArray(extracted[key])) {
      throw new Error(`parser_missing_field:${key}`);
    }
  }

  // Deterministic pass: compute duration per role and total experience.
  const experiencesWithDuration = extracted.experiences.map((exp) => {
    const startPoint = parseResumeDate(exp.start_date);
    const endPoint = exp.is_current ? null : parseResumeDate(exp.end_date);
    return { ...exp, startPoint, endPoint };
  });

  const totalMonths = totalExperienceMonths(
    experiencesWithDuration
      .filter((e) => e.startPoint)
      .map((e) => ({ startPoint: e.startPoint, endPoint: e.endPoint }))
  );

  const computed = {
    total_experience_months: totalMonths,
    total_experience_years: Math.round((totalMonths / 12) * 10) / 10,
    position_count: extracted.experiences.length,
    quantified_achievement_count: (extracted.achievements || []).filter(
      (a) => a.is_quantified
    ).length,
    technical_skill_count: (extracted.skills || []).filter(
      (s) => s.category === "technical" || s.category === "tool"
    ).length,
    has_leadership_experience: (extracted.leadership || []).length > 0,
    has_projects: (extracted.projects || []).length > 0,
    highest_education_level: highestEducationLevel(extracted.educations),
  };

  return { parsed: extracted, computed, parserVersion: PARSER_VERSION };
}

const DEGREE_RANK = [
  { pattern: /\bph\.?d|doctorate/i, level: "doctorate", rank: 4 },
  { pattern: /\bmba|\bm\.?s\.?c?\b|\bmaster/i, level: "masters", rank: 3 },
  { pattern: /\bb\.?a\.?\b|\bb\.?s\.?c?\b|\bbachelor|\bbba\b/i, level: "bachelors", rank: 2 },
  { pattern: /\bdiploma|\bassociate/i, level: "diploma", rank: 1 },
];

function highestEducationLevel(educations) {
  if (!educations || educations.length === 0) return null;
  let best = { level: "other", rank: 0 };
  for (const edu of educations) {
    const text = `${edu.degree || ""}`;
    for (const d of DEGREE_RANK) {
      if (d.pattern.test(text) && d.rank > best.rank) best = d;
    }
  }
  return best.rank > 0 ? best.level : "other";
}
