"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import axios from "axios"
import { API } from "@/lib/api"
import { setBusinessHours } from "@/lib/business-day"

// Near-black or white, whichever reads better on `hex` — WCAG relative
// luminance, the same rule the mobile app's theme uses.
function contrastOn(hex) {
  const h = String(hex).trim().replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  if (!/^[0-9a-f]{6}$/i.test(full)) return "#0f172a" // unparseable — match the CSS default
  const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contrast ratio against white vs. against #0f172a (luminance ≈ 0.0097);
  // pick whichever is higher.
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.0597) ? "#ffffff" : "#0f172a"
}

const hexToRgb = (hex) => {
  const h = String(hex).trim().replace("#", "")
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

const luminanceOf = (rgb) => {
  const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = rgb.map((v) => channel(v / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

// A version of the brand colour dark enough to carry white text — a selected
// filter chip in the brand's own yellow/mint reads as "not selected" at a
// glance, whatever text colour sits on it.
function selectedChipColors(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return { bg: "#0f172a", fg: "#ffffff" }
  let bg = rgb
  // Mix toward black until it's dark enough for white text (contrast ≥ 4.5).
  while (luminanceOf(bg) > 0.175) bg = bg.map((v) => v * 0.82)
  return { bg: toHex(bg), fg: "#ffffff" }
}

const RestaurantContext = createContext(null)

const RestaurantRefreshContext = createContext(() => {})

export function RestaurantProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null)

  const load = useCallback(() => {
    return axios
      .get(`${API}/api/restaurant/me`, { withCredentials: true })
      .then((r) => {
        const data = r.data
        // Before setRestaurant, so screens re-rendering off the new restaurant
        // already compute "today" with these hours.
        setBusinessHours(data?.openingTime, data?.closingTime)
        setRestaurant(data)
        const root = document.documentElement.style
        if (data?.themeColor) {
          root.setProperty("--brand", data.themeColor)
          // Text that stays readable ON the brand colour. White is unreadable
          // on a light brand (yellow, amber, mint), which is what made the
          // selected filter chips wash out — so pick per brightness.
          root.setProperty("--brand-contrast", contrastOn(data.themeColor))
          const chip = selectedChipColors(data.themeColor)
          root.setProperty("--brand-chip-bg", chip.bg)
          root.setProperty("--brand-chip-fg", chip.fg)
        }
        if (data?.secondaryColor) root.setProperty("--brand-secondary", data.secondaryColor)
        if (data?.accentColor) root.setProperty("--brand-accent", data.accentColor)
      })
      .catch((err) => {
        // Deactivated by support while signed in — the API now rejects every
        // request, so drop the session and send them back to the login page,
        // which explains why.
        if (err?.response?.data?.deactivated) {
          axios.post(`${API}/api/restaurant/logout`, {}, { withCredentials: true })
            .catch(() => {})
            .finally(() => { window.location.href = "/?deactivated=1" })
        }
      })
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <RestaurantContext.Provider value={restaurant}>
      <RestaurantRefreshContext.Provider value={load}>
        {children}
      </RestaurantRefreshContext.Provider>
    </RestaurantContext.Provider>
  )
}

export const useRestaurant = () => useContext(RestaurantContext)

// Re-reads /me into the shared context. Settings calls this after saving so
// anything rendered off this data — the ordering QR code above all — reflects
// the change without a page reload.
export const useRefreshRestaurant = () => useContext(RestaurantRefreshContext)
