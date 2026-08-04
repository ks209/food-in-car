// Kitchen SLA thresholds — minutes an order can sit in PREPARING before it's
// flagged. Configurable per restaurant (Settings → Kitchen SLA); these are
// only the fallback used before that restaurant data has loaded.
export const SLA_WARN_MIN = 8
export const SLA_CRIT_MIN = 15

export const SLA_COLORS = { ok: "#94a3b8", warn: "#f59e0b", crit: "#ef4444" }

export function slaColor(minutes, warnMin = SLA_WARN_MIN, critMin = SLA_CRIT_MIN) {
  if (minutes >= critMin) return SLA_COLORS.crit
  if (minutes >= warnMin) return SLA_COLORS.warn
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

// Minutes from order creation to COMPLETED — the customer's actual wait, not
// just the kitchen's PREPARING→READY window. Only meaningful once an order is
// actually done, so null for anything still in flight.
export function totalMinutes(order) {
  if (order.status !== "COMPLETED") return null
  const start = new Date(order.createdAt).getTime()
  const end = historyTime(order, "COMPLETED")
  if (!start || !end || end < start) return null
  return (end - start) / 60000
}
