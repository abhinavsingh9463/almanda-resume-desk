import test from "node:test";
import assert from "node:assert/strict";
import { selectEmphasis, renderPlainText } from "../lib/tailoring/resumeTailor.js";

const profile = {
  parsed: {
    full_name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    experiences: [
      { job_title: "Analyst", company: "Acme", description: "Built reports.", evidence: "Built reports at Acme" },
      { job_title: "Intern", company: "Beta", description: "Assisted team.", evidence: "Assisted team at Beta" },
    ],
    achievements: [{ description: "Cut costs 10%", evidence: "Reduced costs by 10%", is_quantified: true }],
    skills: [{ name: "SQL", category: "technical" }],
    educations: [{ degree: "BBA", institution: "State U" }],
    certifications: [],
    projects: [],
    leadership: [],
  },
  computed: {},
};

const templateRecommendation = { section_order: ["header", "summary", "experience", "achievements", "skills", "education"] };

test("selectEmphasis: pins the experience whose evidence matched a passed requirement to the top", () => {
  const eligibilityResult = {
    requirement_results: [{ status: "pass", evidence: "Built reports at Acme", requirement_text: "Reporting experience" }],
    missing_mandatory: ["SQL certification"],
  };
  const emphasis = selectEmphasis(profile, templateRecommendation, eligibilityResult);
  assert.equal(emphasis.ranked_experiences[0].company, "Acme");
  assert.equal(emphasis.ranked_experiences[0]._matched, true);
  assert.deepEqual(emphasis.unaddressed_gaps, ["SQL certification"]);
});

test("selectEmphasis: preserves original resume order when nothing matched for this job", () => {
  const eligibilityResult = { requirement_results: [], missing_mandatory: [] };
  const emphasis = selectEmphasis(profile, templateRecommendation, eligibilityResult);
  assert.equal(emphasis.ranked_experiences[0].company, "Acme");
  assert.equal(emphasis.ranked_experiences[1].company, "Beta");
});

test("selectEmphasis: addressed_gaps only lists requirements that actually passed", () => {
  const eligibilityResult = {
    requirement_results: [
      { status: "pass", evidence: "Built reports at Acme", requirement_text: "Reporting experience" },
      { status: "fail", evidence: null, requirement_text: "CPA required" },
    ],
    missing_mandatory: ["CPA required"],
  };
  const emphasis = selectEmphasis(profile, templateRecommendation, eligibilityResult);
  assert.deepEqual(emphasis.addressed_gaps, ["Reporting experience"]);
});

test("renderPlainText: follows the given section_order and skips empty sections", () => {
  const emphasis = selectEmphasis(profile, templateRecommendation, { requirement_results: [], missing_mandatory: [] });
  const text = renderPlainText({ profile, emphasis, summary: "A concise summary." });
  const summaryIdx = text.indexOf("SUMMARY");
  const experienceIdx = text.indexOf("EXPERIENCE");
  assert.ok(summaryIdx > -1 && experienceIdx > -1 && summaryIdx < experienceIdx);
  assert.ok(!text.includes("CERTIFICATIONS")); // empty section omitted
});

test("renderPlainText: never introduces content beyond what's in the parsed profile", () => {
  const emphasis = selectEmphasis(profile, templateRecommendation, { requirement_results: [], missing_mandatory: [] });
  const text = renderPlainText({ profile, emphasis, summary: null });
  assert.ok(text.includes("Jane Doe"));
  assert.ok(text.includes("Built reports."));
  assert.ok(!text.includes("undefined"));
  assert.ok(!text.includes("SUMMARY")); // no summary was provided
});
