// Baseline + comparison helpers shared by Overview and Analytics. A metric
// without a baseline is trivia — everything that shows a number should be able
// to say "compared to what".

import { toLocalDateStr } from "@/lib/format"

const DAY_MS = 24 * 60 * 60 * 1000

// null = no comparison possible (missing data, or both zero); Infinity = went
// from zero/nothing to something ("New")
export function pctChange(current, previous) {
  if (current == null || previous == null) return null
  if (previous === 0) return current === 0 ? null : Infinity
  return ((current - previous) / previous) * 100
}

// Percentage-POINT difference — the honest comparison for a metric that is
// already a percentage (completion rate, cancellation rate, % returning).
// A completion rate moving 90% → 95% is "+5 pts"; reporting it as the "+5.6%"
// a relative change would give is a different, misleading claim.
export function pointChange(current, previous) {
  if (current == null || previous == null) return null
  return current - previous
}

// Restaurant demand is strongly day-of-week seasonal — Sunday lunch and Monday
// lunch are different businesses. Comparing today against *yesterday* mostly
// measures which weekday it is, so every day-level comparison uses the same
// weekday one week back instead.
export function sameWeekdayLastWeek(date = new Date()) {
  return new Date(date.getTime() - 7 * DAY_MS)
}

export function weekdayLabel(date) {
  return date.toLocaleDateString([], { weekday: "short" })
}

// The equal-length window immediately before [fromStr, toStr], as local
// YYYY-MM-DD strings — a 7-day range compares against the 7 days before it.
export function previousPeriod(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00`)
  const to = new Date(`${toStr}T00:00:00`)
  const days = Math.max(1, Math.round((to - from) / DAY_MS) + 1)
  const prevTo = new Date(from.getTime() - DAY_MS)
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * DAY_MS)
  return { from: toLocalDateStr(prevFrom), to: toLocalDateStr(prevTo), days }
}

// "8 Jul – 14 Jul" — shown next to a delta so it's never ambiguous what the
// comparison is against.
export function formatRangeLabel(fromStr, toStr) {
  const opts = { day: "numeric", month: "short" }
  const from = new Date(`${fromStr}T00:00:00`).toLocaleDateString([], opts)
  const to = new Date(`${toStr}T00:00:00`).toLocaleDateString([], opts)
  return from === to ? from : `${from} – ${to}`
}
