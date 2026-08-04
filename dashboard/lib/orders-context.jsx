"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import axios from "axios"
import { toast } from "sonner"
import { API } from "@/lib/api"
import { todayStr, localDateRange } from "@/lib/format"

const OrdersContext = createContext(null)

// Plays a short sequence of notes through the shared (already-unlocked) AudioContext.
function playTone(ctx, notes, { type = "sine", noteDur = 0.16, gap = 0.06, volume = 0.4 } = {}) {
  if (!ctx || ctx.state !== "running") return
  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * (noteDur + gap)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(volume, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + noteDur + 0.02)
  })
}

// Ascending 3-note chime — louder and more attention-grabbing than a single beep,
// since this now has to be noticed from any page in the dashboard, not just Orders.
const playChime = (ctx) => playTone(ctx, [660, 880, 1046])

// Two short, lower, harsher beeps — deliberately distinct from the new-order chime
// so a kitchen-display SLA breach doesn't get mistaken for "new order arrived".
const playAlertTone = (ctx) => playTone(ctx, [440, 440], { type: "square", noteDur: 0.11, gap: 0.09, volume: 0.25 })

// Polls TODAY's orders for the whole dashboard (not just the Orders page) so a
// new-order toast + sound fires no matter which screen the restaurant is looking
// at. Bounded to today server-side — a new order is always created today, so
// there's no need to keep re-fetching the full order history every 2s just to
// detect arrivals. The Orders page itself does its own separately-ranged fetch.
export function OrdersProvider({ children }) {
  const router = useRouter()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [muted, setMuted] = useState(false)

  const knownIdsRef = useRef(null) // null until first load — avoids alert burst on mount
  const dayRef = useRef(todayStr()) // detects midnight rollover so we don't false-alert
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
      // Piggyback the desktop-notification permission ask on the same first
      // gesture — browsers require user activation for this call anyway, and
      // a separate prompt/button would just be one more thing to click.
      try {
        if (window.Notification && Notification.permission === "default") Notification.requestPermission()
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
      const today = todayStr()
      const dayChanged = today !== dayRef.current
      const { from, to } = localDateRange(today, today)
      const res = await axios.get(`${API}/api/order`, { params: { from, to }, withCredentials: true })
      const data = res.data

      const incomingIds = data.map((o) => o.id)
      if (knownIdsRef.current === null || dayChanged) {
        knownIdsRef.current = new Set(incomingIds) // first load, or a fresh day — seed, don't alert
      } else {
        const newOrders = data.filter((o) => !knownIdsRef.current.has(o.id))
        if (newOrders.length > 0) {
          const title = newOrders.length === 1
            ? `New order #${newOrders[0].dailyOrderNumber ?? newOrders[0].id}`
            : `${newOrders.length} new orders`
          toast(title, {
            action: { label: "View", onClick: () => router.push("/dashboard/orders") },
          })
          if (!mutedRef.current) {
            playChime(audioCtxRef.current)
            // Only when the tab is actually backgrounded — toast + chime already
            // cover the "tab open and focused" case, a desktop notification on
            // top of those would just be noisy.
            if (document.hidden && window.Notification?.permission === "granted") {
              const notif = new Notification(title, {
                body: "Tap to view in the dashboard",
                icon: "/carkhanaalogo.png",
                tag: "new-order",
              })
              notif.onclick = () => {
                window.focus()
                router.push("/dashboard/orders")
              }
            }
          }
        }
        knownIdsRef.current = new Set(incomingIds)
      }
      dayRef.current = today

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

  // Shared with the Kitchen Display: one alert respects the same mute toggle and
  // unlocked AudioContext as the new-order chime, instead of each page managing its own.
  const playSlaAlert = () => { if (!mutedRef.current) playAlertTone(audioCtxRef.current) }

  // Optimistic single-order patch — lets a consumer (Kitchen Display) reflect a
  // status change immediately on click instead of waiting out the PUT + next poll,
  // which otherwise leaves the old status visible for a beat.
  const patchOrder = (orderId, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)))
  }

  return (
    <OrdersContext.Provider value={{ orders, loading, muted, toggleMuted, refetch: fetchOrders, playSlaAlert, patchOrder }}>
      {children}
    </OrdersContext.Provider>
  )
}

export const useOrders = () => useContext(OrdersContext)
