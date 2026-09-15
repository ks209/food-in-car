import { dayStartMinutes } from "@/lib/business-day"

export const CHART_TOOLTIP_STYLE = {
  background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 10, color: "#fafafa", fontSize: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
}

// Pair with every <Tooltip contentStyle={CHART_TOOLTIP_STYLE} .../> — lifts it
// above any other stacked/positioned element on the page (sidebar, dialogs,
// sticky headers) that might otherwise sit on top of it.
export const CHART_TOOLTIP_WRAPPER_STYLE = { zIndex: 200 }

// Recharts renders each tooltip row with its own inline color that defaults to
// that data series' own color (the bar/line's fill) — NOT contentStyle.color,
// which only paints the outer box. A dark series color (purple, navy, etc.)
// against the dark tooltip background reads as barely-legible dark-on-dark.
// Pair this with contentStyle on every <Tooltip> so the value/label rows use
// the same light, high-contrast text regardless of that series' own color.
export const CHART_TOOLTIP_ITEM_STYLE = { color: "#fafafa" }
export const CHART_TOOLTIP_LABEL_STYLE = { color: "#fafafa", fontWeight: 600, marginBottom: 4 }

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

// The restaurant business day (see lib/business-day.js) a moment belongs to —
// the calendar date, unless closing is after midnight and it's before closing.
export function businessDateStr(date) {
  return toLocalDateStr(new Date(new Date(date).getTime() - dayStartMinutes() * 60000))
}

export function todayStr() {
  return businessDateStr(new Date())
}

// Business-day boundaries (inclusive) as UTC ISO timestamps, for the backend's
// ?from=&to= order query params — safe regardless of server timezone. Plain
// local midnight-to-midnight unless the restaurant closes after midnight.
export function localDateRange(fromDateStr, toDateStr) {
  const shiftMs = dayStartMinutes() * 60000
  return {
    from: new Date(new Date(`${fromDateStr}T00:00:00`).getTime() + shiftMs).toISOString(),
    to: new Date(new Date(`${toDateStr}T23:59:59.999`).getTime() + shiftMs).toISOString(),
  }
}

export function daysAgoStr(n) {
  const d = new Date(`${todayStr()}T12:00:00`)
  d.setDate(d.getDate() - n)
  return toLocalDateStr(d)
}
