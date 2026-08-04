// Pointer to the customer's most recent order, kept in localStorage so a guest
// (no login) who wanders back to the menu — or reopens the app later — still
// gets reminded they have an order in progress. Just {restaurantId, orderId,
// code}; the actual status is always re-checked against the server, never
// trusted from storage.
const KEY = "fic_active_order"

export function saveActiveOrder({ restaurantId, orderId, code }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ restaurantId, orderId, code }))
  } catch {
    // localStorage unavailable (private mode) — the reminder just won't show, no big deal
  }
}

export function getActiveOrder() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearActiveOrder() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
