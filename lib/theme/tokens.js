// Design tokens shared across the whole app.
// Pulled directly from the original pages/index.js so every new screen
// (Career Desk, Recruiting Desk) matches the existing Review Desk look.
// Do not fork these values per-page — import from here.

export const FONT_SERIF = "'Source Serif Pro', Georgia, 'Times New Roman', serif";
export const FONT_MONO = "'IBM Plex Mono', 'Courier New', monospace";

export const COLORS = {
  paper: "#EFEAE0",
  paperDark: "#E4DDCD",
  ink: "#232620",
  inkSoft: "#5B5A50",
  manila: "#C9A876",
  manilaDark: "#A9885C",
  stamp: "#B5472F",
  approve: "#4C7A5D",
  line: "#D8D0BE",
};

// Extra semantic colors needed by the new eligibility / gap-analysis screens.
// Kept in the same family as COLORS above (no new hues introduced).
export const STATUS_COLORS = {
  eligible: COLORS.approve,
  not_eligible: COLORS.stamp,
  needs_review: COLORS.manilaDark,
};
