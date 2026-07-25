// Kitchen SLA thresholds — minutes an order can sit in PREPARING before it's
// flagged. Shared by the Kitchen Display's live timers and the Analytics
// prep-time trends so both agree on what "late" means.
export const SLA_WARN_MIN = 8
export const SLA_CRIT_MIN = 15

export const SLA_COLORS = { ok: "#94a3b8", warn: "#f59e0b", crit: "#ef4444" }

export function slaColor(minutes) {
  if (minutes >= SLA_CRIT_MIN) return SLA_COLORS.crit
  if (minutes >= SLA_WARN_MIN) return SLA_COLORS.warn
  return SLA_COLORS.ok
}

// Timestamp (ms) an order first entered the given status, or null if it never did.
export function historyTime(order, status) {
  const entry = order.orderStatusHistory?.find((h) => h.status === status)
  return entry ? new Date(entry.updatedAt).getTime() : null
}

// Minutes an order spent in PREPARING, or null if it hasn't reached READY yet.
export function prepMinutes(order) {
  const start = historyTime(order, "PREPARING")
  const end = historyTime(order, "READY")
  if (!start || !end || end < start) return null
  return (end - start) / 60000
}
