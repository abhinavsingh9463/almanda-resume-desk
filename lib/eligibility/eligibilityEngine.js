// Phase 4 — Hard Requirement Eligibility Engine.
//
// Entirely deterministic (Part 14: degree level, years of experience,
// explicit certifications, explicit language levels, and location are
// all deterministic checks — no LLM call in this file). Every result
// carries a `reason` and `evidence` so it's traceable (Part 13).
//
// Design choice per Part 4: a requirement whose parsed_value we couldn't
// confidently extract, or whose type we can't yet check deterministically
// (location, work_authorization — need candidate-stated data we don't
// collect until the profile form is built), is marked "needs_review".
// It is NEVER silently counted as a pass, and never auto-fails a
// candidate either — a human/candidate resolves it.

import { cefrRank } from "../parsing/requirementClassifier.js";

const DEGREE_RANK = { diploma: 1, bachelors: 2, masters: 3, doctorate: 4 };

function normalizeDegreeWord(word) {
  if (!word) return null;
  const w = word.toLowerCase();
  if (/phd|doctorate/.test(w)) return "doctorate";
  if (/master|mba/.test(w)) return "masters";
  if (/bachelor|^ba$|^bs$|^bsc$|bba/.test(w)) return "bachelors";
  if (/diploma|associate/.test(w)) return "diploma";
  return null;
}

/**
 * Evaluates a single mandatory (or preferred) requirement against a
 * candidate's parsed profile.
 * @param {object} requirement - {requirement_text, requirement_type, parsed_value}
 * @param {object} profile - {parsed, computed} from resumeParser.js
 * @returns {{status: 'pass'|'fail'|'needs_review', reason: string, evidence: string|null}}
 */
export function evaluateRequirement(requirement, profile) {
  const { requirement_type: type, parsed_value: value, requirement_text: text } = requirement;
  const { parsed, computed } = profile;

  switch (type) {
    case "experience": {
      if (!value || value.years == null) {
        return { status: "needs_review", reason: "Could not determine a specific required years figure from this requirement.", evidence: null };
      }
      const have = computed.total_experience_years || 0;
      if (have >= value.years) {
        return { status: "pass", reason: `Candidate has ${have} years of experience, meeting the ${value.years}-year requirement.`, evidence: null };
      }
      return { status: "fail", reason: `Candidate has ${have} years of experience; requirement is ${value.years}+.`, evidence: null };
    }

    case "education": {
      if (!value || !value.degree) {
        return { status: "needs_review", reason: "Could not determine a specific required degree level from this requirement.", evidence: null };
      }
      const requiredLevel = normalizeDegreeWord(value.degree);
      if (!requiredLevel) {
        return { status: "needs_review", reason: `Degree wording "${value.degree}" could not be matched to a known level.`, evidence: null };
      }
      const haveLevel = computed.highest_education_level;
      if (!haveLevel || !DEGREE_RANK[haveLevel]) {
        return { status: "fail", reason: `No matching degree found in candidate profile for the ${requiredLevel} requirement.`, evidence: null };
      }
      if (DEGREE_RANK[haveLevel] >= DEGREE_RANK[requiredLevel]) {
        return { status: "pass", reason: `Candidate holds a ${haveLevel} degree, meeting the ${requiredLevel} requirement.`, evidence: null };
      }
      return { status: "fail", reason: `Candidate's highest degree (${haveLevel}) is below the required ${requiredLevel}.`, evidence: null };
    }

    case "certification": {
      const needle = (value?.raw || text || "").toLowerCase();
      const match = (parsed.certifications || []).find((c) =>
        needle.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(needle.replace(/^.*?(certified|certification)\s*/i, ""))
      );
      if (match) {
        return { status: "pass", reason: `Candidate holds "${match.name}".`, evidence: match.evidence || null };
      }
      return { status: "fail", reason: `No matching certification found in candidate profile for: "${text}".`, evidence: null };
    }

    case "language": {
      if (!value || !value.language || !value.level) {
        return { status: "needs_review", reason: "Could not determine a specific language and proficiency level from this requirement.", evidence: null };
      }
      const requiredRank = cefrRank(value.level);
      const candidateLangSkill = (parsed.skills || []).find(
        (s) => s.category === "language" && s.name.toLowerCase().includes(value.language.toLowerCase())
      );
      if (!candidateLangSkill) {
        return { status: "fail", reason: `No ${value.language} language proficiency found in candidate profile.`, evidence: null };
      }
      const haveRank = cefrRank(candidateLangSkill.proficiency);
      if (haveRank == null || requiredRank == null) {
        return { status: "needs_review", reason: `Candidate lists ${value.language} (${candidateLangSkill.proficiency || "level unspecified"}) — level could not be confidently compared to the ${value.level} requirement.`, evidence: candidateLangSkill.evidence || null };
      }
      if (haveRank >= requiredRank) {
        return { status: "pass", reason: `Candidate's ${value.language} level (${candidateLangSkill.proficiency}) meets the ${value.level} requirement.`, evidence: candidateLangSkill.evidence || null };
      }
      return { status: "fail", reason: `Candidate's ${value.language} level (${candidateLangSkill.proficiency}) is below the required ${value.level}.`, evidence: candidateLangSkill.evidence || null };
    }

    case "skill": {
      // Exact/substring match only here — this is deterministic on purpose.
      // Fuzzy "similar skill terminology" matching (Part 14) is a Phase 5+
      // AI-assisted refinement layered on top of this pass/needs_review
      // result, never a silent auto-pass.
      const needle = text.toLowerCase();
      const match = (parsed.skills || []).find(
        (s) => needle.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(needle)
      );
      if (match) {
        return { status: "pass", reason: `Candidate lists "${match.name}", matching this requirement.`, evidence: match.evidence || null };
      }
      return { status: "needs_review", reason: `No exact skill match found for "${text}" — may be present under different terminology.`, evidence: null };
    }

    case "location":
    case "work_authorization":
    default:
      return { status: "needs_review", reason: `This requirement type ("${type}") isn't captured in the resume profile yet — needs candidate confirmation.`, evidence: null };
  }
}

