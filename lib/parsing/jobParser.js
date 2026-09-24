// Phase 3 — job description parsing.
//
// Split responsibility per Part 14:
//   - AI extracts the literal requirement sentences and tags their rough
//     type (education/experience/certification/skill/language/location/
//     work_authorization/other). This is extraction, not judgment.
//   - classifyRequirement() (deterministic, see requirementClassifier.js)
//     decides mandatory vs preferred vs needs_review.
//   - extractParsedValue() (deterministic) pulls out years/CEFR/degree.
//
// This keeps the "is this mandatory?" decision — the one Part 4 needs to
// be trustworthy — entirely out of the AI's hands.

import { askClaudeForJson } from "../ai/claude.js";
import { classifyRequirement, extractParsedValue } from "./requirementClassifier.js";

const EXTRACTION_SYSTEM_PROMPT = `You extract requirement sentences from job descriptions. You must:
- Copy each requirement as it literally appears (or a minimally trimmed version) — do not paraphrase or summarize.
- Split compound sentences into separate requirements when they list distinct qualifications.
- Tag each with the type it best fits: "education", "experience", "certification", "skill", "language", "location", "work_authorization", or "other".
- Also extract job responsibilities separately (these are not requirements).
- Output ONLY a single JSON object, no prose, no markdown fences, in this shape:
{
  "title": string|null,
  "requirements": [{"text": string, "type": string}],
  "responsibilities": [string]
}`;

export async function parseJobDescription(rawText) {
  if (!rawText || rawText.trim().length < 20) {
    throw new Error("job_description_too_short");
  }

  const extracted = await askClaudeForJson({
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: rawText.slice(0, 12000),
    maxTokens: 2500,
  });

  if (!Array.isArray(extracted.requirements)) {
    throw new Error("parser_missing_field:requirements");
  }

  // Deterministic classification pass — the part that must be trustworthy.
  const requirements = extracted.requirements.map((r) => {
    const { classification, reason } = classifyRequirement(r.text);
    const parsedValue = extractParsedValue(r.text, r.type);
    return {
      requirement_text: r.text,
      requirement_type: r.type || "other",
      classification,
      classification_reason: reason,
      parsed_value: parsedValue,
    };
  });

  return {
    title: extracted.title || null,
    requirements,
    responsibilities: extracted.responsibilities || [],
  };
}
