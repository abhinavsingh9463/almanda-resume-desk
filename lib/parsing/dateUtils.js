// Deterministic date/duration helpers.
//
// Part 14 explicitly requires "required years of experience" to be
// computed by deterministic logic, not left to the AI. The AI's job is
// only to *extract* the start/end date strings that appear in the resume
// (e.g. "Jan 2021", "2019-03", "Present") — everything after that is
// pure arithmetic here, so it's testable and never hallucinated.

const MONTHS = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

/**
 * Parses a loosely-formatted resume date string into {year, month} or
 * null if it can't be confidently parsed. Returns null (not a guess) for
 * "Present"/"Current" — caller decides how to treat that.
 */
export function parseResumeDate(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim().toLowerCase();
  if (!s || s === "present" || s === "current" || s === "ongoing") return null;

  // "2021-03", "2021/03"
  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) - 1 };

  // "March 2021", "Mar 2021"
  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && MONTHS[m[1]] !== undefined) return { year: Number(m[2]), month: MONTHS[m[1]] };

  // "2021" only
  m = s.match(/^(\d{4})$/);
  if (m) return { year: Number(m[1]), month: 0 };

  return null;
}

/**
 * Whole months between two {year, month} points, inclusive-ish (start of
 * start month to start of end month). endPoint === null means "present",
 * using the provided `now` (defaults to real now, injectable for tests).
 */
export function monthsBetween(startPoint, endPoint, now = new Date()) {
  if (!startPoint) return null;
  const end = endPoint || { year: now.getFullYear(), month: now.getMonth() };
  const months =
    (end.year - startPoint.year) * 12 + (end.month - startPoint.month);
  return months < 0 ? null : months;
}

/**
 * Sums experience durations without double-counting overlapping periods
 * (e.g. a part-time job held during another job). Input: array of
 * {startPoint, endPoint}. Returns total whole months.
 */
export function totalExperienceMonths(periods, now = new Date()) {
  const intervals = periods
    .map((p) => {
      const start = p.startPoint;
      if (!start) return null;
      const endMonths =
        (p.endPoint ? p.endPoint.year : now.getFullYear()) * 12 +
        (p.endPoint ? p.endPoint.month : now.getMonth());
      const startMonths = start.year * 12 + start.month;
      if (endMonths < startMonths) return null;
      return [startMonths, endMonths];
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);

  if (intervals.length === 0) return 0;

  let merged = [intervals[0]];
  for (const [s, e] of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1] + 1) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged.reduce((sum, [s, e]) => sum + (e - s), 0);
}

export function monthsToYearsLabel(months) {
  if (months == null) return "unknown";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}
