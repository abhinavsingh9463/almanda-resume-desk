// Phase 5 — Multi-Job Comparison + "Why am I not eligible?" gap analysis.
//
// Pure aggregation over the eligibility results computed in Phase 4 —
// no AI, no new judgment calls, just counting and grouping. This is what
// makes the recurring-gap claims ("SQL missing in 8 jobs") trustworthy:
// they're a direct tally of the same evidence-backed results already
// shown per job (Part 7: "only evaluate documented fit").

/**
 * Builds the comparison table rows (Part 6).
 * @param {Array<{job: {id, title}, eligibilityResult: object}>} jobResults
 */
export function buildComparisonTable(jobResults) {
  return jobResults.map(({ job, eligibilityResult }) => ({
    job_id: job.id,
    job_title: job.title || "Untitled role",
    eligibility: eligibilityResult.eligibility,
    mandatory_passed: eligibilityResult.mandatory_passed,
    mandatory_total: eligibilityResult.mandatory_total,
    skills_label: labelForRatio(
      countByTypeStatus(eligibilityResult.requirement_results, "skill", "pass"),
      countByType(eligibilityResult.requirement_results, "skill")
    ),
    experience_label: labelForStatus(
      statusForType(eligibilityResult.requirement_results, "experience")
    ),
    preferred_passed: eligibilityResult.preferred_passed,
    preferred_total: eligibilityResult.preferred_total,
  }));
}

function countByType(results, type) {
  return results.filter((r) => r.requirement_type === type).length;
}
function countByTypeStatus(results, type, status) {
  return results.filter((r) => r.requirement_type === type && r.status === status).length;
}
function statusForType(results, type) {
  const matches = results.filter((r) => r.requirement_type === type);
  if (matches.length === 0) return null;
  if (matches.some((r) => r.status === "fail")) return "fail";
  if (matches.some((r) => r.status === "needs_review")) return "needs_review";
  return "pass";
}
function labelForRatio(passed, total) {
  if (total === 0) return "N/A";
  const pct = passed / total;
  if (pct >= 0.75) return "Strong";
  if (pct >= 0.4) return "Moderate";
  return "Weak";
}
function labelForStatus(status) {
  if (status === "pass") return "Strong match";
  if (status === "fail") return "Below requirement";
  if (status === "needs_review") return "Needs review";
  return "Not specified";
}

/**
 * Part 7 — recurring gap analysis across multiple analyzed jobs.
 * Groups failed/needs-review mandatory requirements by normalized text
 * so "SQL" mentioned slightly differently across job posts still groups
 * together for the count, while keeping the original phrasing for display.
 */
export function buildGapAnalysis(jobResults) {
  const gapCounts = new Map(); // normalized -> {label, jobTitles: Set}
  const strengthCounts = new Map();

  for (const { job, eligibilityResult } of jobResults) {
    for (const r of eligibilityResult.requirement_results) {
      const key = normalize(r.requirement_text);
      if (r.status === "fail") {
        if (!gapCounts.has(key)) gapCounts.set(key, { label: r.requirement_text, jobs: new Set() });
        gapCounts.get(key).jobs.add(job.title || job.id);
      }
      if (r.status === "pass") {
        if (!strengthCounts.has(key)) strengthCounts.set(key, { label: r.requirement_text, jobs: new Set() });
        strengthCounts.get(key).jobs.add(job.title || job.id);
      }
    }
  }

  const recurringGaps = [...gapCounts.entries()]
    .map(([key, v]) => ({ requirement: v.label, missing_in_count: v.jobs.size, jobs_affected: [...v.jobs] }))
    .filter((g) => g.missing_in_count >= 2) // "recurring" = appears more than once
    .sort((a, b) => b.missing_in_count - a.missing_in_count);

  const strongestQualifications = [...strengthCounts.entries()]
    .map(([key, v]) => ({ requirement: v.label, matched_in_count: v.jobs.size }))
    .sort((a, b) => b.matched_in_count - a.matched_in_count)
    .slice(0, 8);

  return {
    jobs_analyzed: jobResults.length,
    recurring_gaps: recurringGaps,
    strongest_qualifications: strongestQualifications,
    top_gap: recurringGaps[0] || null,
  };
}

function normalize(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
