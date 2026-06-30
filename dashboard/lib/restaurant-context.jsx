"use client"

import { createContext, useContext, useEffect, useState } from "react"
import axios from "axios"
import { API } from "@/lib/api"

const RestaurantContext = createContext(null)

export function RestaurantProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null)

  useEffect(() => {
    axios
      .get(`${API}/api/restaurant/me`, { withCredentials: true })
      .then((r) => {
        const data = r.data
        setRestaurant(data)
        if (data?.themeColor) {
          document.documentElement.style.setProperty("--brand", data.themeColor)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <RestaurantContext.Provider value={restaurant}>
      {children}
    </RestaurantContext.Provider>
  )
}

export const useRestaurant = () => useContext(RestaurantContext)
