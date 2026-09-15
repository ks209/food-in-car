// The restaurant's opening hours and the "business day" they define — mirrors
// backend/utils/businessHours.js, but in the browser's local time like the
// rest of the dashboard's date helpers.
//
// When closing is after midnight (open 18:00, close 02:00) the business day
// ends at closing time, so a 1 AM order still counts as "today" and the
// dashboard doesn't reset at midnight mid-service.
//
// The hours are module state rather than props: every date helper in
// lib/format.js consults them, so Orders, Overview, Analytics and the Kitchen
// all agree on what "today" means without each threading the restaurant
// through. RestaurantProvider sets them from /me; they're also cached so a
// page that computes its initial "today" before /me returns still gets it right.

const STORAGE_KEY = "businessHours"
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

let hours = { openingTime: null, closingTime: null }
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
  if (saved) hours = saved
} catch {}

export function parseTime(value) {
  const m = TIME_RE.exec(value || "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function setBusinessHours(openingTime, closingTime) {
  hours = { openingTime: openingTime || null, closingTime: closingTime || null }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hours)) } catch {}
}

export function getBusinessHours() {
  return hours
}

export function hasHours() {
  return parseTime(hours.openingTime) !== null && parseTime(hours.closingTime) !== null
}

// Minutes after local midnight at which the business day starts.
export function dayStartMinutes() {
  if (!hasHours()) return 0
  const open = parseTime(hours.openingTime)
  const close = parseTime(hours.closingTime)
  return close < open ? close : 0
}

export function isWithinHours(date = new Date()) {
  if (!hasHours()) return true
  const open = parseTime(hours.openingTime)
  const close = parseTime(hours.closingTime)
  const now = date.getHours() * 60 + date.getMinutes()
  return open < close ? now >= open && now < close : now >= open || now < close
}

export function formatTime12(value) {
  const mins = parseTime(value)
  if (mins === null) return ""
  const h = Math.floor(mins / 60)
  const period = h < 12 ? "AM" : "PM"
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mins % 60).padStart(2, "0")} ${period}`
}
