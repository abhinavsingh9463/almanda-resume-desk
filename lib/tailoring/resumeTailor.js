// Phase 6 — Tailored Resume Versions.
//
// Hybrid by design (Part 14), same split as Phases 1-5: which sections
// lead and which bullets get surfaced is entirely deterministic, driven
// by the template recommendation (Phase 2) and the job_matches evidence
// (Phase 4) that were already computed for this resume+job pair — this
// file never recomputes eligibility or invents a fit that wasn't already
// established there.
//
// The AI is used for exactly one thing — writing a short summary
// paragraph — and it is constrained to only restate facts that already
// have an evidence_text in the candidate's parsed profile (Part 8: never
// invent candidate data). If that call fails, the caller still has a
// fully deterministic tailored resume without a summary line; it must
// never block the whole feature on the AI step.

import { askClaudeForText } from "../ai/claude.js";

export const TAILOR_VERSION = "resume-tailor-v1";

/**
 * Deterministic emphasis selection: pins the bullets whose evidence_text
 * was cited as a "pass" for THIS job to the top of their section, and
 * keeps the original resume order (sort_order) for everything else — no
 * randomness, same input always gives the same output.
 *
 * @param {object} profile - {parsed, computed} for the resume_version
 * @param {{section_order: string[]}} templateRecommendation
 * @param {object} eligibilityResult - computeEligibility() output for this job
 */
export function selectEmphasis(profile, templateRecommendation, eligibilityResult) {
  const { parsed } = profile;
  const passedEvidence = new Set(
    (eligibilityResult.requirement_results || [])
      .filter((r) => r.status === "pass" && r.evidence)
      .map((r) => r.evidence)
  );

  const rank = (items) =>
    items
      .map((item, i) => ({ ...item, _matched: passedEvidence.has(item.evidence), _order: i }))
      .sort((a, b) => (b._matched === a._matched ? a._order - b._order : b._matched - a._matched));

  const rankedExperiences = rank(parsed.experiences || []);
  const rankedAchievements = rank(parsed.achievements || []);

  const addressedGaps = (eligibilityResult.requirement_results || [])
    .filter((r) => r.status === "pass")
    .map((r) => r.requirement_text);

  return {
    section_order: templateRecommendation.section_order,
    ranked_experiences: rankedExperiences,
    ranked_achievements: rankedAchievements,
    addressed_gaps: addressedGaps,
    unaddressed_gaps: eligibilityResult.missing_mandatory || [],
  };
}

const SUMMARY_SYSTEM_PROMPT = `You write a 2-3 sentence resume summary tailored to a specific job application.
Rules:
- Use ONLY the facts given to you in the "Facts you may use" list. Do not add any skill, employer, degree, number, or outcome that is not literally in that list.
- Do not invent years of experience or metrics.
- Plain text only — no markdown, no quotation marks around the output, no "I" (write as it appears on a resume, e.g. "Finance analyst with...").
- Exactly 2-3 sentences.
Output ONLY the summary text, nothing else.`;

/**
 * Best-effort AI summary, constrained to the evidence strings the caller
 * supplies. Returns null (not a guess) if there's no evidence to work
 * from — a summary is only useful if it's grounded.
 */
export async function generateTailoredSummary({ jobTitle, evidenceFacts }) {
  if (!evidenceFacts || evidenceFacts.length === 0) return null;
  const prompt = `Target role: ${jobTitle || "the target role"}\n\nFacts you may use (and only these):\n${evidenceFacts
    .map((f) => `- ${f}`)
    .join("\n")}`;
  const text = await askClaudeForText({ system: SUMMARY_SYSTEM_PROMPT, prompt, maxTokens: 300 });
  return text.trim();
}

function sectionLines(key, { parsed, emphasis, summary }) {
  switch (key) {
    case "header":
      return [parsed.full_name || "Candidate", [parsed.email, parsed.phone].filter(Boolean).join(" | ")].filter(Boolean);

    case "summary":
      return summary ? ["SUMMARY", summary] : [];

    case "core_skills":
    case "skills":
      return (parsed.skills || []).length ? ["SKILLS", parsed.skills.map((s) => s.name).join(", ")] : [];

    case "technical_skills": {
      const tech = (parsed.skills || []).filter((s) => s.category === "technical" || s.category === "tool");
      return tech.length ? ["TECHNICAL SKILLS", tech.map((s) => s.name).join(", ")] : [];
    }

    case "experience":
      return emphasis.ranked_experiences.length
        ? [
            "EXPERIENCE",
            ...emphasis.ranked_experiences.flatMap((e) =>
              [`${e.job_title || ""}${e.company ? ` — ${e.company}` : ""}`.trim(), e.description || ""].filter(Boolean)
            ),
          ]
        : [];

    case "achievements":
      return emphasis.ranked_achievements.length
        ? ["ACHIEVEMENTS", ...emphasis.ranked_achievements.map((a) => `- ${a.description}`)]
        : [];

    case "projects":
      return (parsed.projects || []).length
        ? ["PROJECTS", ...parsed.projects.map((p) => `${p.name}${p.description ? `: ${p.description}` : ""}`)]
        : [];

    case "education":
      return (parsed.educations || []).length
        ? [
            "EDUCATION",
            ...parsed.educations.map((ed) =>
              `${ed.degree || ""}${ed.field_of_study ? `, ${ed.field_of_study}` : ""}${ed.institution ? ` — ${ed.institution}` : ""}`.trim()
            ),
          ]
        : [];

    case "certifications":
      return (parsed.certifications || []).length
        ? ["CERTIFICATIONS", ...parsed.certifications.map((c) => `- ${c.name}${c.issuer ? ` (${c.issuer})` : ""}`)]
        : [];

    case "leadership_highlights":
      return (parsed.leadership || []).length
        ? ["LEADERSHIP", ...parsed.leadership.map((l) => `- ${l.description}`)]
        : [];

    default:
      return [];
  }
}

/**
 * Renders the final plain-text resume, honoring the recommended
 * section_order. Fully deterministic — no AI in this step. This is what
 * gets stored in tailored_resumes.full_text and is what the candidate
 * copies/exports.
 */
export function renderPlainText({ profile, emphasis, summary }) {
  const { parsed } = profile;
  const blocks = emphasis.section_order
    .map((key) => sectionLines(key, { parsed, emphasis, summary }))
    .filter((lines) => lines.length > 0)
    .map((lines) => lines.join("\n"));
  return blocks.join("\n\n").trim();
}
