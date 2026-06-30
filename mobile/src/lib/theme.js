import { useEffect } from "react"
import { restaurantApi } from "../api"

// Premium emerald used when no restaurant is in scope (e.g. the Landing page).
export const DEFAULT_HEX = "#10b981"

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim())
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

// Mix a colour toward white (percent > 0) or black (percent < 0). percent in -100..100.
function shade(hex, percent) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const t = percent < 0 ? 0 : 255
  const p = Math.abs(percent) / 100
  const ch = (c) => Math.round((t - c) * p + c)
  const toHex = (c) => c.toString(16).padStart(2, "0")
  return `#${toHex(ch(rgb.r))}${toHex(ch(rgb.g))}${toHex(ch(rgb.b))}`
}

// Apply a restaurant's brand colour as CSS variables on <html>. The accent is used
// sparingly; tints/shades are derived so surfaces stay soft.
export function applyTheme(hex) {
  const root = document.documentElement
  const valid = hexToRgb(hex) ? hex : DEFAULT_HEX
  const rgb = hexToRgb(valid)
  root.style.setProperty("--primary", valid)
  // On dark, hover lightens the accent; tints are translucent so they sit on dark surfaces.
  root.style.setProperty("--primary-dark", shade(valid, 18))
  root.style.setProperty("--primary-tint", `rgba(${rgb.r},${rgb.g},${rgb.b},0.20)`)
  root.style.setProperty("--primary-light", `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`)
  root.style.setProperty("--primary-rgb", `${rgb.r},${rgb.g},${rgb.b}`)
}

// Dedupe restaurant fetches across pages within a session.
const cache = new Map()

// Apply the theme for a restaurant-scoped page. Pass the id from the route param.
export function useRestaurantTheme(restaurantId) {
  useEffect(() => {
    if (!restaurantId) { applyTheme(DEFAULT_HEX); return }

    if (cache.has(restaurantId)) {
      applyTheme(cache.get(restaurantId))
      return
    }
    let cancelled = false
    restaurantApi.get(restaurantId)
      .then((r) => {
        const hex = r.data?.themeColor || DEFAULT_HEX
        cache.set(restaurantId, hex)
        if (!cancelled) applyTheme(hex)
      })
      .catch(() => { if (!cancelled) applyTheme(DEFAULT_HEX) })
    return () => { cancelled = true }
  }, [restaurantId])
}
