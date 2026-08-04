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

// Curated font choices, set via the Customize UI tab in the dashboard. Google
// Fonts for all of these are preloaded in mobile/index.html. Kept deliberately
// distinct from each other (no two entries sharing the same visual register) —
// "outfit" was dropped for being nearly indistinguishable from "manrope".
export const FONT_MAP = {
  manrope: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  poppins: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  playfair: "'Playfair Display', Georgia, serif",
  spacegrotesk: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fraunces: "'Fraunces', Georgia, serif",
}

function setColorVars(root, varName, hex, fallback) {
  const valid = hexToRgb(hex) ? hex : fallback
  const rgb = hexToRgb(valid)
  root.style.setProperty(`--${varName}`, valid)
  root.style.setProperty(`--${varName}-rgb`, `${rgb.r},${rgb.g},${rgb.b}`)
  return valid
}

// Apply a restaurant's full theme (colors, font, card style) as CSS variables /
// attributes on <html>. Tints/shades are derived so surfaces stay soft. Accepts
// either a restaurant object (preferred — full theme) or a bare hex string
// (legacy callers / the no-restaurant-in-scope default) for the primary color.
export function applyTheme(restaurantOrHex) {
  const root = document.documentElement
  const r = typeof restaurantOrHex === "string" ? { themeColor: restaurantOrHex } : (restaurantOrHex || {})

  const primary = setColorVars(root, "primary", r.themeColor, DEFAULT_HEX)
  const primaryRgb = hexToRgb(primary)
  root.style.setProperty("--primary-dark", shade(primary, 18))
  root.style.setProperty("--primary-tint", `rgba(${primaryRgb.r},${primaryRgb.g},${primaryRgb.b},0.20)`)
  root.style.setProperty("--primary-light", `rgba(${primaryRgb.r},${primaryRgb.g},${primaryRgb.b},0.12)`)

  setColorVars(root, "secondary", r.secondaryColor, "#7c3aed")
  setColorVars(root, "accent", r.accentColor, "#f59e0b")

  root.style.setProperty("--font-display", FONT_MAP[r.fontFamily] || FONT_MAP.manrope)
  root.setAttribute("data-card-style", r.cardStyle === "sharp" ? "sharp" : "rounded")
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
        cache.set(restaurantId, r.data)
        if (!cancelled) applyTheme(r.data)
      })
      .catch(() => { if (!cancelled) applyTheme(DEFAULT_HEX) })
    return () => { cancelled = true }
  }, [restaurantId])
}
