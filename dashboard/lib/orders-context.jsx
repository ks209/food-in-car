"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { toast } from "sonner"
import { API } from "@/lib/api"

const OrdersContext = createContext(null)

// Short ascending 3-note chime — louder and more attention-grabbing than a single beep,
// since this now has to be noticed from any page in the dashboard, not just Orders.
function playChime(ctx) {
  if (!ctx || ctx.state !== "running") return
  const notes = [660, 880, 1046]
  const noteDur = 0.16
  const gap = 0.06
  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * (noteDur + gap)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.4, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + noteDur + 0.02)
  })
}

// Polls orders for the whole dashboard (not just the Orders page) so a new-order
// toast + sound fires no matter which screen the restaurant is looking at.
export function OrdersProvider({ children }) {
  const router = useRouter()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [muted, setMuted] = useState(false)

  const knownIdsRef = useRef(null) // null until first load — avoids alert burst on mount
  const audioCtxRef = useRef(null)
  const mutedRef = useRef(false)

  useEffect(() => {
    const saved = localStorage.getItem("orderAlertsMuted") === "true"
    setMuted(saved)
    mutedRef.current = saved
  }, [])

  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext
          if (Ctx) audioCtxRef.current = new Ctx()
        }
        if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume()
      } catch {}
    }
    unlock()
    window.addEventListener("pointerdown", unlock, { once: true })
    return () => window.removeEventListener("pointerdown", unlock)
  }, [])

  const toggleMuted = () => {
    setMuted((prev) => {
      const next = !prev
      mutedRef.current = next
      localStorage.setItem("orderAlertsMuted", String(next))
      return next
    })
  }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/api/order`, { withCredentials: true })
      const data = res.data

      const incomingIds = data.map((o) => o.id)
      if (knownIdsRef.current === null) {
        knownIdsRef.current = new Set(incomingIds)
      } else {
        const newIds = incomingIds.filter((id) => !knownIdsRef.current.has(id))
        if (newIds.length > 0) {
          toast(newIds.length === 1 ? `New order #${newIds[0]}` : `${newIds.length} new orders`, {
            action: { label: "View", onClick: () => router.push("/dashboard/orders") },
          })
          if (!mutedRef.current) playChime(audioCtxRef.current)
        }
        knownIdsRef.current = new Set(incomingIds)
      }

      setOrders(data)
    } catch {
      // stay quiet on poll failures — a toast every 2s on a flaky connection is worse than silence
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const t = setInterval(fetchOrders, 2000)
    return () => clearInterval(t)
  }, [])

  return (
    <OrdersContext.Provider value={{ orders, loading, muted, toggleMuted, refetch: fetchOrders }}>
      {children}
    </OrdersContext.Provider>
  )
}

export const useOrders = () => useContext(OrdersContext)
