export const CHART_TOOLTIP_STYLE = {
  background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, color: "#fafafa", fontSize: 12,
}

export function formatCurrency(value) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

export const PAYMENT_METHOD_LABELS = { COD: "Cash on Delivery", PHONEPE: "PhonePe" }

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12} ${period}`
})

export function formatHour(hour) {
  return HOUR_LABELS[Number(hour)] ?? `${hour}:00`
}

// Local (not UTC) YYYY-MM-DD — avoids the date rolling over near midnight in IST
export function toLocalDateStr(d) {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export function todayStr() {
  return toLocalDateStr(new Date())
}

// Local calendar-day boundaries (inclusive) as UTC ISO timestamps, for the
// backend's ?from=&to= order query params — safe regardless of server timezone.
export function localDateRange(fromDateStr, toDateStr) {
  return {
    from: new Date(`${fromDateStr}T00:00:00`).toISOString(),
    to: new Date(`${toDateStr}T23:59:59.999`).toISOString(),
  }
}

export function daysAgoStr(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toLocalDateStr(d)
}
