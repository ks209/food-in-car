"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, IndianRupee, Timer, ChefHat, ArrowUp, ArrowDown, Minus } from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"
import axios from "axios"
import Link from "next/link"

import { API } from "@/lib/api"
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, formatCurrency } from "@/lib/format"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/status"
import { totalMinutes } from "@/lib/sla"
import { StatusDot } from "@/components/ui/status-dot"

// Only COMPLETED orders are real revenue — cancelled/not-fulfilled/in-flight orders don't count
const REVENUE_STATES = ["COMPLETED"]
const DAY_MS = 24 * 60 * 60 * 1000
// One row's worth at the widest (xl, 6-col) breakpoint — keeps this section's
// height bounded and predictable so the whole page fits in one screen.
const RECENT_ORDERS_LIMIT = 6

function formatMinutes(mins) {
  if (mins == null) return "—"
  if (mins < 60) return `${mins.toFixed(0)}m`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return `${h}h ${m}m`
}

function avg(samples) {
  return samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : null
}

// null = no comparison possible (missing data, or both zero); Infinity = went
// from zero/nothing to something ("New")
function pctChange(current, previous) {
  if (current == null || previous == null) return null
  if (previous === 0) return current === 0 ? null : Infinity
  return ((current - previous) / previous) * 100
}

// `invert`: for metrics where going DOWN is the good direction (e.g. a
// completion-time average) — the arrow still shows the real trend, only the
// color flips.
function ChangeBadge({ current, previous, invert = false }) {
  const change = pctChange(current, previous)
  if (change === null) return null
  if (change === Infinity) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${invert ? "text-red-500" : "text-emerald-600"}`}>
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
  const good = invert ? !positive : positive
  const Icon = positive ? ArrowUp : ArrowDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? "text-emerald-600" : "text-red-500"}`}>
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

  // Avg time from order placed to COMPLETED — the customer's actual wait,
  // a far more actionable number on a day-to-day basis than a live "orders
  // currently in flight" gauge (which swings with volume, not performance).
  const completionToday = avg(todayOrders.map(totalMinutes).filter((m) => m != null))
  const completionYesterday = avg(yesterdayOrders.map(totalMinutes).filter((m) => m != null))

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
    { title: "Avg Completion Time", value: formatMinutes(completionToday), icon: Timer, tint: "brand-accent",
      current: completionToday, previous: completionYesterday, invert: true },
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
    <div className="space-y-3">
      {/* Stats — Card's own default py-6/gap-6 (see card.jsx) is dropped here
          via py-0; with only one child (CardContent) that inherited padding
          was pure unused height, not visual breathing room. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat, i) => (
          <Card key={stat.title} className="border-0 shadow-sm anim-fade-up py-0" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.title}</p>
                <div className={`p-1 rounded-lg ${stat.tint}-bg-subtle`}>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.tint}-text`} />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <ChangeBadge current={stat.current} previous={stat.previous} invert={stat.invert} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{stat.sub || "vs. yesterday"}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue chart */}
      <Card className="border-0 shadow-sm py-3 gap-2">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Revenue · last 15 days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={revenue15d} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand, #f97316)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="var(--brand, #f97316)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                interval="preserveStartEnd" minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={54}
                tickFormatter={(v) => formatCurrency(v)} />
              <Tooltip formatter={(v) => [formatCurrency(v), "Revenue"]} cursor={{ stroke: "var(--brand, #f97316)", strokeWidth: 1, strokeDasharray: "4 4" }}
                contentStyle={CHART_TOOLTIP_STYLE} wrapperStyle={CHART_TOOLTIP_WRAPPER_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE} labelStyle={CHART_TOOLTIP_LABEL_STYLE} />
              <Area type="monotone" dataKey="revenue" stroke="var(--brand, #f97316)" strokeWidth={2.5}
                fill="url(#revenueGradient)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent orders — a compact, wrapping card grid instead of a tall row
          list. Capped at one row's worth so the whole Overview page fits in
          a single screen; the rest are one click away on the full Orders page. */}
      <Card className="border-0 shadow-sm py-3 gap-2">
        <CardHeader className="pb-0 flex items-center justify-between">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {orders.slice(0, RECENT_ORDERS_LIMIT).map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-100 p-2.5 hover:border-slate-200 hover:bg-muted/40 transition-colors min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono text-slate-400 flex-shrink-0">#{order.dailyOrderNumber ?? order.id}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {order.user?.customerName || order.guestName || "Guest"}
                  </p>
                  <p className="text-xs text-slate-400 truncate mb-1.5">
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
