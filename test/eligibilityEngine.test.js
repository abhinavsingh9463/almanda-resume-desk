import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRequirement, computeEligibility } from "../lib/eligibility/eligibilityEngine.js";

const baseProfile = {
  parsed: {
    certifications: [{ name: "CPA", evidence: "Certified Public Accountant, 2020" }],
    skills: [
      { name: "SQL", category: "technical", evidence: "Wrote SQL queries for reporting" },
      { name: "German", category: "language", proficiency: "B1", evidence: "German - B1" },
    ],
  },
  computed: {
    total_experience_years: 2,
    highest_education_level: "bachelors",
  },
};

test("evaluateRequirement: experience fail when candidate has fewer years", () => {
  const req = { requirement_type: "experience", parsed_value: { years: 3 }, requirement_text: "3+ years required" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "fail");
});

test("evaluateRequirement: experience pass when candidate meets years", () => {
  const req = { requirement_type: "experience", parsed_value: { years: 2 }, requirement_text: "2+ years required" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "pass");
});

test("evaluateRequirement: certification fail when candidate lacks it (never invents a pass)", () => {
  const req = { requirement_type: "certification", parsed_value: { raw: "CFA required" }, requirement_text: "CFA required" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "fail");
});

test("evaluateRequirement: certification pass on match", () => {
  const req = { requirement_type: "certification", parsed_value: { raw: "CPA certification" }, requirement_text: "CPA certification required" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "pass");
});

test("evaluateRequirement: language fail when candidate level is below required", () => {
  const req = { requirement_type: "language", parsed_value: { language: "German", level: "C1" }, requirement_text: "German C1 required" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "fail");
});

test("evaluateRequirement: language pass when candidate level meets required", () => {
  const req = { requirement_type: "language", parsed_value: { language: "German", level: "A2" }, requirement_text: "German A2 required" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "pass");
});

test("evaluateRequirement: missing parsed_value fails closed to needs_review, never a guess", () => {
  const req = { requirement_type: "experience", parsed_value: null, requirement_text: "Several years needed" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "needs_review");
});

test("evaluateRequirement: location/work_authorization always needs_review (no data source yet)", () => {
  const req = { requirement_type: "location", parsed_value: null, requirement_text: "Must be based in the EU" };
  assert.equal(evaluateRequirement(req, baseProfile).status, "needs_review");
});

test("computeEligibility: not_eligible when any mandatory fails", () => {
  const requirements = [
    { requirement_type: "experience", classification: "mandatory", parsed_value: { years: 5 }, requirement_text: "5+ years" },
  ];
  const result = computeEligibility(requirements, baseProfile);
  assert.equal(result.eligibility, "not_eligible");
  assert.deepEqual(result.missing_mandatory, ["5+ years"]);
});

test("computeEligibility: needs_review when a mandatory item is unresolved but none failed", () => {
  const requirements = [
    { requirement_type: "location", classification: "mandatory", parsed_value: null, requirement_text: "Must be EU-based" },
  ];
  const result = computeEligibility(requirements, baseProfile);
  assert.equal(result.eligibility, "needs_review");
});

test("computeEligibility: eligible when all mandatory pass", () => {
  const requirements = [
    { requirement_type: "experience", classification: "mandatory", parsed_value: { years: 2 }, requirement_text: "2+ years" },
    { requirement_type: "certification", classification: "mandatory", parsed_value: { raw: "CPA" }, requirement_text: "CPA required" },
  ];
  const result = computeEligibility(requirements, baseProfile);
  assert.equal(result.eligibility, "eligible");
  assert.equal(result.mandatory_passed, 2);
});
