// Shared Claude API caller — extracted from the original pages/api/score.js
// so score.js, and every new Phase 1-5 module, share one retry/parsing
// implementation instead of copy-pasting it.
//
// Part 14 rule: this file is only ever used for the *semantic* parts of
// each feature (similar-skill matching, explanation text). Deterministic
// decisions (years of experience, mandatory/preferred classification,
// eligibility pass/fail) never go through this — see lib/eligibility and
// lib/matching, which are pure JS with no AI call.

const MODEL = "claude-sonnet-4-6";

async function callClaudeRaw(body, attempt = 1) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if ((response.status === 429 || response.status === 529) && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1200 * attempt));
    return callClaudeRaw(body, attempt + 1);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }
  return response.json();
}

function extractJsonObject(raw) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("no_json_found");
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

/**
 * Calls Claude with a system prompt + user message and expects a single
 * JSON object back. Throws if the model doesn't return parseable JSON —
 * callers should catch and fail closed (mark as "needs_review"), never
 * assume success.
 */
export async function askClaudeForJson({ system, prompt, maxTokens = 1500 }) {
  const data = await callClaudeRaw({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("no_text_in_response");
  return extractJsonObject(textBlock.text);
}

/**
 * Calls Claude with a system prompt + user message and returns the raw
 * text response (no JSON parsing). Used by Phase 6's tailored-summary
 * generation, which is deliberately the ONLY free-text (non-JSON,
 * non-deterministic) AI call in the app — and even that is constrained
 * by its system prompt to only restate facts the caller already
 * extracted with evidence (see lib/tailoring/resumeTailor.js).
 */
export async function askClaudeForText({ system, prompt, maxTokens = 500 }) {
  const data = await callClaudeRaw({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("no_text_in_response");
  return textBlock.text;
}
