"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, IndianRupee, Clock, ChefHat, ArrowUp, ArrowDown, Minus } from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"
import axios from "axios"
import Link from "next/link"

import { API } from "@/lib/api"
import { CHART_TOOLTIP_STYLE, formatCurrency } from "@/lib/format"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/status"
import { StatusDot } from "@/components/ui/status-dot"

// Only COMPLETED orders are real revenue — cancelled/not-fulfilled/in-flight orders don't count
const REVENUE_STATES = ["COMPLETED"]
const ACTIVE_STATES = ["PENDING", "PAID", "PREPARING", "READY"]
const DAY_MS = 24 * 60 * 60 * 1000
const RECENT_ORDERS_LIMIT = 12

// The status an order had at a given point in time, reconstructed from its
// history — lets "Active Orders" compare against a real snapshot of yesterday
// instead of just today's raw counts (which wouldn't mean much for a live gauge).
function statusAt(order, timestamp) {
  const history = [...(order.orderStatusHistory || [])].sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
  let status = null
  for (const h of history) {
    if (new Date(h.updatedAt).getTime() > timestamp) break
    status = h.status
  }
  return status
}

// null = nothing to compare (both zero); Infinity = went from zero to something ("New")
function pctChange(current, previous) {
  if (previous === 0) return current === 0 ? null : Infinity
  return ((current - previous) / previous) * 100
}

function ChangeBadge({ current, previous }) {
  const change = pctChange(current, previous)
  if (change === null) return null
  if (change === Infinity) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
        <ArrowUp className="h-3 w-3" /> New
      </span>
    )
  }
  const rounded = Math.round(change)
  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-400">
        <Minus className="h-3 w-3" /> 0%
      </span>
    )
  }
  const positive = rounded > 0
  const Icon = positive ? ArrowUp : ArrowDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? "text-emerald-600" : "text-red-500"}`}>
      <Icon className="h-3 w-3" /> {Math.abs(rounded)}%
    </span>
  )
}

export function DashboardOverview() {
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])

  useEffect(() => {
    axios.get(`${API}/api/order`, { withCredentials: true }).then((r) => setOrders(r.data)).catch(() => {})
    axios.get(`${API}/api/menu/`, { withCredentials: true }).then((r) => setMenuItems(r.data)).catch(() => {})
  }, [])

  const now = Date.now()
  const yesterdayMoment = now - DAY_MS

  const today = new Date().toDateString()
  const yesterdayStr = new Date(yesterdayMoment).toDateString()

  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today)
  const yesterdayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === yesterdayStr)

  const revenueToday = todayOrders.filter((o) => REVENUE_STATES.includes(o.status)).reduce((sum, o) => sum + o.totalAmount, 0)
  const revenueYesterday = yesterdayOrders.filter((o) => REVENUE_STATES.includes(o.status)).reduce((sum, o) => sum + o.totalAmount, 0)

  const activeOrders = orders.filter((o) => ACTIVE_STATES.includes(o.status)).length
  // Orders that existed yesterday at this same moment, and were active then
  const activeOrdersYesterday = orders.filter((o) => {
    if (new Date(o.createdAt).getTime() > yesterdayMoment) return false
    return ACTIVE_STATES.includes(statusAt(o, yesterdayMoment))
  }).length

  // Exclude soft-deleted items (isActive === false); split the rest by availability
  const liveItems = menuItems.filter((m) => m.isActive !== false)
  const activeItems = liveItems.filter((m) => m.available).length
  const inactiveItems = liveItems.filter((m) => !m.available).length
  // Approximation (no deletion history to work from): items already on the
  // menu by this time yesterday, of what's currently live.
  const liveItemsYesterday = liveItems.filter((m) => new Date(m.createdAt).getTime() <= yesterdayMoment).length

  const stats = [
    { title: "Orders Today", value: todayOrders.length, icon: ShoppingBag, tint: "brand", current: todayOrders.length, previous: yesterdayOrders.length },
    { title: "Revenue Today", value: formatCurrency(revenueToday), icon: IndianRupee, tint: "brand-secondary", current: revenueToday, previous: revenueYesterday },
    { title: "Active Orders", value: activeOrders, icon: Clock, tint: "brand-accent", current: activeOrders, previous: activeOrdersYesterday },
    { title: "Menu Items", value: liveItems.length, icon: ChefHat, tint: "brand",
      sub: `${activeItems} active · ${inactiveItems} inactive`, current: liveItems.length, previous: liveItemsYesterday },
  ]

  // Revenue for the last 15 days (committed orders), oldest → newest
  const revenue15d = Array.from({ length: 15 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (14 - i))
    const key = d.toDateString()
    const revenue = orders
      .filter((o) => REVENUE_STATES.includes(o.status) && new Date(o.createdAt).toDateString() === key)
      .reduce((s, o) => s + o.totalAmount, 0)
    return { day: d.toLocaleDateString([], { day: "numeric", month: "short" }), revenue }
  })

  return (
    <div className="space-y-6">
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
              <div className="flex items-baseline gap-2 mt-2">
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <ChangeBadge current={stat.current} previous={stat.previous} />
              </div>
              <p className="text-xs text-slate-400 mt-1">{stat.sub || "vs. yesterday"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Revenue · last 15 days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revenue15d} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand, #f97316)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--brand-secondary, #7c3aed)" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                interval="preserveStartEnd" minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={54}
                tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip formatter={(v) => [formatCurrency(v), "Revenue"]} cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="revenue" fill="url(#revenueGradient)" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent orders — a compact, wrapping card grid instead of a tall row
          list, so the most recent orders are visible at a glance with no
          scrolling; the rest are one click away on the full Orders page. */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Recent Orders
          </CardTitle>
          {orders.length > RECENT_ORDERS_LIMIT && (
            <Link href="/dashboard/orders" className="text-xs font-medium text-slate-400 hover:text-slate-700">
              View all →
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No orders yet</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {orders.slice(0, RECENT_ORDERS_LIMIT).map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-100 p-3 hover:border-slate-200 hover:bg-muted/40 transition-colors min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-mono text-slate-400 flex-shrink-0">#{order.dailyOrderNumber ?? order.id}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {order.user?.customerName || order.guestName || "Guest"}
                  </p>
                  <p className="text-xs text-slate-400 truncate mb-2">
                    {order.guestVehicle
                      ? order.guestVehicle
                      : <span className="text-amber-600 font-medium">Pickup</span>}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <StatusDot color={ORDER_STATUS_COLORS[order.status] || "#94a3b8"} className="min-w-0">
                      {ORDER_STATUS_LABELS[order.status] || order.status}
                    </StatusDot>
                    <span className="text-sm font-semibold text-slate-800 flex-shrink-0">₹{order.totalAmount.toFixed(0)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
