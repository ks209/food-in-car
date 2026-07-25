"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Clock, Flame, CheckCircle2, ScanLine, ChefHat, Timer } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
import { useOrders } from "@/lib/orders-context"
import { StatusDot } from "@/components/ui/status-dot"
import { SLA_CRIT_MIN, slaColor, historyTime, prepMinutes } from "@/lib/sla"

function elapsedLabel(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function itemsLine(order) {
  return order.orderItems?.map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—"
}

export function KitchenDisplay() {
  const { orders, refetch, playSlaAlert } = useOrders()
  const [now, setNow] = useState(() => Date.now())
  const alertedIdsRef = useRef(new Set()) // order ids we've already sounded the SLA alarm for

  // Ticks the elapsed-time badges every second — orders/refetch already come from
  // the app-wide 2s poll in OrdersProvider, this just keeps the clock live between polls.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const updateStatus = async (orderId, status) => {
    try {
      await axios.put(`${API}/api/order/${orderId}/status`, { status }, { withCredentials: true })
      toast.success(status === "PREPARING" ? "Order started" : "Order marked ready")
      refetch()
    } catch {
      toast.error("Failed to update order")
    }
  }

  const queued = orders
    .filter((o) => ["PENDING", "PAID"].includes(o.status))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  const preparing = orders
    .filter((o) => o.status === "PREPARING")
    .map((o) => ({ o, startedAt: historyTime(o, "PREPARING") ?? new Date(o.updatedAt).getTime() }))
    .sort((a, b) => a.startedAt - b.startedAt)

  const ready = orders
    .filter((o) => o.status === "READY")
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))

  // Avg prep time today, from any order that has both a PREPARING and READY
  // timestamp in its history (regardless of current status)
  const prepDurations = orders.map(prepMinutes).filter((v) => v !== null)
  const avgPrepMin = prepDurations.length
    ? (prepDurations.reduce((s, v) => s + v, 0) / prepDurations.length).toFixed(1)
    : null

  // Sound the SLA alarm once per order the first time it crosses the critical
  // threshold — not on every tick, and not the same "new order" chime.
  useEffect(() => {
    const stillPreparingIds = new Set(preparing.map(({ o }) => o.id))
    for (const id of alertedIdsRef.current) {
      if (!stillPreparingIds.has(id)) alertedIdsRef.current.delete(id)
    }
    preparing.forEach(({ o, startedAt }) => {
      const mins = (now - startedAt) / 60000
      if (mins >= SLA_CRIT_MIN && !alertedIdsRef.current.has(o.id)) {
        alertedIdsRef.current.add(o.id)
        playSlaAlert()
      }
    })
  }, [now, preparing, playSlaAlert])

  const stats = [
    { title: "Up Next", value: queued.length, icon: Clock, tint: "brand-secondary" },
    { title: "Preparing Now", value: preparing.length, icon: Flame, tint: "brand" },
    { title: "Ready for Pickup", value: ready.length, icon: CheckCircle2, tint: "brand-accent" },
    { title: "Avg Prep Time", value: avgPrepMin ? `${avgPrepMin}m` : "—", icon: Timer, tint: "brand-secondary" },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-800 flex items-center gap-2">
          <ChefHat className="h-5 w-5" /> Kitchen Display
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Live view of what's cooking, refreshed automatically.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={stat.title} className="border-0 shadow-sm anim-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.title}</p>
                <div className={`p-1.5 rounded-lg ${stat.tint}-bg-subtle`}>
                  <stat.icon className={`h-4 w-4 ${stat.tint}-text`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {/* Up next */}
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center justify-between">
              Up Next
              <span className="text-slate-400 font-mono">{queued.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 max-h-[70vh] overflow-y-auto">
            {queued.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-10">Nothing waiting</p>
            ) : (
              queued.map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">#{order.id}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">{itemsLine(order)}</p>
                  <p className="text-xs text-slate-400">
                    {order.guestVehicle ? order.guestVehicle : <span className="text-amber-600 font-medium">Pickup</span>}
                  </p>
                  <Button size="sm" className="w-full text-xs brand-bg text-white"
                    onClick={() => updateStatus(order.id, "PREPARING")}>
                    Start Preparing
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Preparing — the focus lane for the chef/kitchen team */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 brand-text" /> Preparing</span>
              <span className="text-slate-400 font-mono">{preparing.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
            {preparing.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-10 sm:col-span-2">Nothing on the pass right now</p>
            ) : (
              preparing.map(({ o: order, startedAt }) => {
                const elapsedMs = now - startedAt
                const mins = elapsedMs / 60000
                const urgency = slaColor(mins)
                const isCritical = mins >= SLA_CRIT_MIN
                return (
                  <div key={order.id} className={`rounded-xl border p-4 space-y-3 bg-white ${
                    isCritical ? "border-red-300 kds-critical-pulse" : "border-slate-200"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-slate-500">#{order.id}</span>
                      <StatusDot color={urgency} className="font-mono">{elapsedLabel(elapsedMs)}</StatusDot>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 leading-snug">{itemsLine(order)}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {order.user?.customerName || order.guestName || "Guest"}
                        {" · "}
                        {order.guestVehicle ? order.guestVehicle : <span className="text-amber-600 font-medium">Pickup</span>}
                      </p>
                    </div>
                    <Button size="sm" className="w-full text-xs bg-sky-600 hover:bg-sky-700 text-white"
                      onClick={() => updateStatus(order.id, "READY")}>
                      Mark Ready
                    </Button>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Ready for pickup */}
        <Card className="border-0 shadow-sm lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center justify-between">
              Ready
              <span className="text-slate-400 font-mono">{ready.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 max-h-[70vh] overflow-y-auto">
            {ready.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-10">Nothing waiting for pickup</p>
            ) : (
              ready.map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">#{order.id}</span>
                    <span className="text-xs text-sky-600 inline-flex items-center gap-1 font-medium">
                      <ScanLine className="h-3 w-3" /> Awaiting scan
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">{itemsLine(order)}</p>
                  <p className="text-xs text-slate-400">
                    {order.guestVehicle ? order.guestVehicle : <span className="text-amber-600 font-medium">Pickup</span>}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
