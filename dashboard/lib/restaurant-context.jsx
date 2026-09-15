"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import axios from "axios"
import { API } from "@/lib/api"
import { setBusinessHours } from "@/lib/business-day"

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
        if (data?.themeColor) root.setProperty("--brand", data.themeColor)
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
