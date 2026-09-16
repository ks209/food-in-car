// Primitives shared by every analytics surface — the restaurant dashboard's
// /api/analytics/summary and the admin panel's /api/venue/:id/analytics.
//
// These live here rather than in either router because the two MUST agree.
// If venue day-bucketing used a different timezone convention than the
// restaurant dashboard, the same order would land on different calendar days
// in the two reports and nobody would be able to reconcile them.

// Only COMPLETED orders are real revenue — cancelled/not-fulfilled/in-flight
// orders don't count. Mirrors the same constants on the dashboard.
export const REVENUE_STATES = ['COMPLETED'];
export const NON_SALE_STATES = ['CANCELLED', 'NOT_FULFILLED'];
export const RESOLVED_STATES = ['COMPLETED', ...NON_SALE_STATES];

export const DAY_MS = 24 * 60 * 60 * 1000;

// Service windows, covering all 24 hours so every order lands in exactly one.
// `to` is exclusive; Late wraps past midnight.
export const DAYPARTS = [
  { key: 'morning',   label: 'Morning',   from: 5,  to: 11 },
  { key: 'lunch',     label: 'Lunch',     from: 11, to: 16 },
  { key: 'afternoon', label: 'Afternoon', from: 16, to: 19 },
  { key: 'dinner',    label: 'Dinner',    from: 19, to: 23 },
  { key: 'late',      label: 'Late',      from: 23, to: 5  },
];

export const daypartFor = (hour) =>
  DAYPARTS.find((d) => (d.from < d.to ? hour >= d.from && hour < d.to : hour >= d.from || hour < d.to));

// ── Local-time helpers ────────────────────────────────────────────────────────
// Day bucketing has to happen in the viewer's local timezone, not the server's
// — a Node process in UTC would otherwise split an IST evening service across
// two calendar days. The client sends its offset (minutes east of UTC, i.e.
// -getTimezoneOffset()), so this matches exactly what the browser used to
// compute for itself.
export const shifted = (date, offsetMin) => new Date(new Date(date).getTime() + offsetMin * 60000);
export const localDateStr = (date, offsetMin) => shifted(date, offsetMin).toISOString().slice(0, 10);
export const localHour = (date, offsetMin) => shifted(date, offsetMin).getUTCHours();

// Local midnight (start) / end-of-day for a YYYY-MM-DD string, as real UTC instants.
export const startOfLocalDay = (dateStr, offsetMin) => new Date(Date.parse(`${dateStr}T00:00:00Z`) - offsetMin * 60000);
export const endOfLocalDay = (dateStr, offsetMin) => new Date(Date.parse(`${dateStr}T23:59:59.999Z`) - offsetMin * 60000);

export function addDays(dateStr, n) {
  const d = new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromStr, toStr) {
  return Math.max(1, Math.round((Date.parse(`${toStr}T00:00:00Z`) - Date.parse(`${fromStr}T00:00:00Z`)) / DAY_MS) + 1);
}

// ── Stats ─────────────────────────────────────────────────────────────────────
// Linear-interpolated percentile over an already-sorted ascending array.
// p50 is the median; p90 is the number that actually drives complaints, which
// an average quietly hides.
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export const mean = (nums) => (nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null);

export function statsFor(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    avg: mean(sorted),
  };
}
