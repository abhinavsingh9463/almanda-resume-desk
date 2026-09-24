// GET -> reads every job this candidate session has analyzed (via
// analyze-job.js) and returns the Phase 5 comparison table + gap analysis.
// No re-computation of eligibility here — this purely aggregates the
// already-stored, already-evidenced job_matches rows.

import { getOrCreateCandidateProfile } from "../../../lib/db/session.js";
import { query } from "../../../lib/db/client.js";
import { buildComparisonTable, buildGapAnalysis } from "../../../lib/matching/comparisonEngine.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET" });

  try {
    const candidateProfile = await getOrCreateCandidateProfile(req, res);

    const rows = await query(
      `select j.id as job_id, j.title as job_title, jm.eligibility, jm.mandatory_passed, jm.mandatory_total,
              jm.preferred_passed, jm.preferred_total, jm.requirement_results, jm.missing_mandatory, jm.created_at
       from job_matches jm
       join jobs j on j.id = jm.job_id
       where j.candidate_profile_id = $1
       order by jm.created_at desc`,
      [candidateProfile.id]
    );

    if (rows.rows.length === 0) {
      return res.status(200).json({ jobs_analyzed: 0, comparison_table: [], gap_analysis: null });
    }

    // Only compare each job's most recent match (in case a job was re-analyzed).
    const latestPerJob = new Map();
    for (const row of rows.rows) {
      if (!latestPerJob.has(row.job_id)) latestPerJob.set(row.job_id, row);
    }

    const jobResults = [...latestPerJob.values()].map((row) => ({
      job: { id: row.job_id, title: row.job_title },
      eligibilityResult: {
        eligibility: row.eligibility,
        mandatory_passed: row.mandatory_passed,
        mandatory_total: row.mandatory_total,
        preferred_passed: row.preferred_passed,
        preferred_total: row.preferred_total,
        requirement_results: row.requirement_results,
      },
    }));

    return res.status(200).json({
      comparison_table: buildComparisonTable(jobResults),
      gap_analysis: buildGapAnalysis(jobResults),
    });
  } catch (err) {
    console.error("[compare-jobs] failed:", err.message || err);
    return res.status(500).json({ error: "Couldn't load your job comparisons just now." });
  }
}
