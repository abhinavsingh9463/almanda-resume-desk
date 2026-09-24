// Phase 2 — "Find My Resume Format".
//
// Fully deterministic rule engine, as Part 2 requires ("based on
// structured profile data and deterministic rules where possible, not
// only an LLM response"). Takes the `computed` block from resumeParser.js
// (never raw AI prose) and runs a fixed set of rules. Every rule that
// fires contributes a plain-English reason string, so the recommendation
// is always explainable (Part 13).
//
// To add a new template: add a row to TEMPLATES and a matching branch in
// scoreTemplate(). Nothing else needs to change — this is the "expandable
// engine" Part 2 asks for.

export const TEMPLATES = [
  {
    slug: "experience-led",
    name: "Experience-Led",
    sectionOrder: ["header", "summary", "core_skills", "experience", "achievements", "projects", "education", "certifications"],
  },
  {
    slug: "skills-forward-technical",
    name: "Skills-Forward Technical",
    sectionOrder: ["header", "summary", "technical_skills", "projects", "experience", "certifications", "education"],
  },
  {
    slug: "education-first-early-career",
    name: "Education-First (Early Career)",
    sectionOrder: ["header", "summary", "education", "projects", "skills", "experience", "certifications"],
  },
  {
    slug: "leadership-narrative",
    name: "Leadership Narrative",
    sectionOrder: ["header", "summary", "leadership_highlights", "experience", "achievements", "core_skills", "education"],
  },
  {
    slug: "certification-forward",
    name: "Certification-Forward",
    sectionOrder: ["header", "summary", "certifications", "technical_skills", "experience", "education", "projects"],
  },
];

/**
 * Scores one template against the computed profile. Returns
 * {score, reasons[]}. Higher score = better fit. Pure function, no AI.
 */
function scoreTemplate(slug, computed) {
  const years = computed.total_experience_years || 0;
  const reasons = [];
  let score = 0;

  switch (slug) {
    case "experience-led":
      if (years >= 2) { score += 3; reasons.push(`${years} years of relevant experience is enough to lead with the work history.`); }
      if (computed.quantified_achievement_count >= 2) { score += 2; reasons.push(`${computed.quantified_achievement_count} measurable achievements strengthen an experience-first format.`); }
      if (computed.position_count >= 2) { score += 1; reasons.push(`Multiple prior positions give the experience section enough substance.`); }
      break;

    case "skills-forward-technical":
      if (computed.technical_skill_count >= 6) { score += 3; reasons.push(`${computed.technical_skill_count} technical skills justify a skills-forward layout.`); }
      if (computed.has_projects) { score += 2; reasons.push(`Project history supports leading with technical strengths.`); }
      if (years < 3) { score += 1; reasons.push(`With ${years} years of experience, technical depth matters more than tenure.`); }
      break;

    case "education-first-early-career":
      if (years < 2) { score += 3; reasons.push(`Fewer than 2 years of experience means education carries more weight.`); }
      if (computed.highest_education_level === "masters" || computed.highest_education_level === "doctorate") {
        score += 2; reasons.push(`An advanced degree is a strong lead credential.`);
      }
      if (computed.has_projects && years < 2) { score += 1; reasons.push(`Academic/personal projects can stand in for limited work history.`); }
      break;

    case "leadership-narrative":
      if (computed.has_leadership_experience) { score += 3; reasons.push(`Documented leadership experience supports a leadership-led narrative.`); }
      if (years >= 4) { score += 2; reasons.push(`${years} years of experience gives leadership claims credibility.`); }
      break;

    case "certification-forward":
      if (computed.certification_count >= 2) { score += 3; reasons.push(`Multiple certifications are a strong differentiator to lead with.`); }
      break;
  }

  return { score, reasons };
}

/**
 * Runs all templates and returns the ranked recommendation.
 * @param {object} computed - the `computed` block from resumeParser.js,
 *   plus certification_count (added by caller from parsed.certifications.length)
 */
export function recommendTemplate(computed) {
  const results = TEMPLATES.map((t) => ({
    template: t,
    ...scoreTemplate(t.slug, computed),
  })).sort((a, b) => b.score - a.score);

  const winner = results[0];
  const runnerUp = results[1];

  // If nothing scored (very sparse profile), fail closed to the safest
  // general-purpose template rather than asserting confidence we don't have.
  const chosen = winner.score > 0 ? winner : {
    template: TEMPLATES[0],
    score: 0,
    reasons: ["Profile has limited data so far — defaulting to a general-purpose experience-led format until more resume detail is available."],
  };

  const sectionsToEmphasize = sectionsWorthEmphasizing(chosen.template.slug, computed);
  const sectionsToReduce = sectionsWorthReducing(computed);

  return {
    recommended_template: chosen.template.slug,
    recommended_template_name: chosen.template.name,
    section_order: chosen.template.sectionOrder,
    recommended_page_length: recommendPageLength(computed),
    sections_emphasized: sectionsToEmphasize,
    sections_reduced: sectionsToReduce,
    reasons: chosen.reasons,
    runner_up: runnerUp ? { template: runnerUp.template.slug, score: runnerUp.score } : null,
  };
}

function recommendPageLength(computed) {
  const years = computed.total_experience_years || 0;
  if (years < 3) return "1 page";
  if (years <= 8) return "1-2 pages";
  return "2 pages";
}

function sectionsWorthEmphasizing(templateSlug, computed) {
  const out = [];
  if (computed.quantified_achievement_count >= 2) out.push("achievements");
  if (computed.technical_skill_count >= 6) out.push("technical_skills");
  if (computed.has_leadership_experience) out.push("leadership_highlights");
  if (computed.certification_count >= 2) out.push("certifications");
  return out;
}

function sectionsWorthReducing(computed) {
  const out = [];
  if ((computed.total_experience_years || 0) < 1) out.push("experience");
  if (!computed.has_projects) out.push("projects");
  return out;
}
