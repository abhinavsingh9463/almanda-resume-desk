// Phase 3/4 support — deterministic classification of a single
// requirement sentence into mandatory / preferred / nice_to_have /
// needs_review, and deterministic extraction of its structured value
// (years, CEFR level, etc).
//
// Part 4 is explicit: "If the requirement cannot confidently be
// classified as mandatory, show it as Needs Review rather than inventing
// certainty." So this errs toward needs_review whenever the wording is
// ambiguous — it never guesses mandatory.
//
// Pure functions, no AI call, fully unit-testable.

const MANDATORY_MARKERS = [
  /\bmust have\b/i, /\bmust be\b/i, /\brequired\b/i, /\brequirement:/i,
  /\bat least\b/i, /\bminimum of\b/i, /\bminimum\b/i, /\bmandatory\b/i,
  /\bessential\b/i, /\bneeds? to have\b/i,
];

const PREFERRED_MARKERS = [
  /\bpreferred\b/i, /\bnice to have\b/i, /\bbonus\b/i, /\bplus\b/i,
  /\bdesirable\b/i, /\ba plus\b/i, /\bideally\b/i, /\bwe'?d love\b/i,
  /\bgood to have\b/i, /\bis a plus\b/i,
];

/**
 * Classifies one requirement sentence.
 * @returns {{classification: 'mandatory'|'preferred'|'nice_to_have'|'needs_review', reason: string}}
 */
export function classifyRequirement(text) {
  if (!text || !text.trim()) {
    return { classification: "needs_review", reason: "Empty requirement text." };
  }
  const hasMandatoryMarker = MANDATORY_MARKERS.some((r) => r.test(text));
  const hasPreferredMarker = PREFERRED_MARKERS.some((r) => r.test(text));

  if (hasMandatoryMarker && hasPreferredMarker) {
    // e.g. "Required: 3 years, SQL preferred" mixed in one line — don't guess.
    return {
      classification: "needs_review",
      reason: "Sentence contains both mandatory and preferred language; needs human review.",
    };
  }
  if (hasMandatoryMarker) {
    const marker = MANDATORY_MARKERS.find((r) => r.test(text));
    return {
      classification: "mandatory",
      reason: `Contains explicit mandatory language ("${text.match(marker)[0]}").`,
    };
  }
  if (hasPreferredMarker) {
    const marker = PREFERRED_MARKERS.find((r) => r.test(text));
    return {
      classification: "preferred",
      reason: `Contains explicit preferred language ("${text.match(marker)[0]}").`,
    };
  }
  return {
    classification: "needs_review",
    reason: "No explicit mandatory/preferred language detected — cannot confidently classify.",
  };
}

const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * Extracts a structured value from a requirement sentence, deterministically.
 * Returns null if nothing recognizable is found (caller keeps requirement
 * as text-only / needs_review rather than inventing a value).
 */
export function extractParsedValue(text, type) {
  if (!text) return null;

  if (type === "experience") {
    const m = text.match(/(\d+)\s*\+?\s*(?:years?|yrs?)/i);
    if (m) return { years: Number(m[1]) };
  }

  if (type === "language") {
    const langMatch = text.match(/\b(German|French|Spanish|English|Mandarin|Chinese|Japanese|Portuguese|Italian|Arabic|Russian|Hindi)\b/i);
    const levelMatch = text.match(/\b(A1|A2|B1|B2|C1|C2)\b/i);
    if (langMatch || levelMatch) {
      return {
        language: langMatch ? langMatch[1] : null,
        level: levelMatch ? levelMatch[1].toUpperCase() : null,
      };
    }
  }

  if (type === "education") {
    const degreeMatch = text.match(/\b(PhD|doctorate|master'?s?|MBA|bachelor'?s?|BA|BS|BSc|associate'?s?|diploma)\b/i);
    if (degreeMatch) return { degree: degreeMatch[1] };
  }

  if (type === "certification") {
    // Keep the raw phrase — certification names are too varied to regex
    // reliably; matching against candidate certs is done as an exact/fuzzy
    // string compare in eligibilityEngine.js, not invented here.
    return { raw: text.trim() };
  }

  return null;
}

export function cefrRank(level) {
  const idx = CEFR_LEVELS.indexOf((level || "").toUpperCase());
  return idx === -1 ? null : idx;
}
