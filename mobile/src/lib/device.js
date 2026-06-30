// A best-effort, persistent per-device identifier sent with each order (stored as
// Order.deviceKey) for light fraud/security correlation. Not a hard security control —
// it's a localStorage UUID the user could clear.
const KEY = "fic_device_key"

export function getDeviceKey() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = (crypto.randomUUID?.() || `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    // localStorage unavailable (private mode) — fall back to a volatile id
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}
