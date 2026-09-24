import test from "node:test";
import assert from "node:assert/strict";
import { classifyRequirement, extractParsedValue, cefrRank } from "../lib/parsing/requirementClassifier.js";

test("classifyRequirement recognizes mandatory language", () => {
  assert.equal(classifyRequirement("Must have 3+ years of experience").classification, "mandatory");
  assert.equal(classifyRequirement("German C1 required").classification, "mandatory");
  assert.equal(classifyRequirement("Minimum of a Bachelor's degree").classification, "mandatory");
});

test("classifyRequirement recognizes preferred language", () => {
  assert.equal(classifyRequirement("Experience with Tableau is a plus").classification, "preferred");
  assert.equal(classifyRequirement("Power BI preferred").classification, "preferred");
});

test("classifyRequirement fails closed to needs_review on ambiguous text", () => {
  assert.equal(classifyRequirement("Familiarity with SQL").classification, "needs_review");
  assert.equal(classifyRequirement("").classification, "needs_review");
});

test("classifyRequirement fails closed when both markers present", () => {
  assert.equal(
    classifyRequirement("Required: Excel; Power BI preferred").classification,
    "needs_review"
  );
});

test("extractParsedValue pulls years for experience type", () => {
  assert.deepEqual(extractParsedValue("At least 3+ years of experience", "experience"), { years: 3 });
  assert.equal(extractParsedValue("Several years of experience", "experience"), null);
});

test("extractParsedValue pulls language + CEFR level", () => {
  assert.deepEqual(extractParsedValue("German C1 required", "language"), { language: "German", level: "C1" });
});

test("extractParsedValue pulls degree wording", () => {
  assert.deepEqual(extractParsedValue("Bachelor's degree required", "education"), { degree: "Bachelor's" });
});

test("cefrRank orders CEFR levels correctly", () => {
  assert.ok(cefrRank("C1") > cefrRank("B2"));
  assert.ok(cefrRank("A1") < cefrRank("B1"));
  assert.equal(cefrRank("not-a-level"), null);
});
