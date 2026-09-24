import test from "node:test";
import assert from "node:assert/strict";
import { recommendTemplate } from "../lib/matching/templateEngine.js";
import { buildComparisonTable, buildGapAnalysis } from "../lib/matching/comparisonEngine.js";

test("recommendTemplate picks education-first for early-career profile", () => {
  const computed = {
    total_experience_years: 0.5,
    quantified_achievement_count: 0,
    technical_skill_count: 2,
    has_leadership_experience: false,
    has_projects: true,
    highest_education_level: "bachelors",
    certification_count: 0,
  };
  const rec = recommendTemplate(computed);
  assert.equal(rec.recommended_template, "education-first-early-career");
  assert.ok(rec.reasons.length > 0, "must always give at least one reason");
});

test("recommendTemplate picks experience-led for a seasoned candidate with achievements", () => {
  const computed = {
    total_experience_years: 6,
    quantified_achievement_count: 4,
    technical_skill_count: 3,
    has_leadership_experience: false,
    has_projects: false,
    highest_education_level: "bachelors",
    certification_count: 0,
  };
  const rec = recommendTemplate(computed);
  assert.equal(rec.recommended_template, "experience-led");
});

test("recommendTemplate never leaves reasons empty even for a sparse profile", () => {
  const computed = {
    total_experience_years: 0,
    quantified_achievement_count: 0,
    technical_skill_count: 0,
    has_leadership_experience: false,
    has_projects: false,
    highest_education_level: null,
    certification_count: 0,
  };
  const rec = recommendTemplate(computed);
  assert.ok(rec.reasons.length > 0);
});

const jobResults = [
  {
    job: { id: "1", title: "Business Analyst" },
    eligibilityResult: {
      eligibility: "eligible",
      mandatory_passed: 3,
      mandatory_total: 3,
      preferred_passed: 1,
      preferred_total: 2,
      requirement_results: [
        { requirement_text: "SQL", requirement_type: "skill", status: "pass" },
        { requirement_text: "Power BI", requirement_type: "skill", status: "fail" },
      ],
    },
  },
  {
    job: { id: "2", title: "Data Analyst" },
    eligibilityResult: {
      eligibility: "not_eligible",
      mandatory_passed: 2,
      mandatory_total: 3,
      preferred_passed: 0,
      preferred_total: 1,
      requirement_results: [
        { requirement_text: "SQL", requirement_type: "skill", status: "pass" },
        { requirement_text: "Power BI", requirement_type: "skill", status: "fail" },
        { requirement_text: "5+ years", requirement_type: "experience", status: "fail" },
      ],
    },
  },
];

test("buildComparisonTable produces one row per job with a title and eligibility", () => {
  const table = buildComparisonTable(jobResults);
  assert.equal(table.length, 2);
  assert.equal(table[0].job_title, "Business Analyst");
  assert.equal(table[1].eligibility, "not_eligible");
});

test("buildGapAnalysis finds a requirement failing in more than one job as recurring", () => {
  const gaps = buildGapAnalysis(jobResults);
  assert.equal(gaps.jobs_analyzed, 2);
  assert.equal(gaps.top_gap.requirement, "Power BI");
  assert.equal(gaps.top_gap.missing_in_count, 2);
});

test("buildGapAnalysis lists strongest qualifications from passes", () => {
  const gaps = buildGapAnalysis(jobResults);
  const sql = gaps.strongest_qualifications.find((s) => s.requirement === "SQL");
  assert.equal(sql.matched_in_count, 2);
});
