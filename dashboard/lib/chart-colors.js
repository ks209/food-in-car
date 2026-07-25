// Categorical chart palette, anchored to the restaurant's brand colors (set in
// Customize UI) so every chart reads as one system with the rest of the dashboard.
// Order is fixed (never cycled) and interleaves the 3 brand slots with fixed
// accent hues so adjacent series stay distinguishable even for color-blind
// viewers — validated with dataviz's validate_palette.js against the default
// brand trio (#f97316 / #7c3aed / #f59e0b).
export const CHART_CATEGORY_COLORS = [
  "var(--brand, #f97316)",
  "#1baf7a", // aqua
  "var(--brand-secondary, #7c3aed)",
  "#e34948", // red
  "var(--brand-accent, #f59e0b)",
  "#2a78d6", // blue
  "#008300", // green
  "#e87ba4", // magenta
]
