/**
 * Single source of truth for fraud-pattern colors across every chart — the
 * AnalyticsContent line/bar series and the Plotly Sankey's nodes, links and
 * legend swatches all read these (previously three inline hex sets drifted).
 *
 * Raw hex literals rather than CSS custom properties: Plotly paints canvas/
 * SVG attributes that cannot resolve Tailwind theme variables.
 */
export const PATTERN_LINE_COLORS = {
  FANIN: "#7fd1f0",
  FANOUT: "#f6ad55",
  PASSTHROUGH: "#b8bab9",
  CIRCULAR: "#ef6c6c",
} as const;

/** Flows outside the canonical patterns fold into the Sankey's OTHER bucket. */
export const OTHER_PATTERN_COLOR = "#6b7075";
