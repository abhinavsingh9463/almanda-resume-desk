// This runs on the server — your ANTHROPIC_API_KEY never reaches the browser.
// Set ANTHROPIC_API_KEY in your Vercel project's Environment Variables.

const CATEGORY_KEYS = ["job_match", "skills_keywords", "language_clarity", "formatting", "impact"];

async function callClaude(body, attempt = 1) {
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
    return callClaude(body, attempt + 1);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${text}`);
  }
  return await response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  const { resume, job } = req.body || {};
  if (!resume || !job) {
    return res.status(400).json({ error: "Both resume and job description are required." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
  }

  const prompt = `You are an expert technical recruiter and resume reviewer. Score this resume against this job description using a rubric of five categories that sum to 100:
- job_match (max 40): how well experience/seniority/domain matches the role
- skills_keywords (max 20): presence of skills and keywords the job asks for
- language_clarity (max 15): writing quality, clarity, active voice, no fluff
- formatting (max 15): structure, scannability, consistency
- impact (max 10): quantified, outcome-driven bullet points vs vague duty lists

RESUME:
${resume}

JOB DESCRIPTION:
${job}

Respond with ONLY a JSON object, no markdown fences, no preamble, in exactly this shape:
{
  "categories": {
    "job_match": {"score": <0-40>, "note": "<one sentence, specific to this resume>"},
    "skills_keywords": {"score": <0-20>, "note": "<one sentence>"},
    "language_clarity": {"score": <0-15>, "note": "<one sentence>"},
    "formatting": {"score": <0-15>, "note": "<one sentence>"},
    "impact": {"score": <0-10>, "note": "<one sentence>"}
  },
  "strengths": [<3 short strings>],
  "weak_points": [<3-5 short strings, specific weak areas>],
  "suggestions": [<3-5 short, actionable rewrite suggestions>]
}
The overall score must equal the sum of the five category scores.`;

  try {
    const data = await callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{ role: "user", content: prompt }],
    });
    const textBlock = (data.content || []).find((b) => b.type === "text");
    const raw = textBlock ? textBlock.text : "";
    // Strip code fences, then grab only the outermost {...} in case the model
    // adds any stray text before/after the JSON.
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) throw new Error("no_json_found");
    const jsonSlice = cleaned.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonSlice);
    const total = CATEGORY_KEYS.reduce((sum, k) => sum + (parsed.categories[k]?.score || 0), 0);
    return res.status(200).json({ ...parsed, total });
  } catch (err) {
    // Log the real reason server-side (visible in Vercel > your project > Logs)
    // so future failures are diagnosable instead of a black box.
    console.error("[score] failed:", err.message || err);
    const rateLimited = String(err.message || "").includes("429");
    return res.status(rateLimited ? 429 : 502).json({
      error: rateLimited
        ? "A lot of people are testing right now — try again in a few seconds."
        : "Couldn't score that resume just now — please try again.",
    });
  }
}
