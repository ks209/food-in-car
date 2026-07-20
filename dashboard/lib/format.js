export const CHART_TOOLTIP_STYLE = {
  background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, color: "#fafafa", fontSize: 12,
}

export function formatCurrency(value) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const period = h < 12 ? "AM" : "PM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12} ${period}`
})

export function formatHour(hour) {
  return HOUR_LABELS[Number(hour)] ?? `${hour}:00`
}
