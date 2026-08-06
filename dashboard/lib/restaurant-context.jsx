"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import axios from "axios"
import { API } from "@/lib/api"

const RestaurantContext = createContext(null)

const RestaurantRefreshContext = createContext(() => {})

export function RestaurantProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null)

  const load = useCallback(() => {
    return axios
      .get(`${API}/api/restaurant/me`, { withCredentials: true })
      .then((r) => {
        const data = r.data
        setRestaurant(data)
        const root = document.documentElement.style
        if (data?.themeColor) root.setProperty("--brand", data.themeColor)
        if (data?.secondaryColor) root.setProperty("--brand-secondary", data.secondaryColor)
        if (data?.accentColor) root.setProperty("--brand-accent", data.accentColor)
      })
      .catch(() => {})
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
