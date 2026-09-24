import test from "node:test";
import assert from "node:assert/strict";
import { parseResumeDate, monthsBetween, totalExperienceMonths } from "../lib/parsing/dateUtils.js";

test("parseResumeDate handles common formats", () => {
  assert.deepEqual(parseResumeDate("March 2021"), { year: 2021, month: 2 });
  assert.deepEqual(parseResumeDate("Mar 2021"), { year: 2021, month: 2 });
  assert.deepEqual(parseResumeDate("2021-03"), { year: 2021, month: 2 });
  assert.deepEqual(parseResumeDate("2021"), { year: 2021, month: 0 });
  assert.equal(parseResumeDate("Present"), null);
  assert.equal(parseResumeDate("garbage text"), null);
  assert.equal(parseResumeDate(null), null);
});

test("monthsBetween computes whole months, treating null end as now", () => {
  const now = new Date(2026, 5, 1); // June 2026
  assert.equal(monthsBetween({ year: 2024, month: 0 }, { year: 2024, month: 6 }), 6);
  assert.equal(monthsBetween({ year: 2024, month: 0 }, null, now), 29);
  assert.equal(monthsBetween(null, { year: 2024, month: 0 }), null);
});

test("totalExperienceMonths merges overlapping periods instead of double-counting", () => {
  const now = new Date(2026, 0, 1);
  const periods = [
    { startPoint: { year: 2020, month: 0 }, endPoint: { year: 2021, month: 0 } }, // 12mo
    { startPoint: { year: 2020, month: 6 }, endPoint: { year: 2020, month: 9 } }, // fully overlaps above
    { startPoint: { year: 2022, month: 0 }, endPoint: null }, // to "now" = Jan 2026 = 48mo
  ];
  // 12 (merged 2020-2021) + 48 (2022-2026) = 60
  assert.equal(totalExperienceMonths(periods, now), 60);
});

test("totalExperienceMonths ignores unparseable (null start) periods", () => {
  const periods = [{ startPoint: null, endPoint: { year: 2021, month: 0 } }];
  assert.equal(totalExperienceMonths(periods), 0);
});
