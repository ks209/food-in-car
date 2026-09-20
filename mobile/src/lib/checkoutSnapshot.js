// The cart is emptied when the customer is sent to PhonePe. If they cancel
// there, "Try again" on the status page puts that exact cart back instead of
// making them rebuild it. Keyed by order id; kept for an hour.
const key = (orderId) => `ck_checkout_${orderId}`
const TTL_MS = 60 * 60 * 1000

export function saveCheckoutSnapshot(orderId, restaurantId, items) {
  try {
    localStorage.setItem(key(orderId), JSON.stringify({ restaurantId, items, savedAt: Date.now() }))
  } catch { /* storage unavailable — Try again just opens an empty menu */ }
}

// Returns { restaurantId, items } once, then forgets it.
export function takeCheckoutSnapshot(orderId) {
  try {
    const raw = localStorage.getItem(key(orderId))
    localStorage.removeItem(key(orderId))
    const snap = raw && JSON.parse(raw)
    if (!snap || !Array.isArray(snap.items) || Date.now() - snap.savedAt > TTL_MS) return null
    return snap
  } catch {
    return null
  }
}

// Once the payment settles either way the snapshot is no longer needed.
export function dropCheckoutSnapshot(orderId) {
  try { localStorage.removeItem(key(orderId)) } catch { /* ignore */ }
}