/**
 * Evaluates all requirements for a job against a candidate profile and
 * returns the full eligibility report (Part 5 shape).
 */
export function computeEligibility(requirements, profile) {
  const mandatory = requirements.filter((r) => r.classification === "mandatory");
  const preferred = requirements.filter((r) => r.classification === "preferred" || r.classification === "nice_to_have");

  const mandatoryResults = mandatory.map((r) => ({ requirement: r, ...evaluateRequirement(r, profile) }));
  const preferredResults = preferred.map((r) => ({ requirement: r, ...evaluateRequirement(r, profile) }));

  const mandatoryFailed = mandatoryResults.filter((r) => r.status === "fail");
  const mandatoryNeedsReview = mandatoryResults.filter((r) => r.status === "needs_review");
  const mandatoryPassed = mandatoryResults.filter((r) => r.status === "pass");

  let eligibility;
  if (mandatoryFailed.length > 0) {
    eligibility = "not_eligible";
  } else if (mandatoryNeedsReview.length > 0) {
    eligibility = "needs_review";
  } else {
    eligibility = "eligible";
  }

  return {
    eligibility,
    mandatory_passed: mandatoryPassed.length,
    mandatory_total: mandatory.length,
    mandatory_needs_review: mandatoryNeedsReview.length,
    preferred_passed: preferredResults.filter((r) => r.status === "pass").length,
    preferred_total: preferred.length,
    missing_mandatory: mandatoryFailed.map((r) => r.requirement.requirement_text),
    requirement_results: [...mandatoryResults, ...preferredResults].map((r) => ({
      requirement_text: r.requirement.requirement_text,
      requirement_type: r.requirement.requirement_type,
      classification: r.requirement.classification,
      status: r.status,
      reason: r.reason,
      evidence: r.evidence,
    })),
  };
}
