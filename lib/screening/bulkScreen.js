// Phase 8 — Bulk resume screening for a job posting.
//
// Deliberately reuses the exact same deterministic eligibility engine
// (lib/eligibility/eligibilityEngine.js) used on the candidate side — a
// candidate's own "Compare Jobs" result and a recruiter's screening
// result for the same resume+posting must never be able to disagree
// because of two different implementations of the same rule.
//
// Each resume is parsed and evaluated independently, and sequentially
// (not Promise.all) — deliberately, so a large batch doesn't fire dozens
// of concurrent Anthropic API calls at once. One malformed resume must
// not fail the rest of the batch.

import { parseResume } from "../parsing/resumeParser.js";
import { computeEligibility } from "../eligibility/eligibilityEngine.js";

/**
 * @param {Array<{fileName: string, rawText: string}>} resumeFiles
 * @param {Array} requirements - posting_requirements rows for this posting
 * @returns {Promise<Array<{fileName, rawText, status: 'ok'|'error', error?, parsed?, computed?, parserVersion?, eligibility?}>>}
 */
export async function screenBatch(resumeFiles, requirements) {
  const results = [];
  for (const file of resumeFiles) {
    try {
      const { parsed, computed, parserVersion } = await parseResume(file.rawText);
      const eligibilityResult = computeEligibility(requirements, { parsed, computed });
      results.push({
        fileName: file.fileName,
        rawText: file.rawText,
        status: "ok",
        parsed,
        computed,
        parserVersion,
        eligibility: eligibilityResult,
      });
    } catch (err) {
      results.push({
        fileName: file.fileName,
        rawText: file.rawText,
        status: "error",
        error: err.message === "resume_text_too_short" ? "Resume text too short to parse." : "Couldn't parse this resume.",
      });
    }
  }
  return results;
}
