"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, IndianRupee, Timer, Receipt, Flame, AlertTriangle, PackageCheck, Hourglass } from "lucide-react"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts"
import axios from "axios"
import Link from "next/link"

import { API } from "@/lib/api"
import { CHART_TOOLTIP_STYLE, CHART_TOOLTIP_WRAPPER_STYLE, CHART_TOOLTIP_ITEM_STYLE, CHART_TOOLTIP_LABEL_STYLE, formatCurrency, todayStr, daysAgoStr, localDateRange } from "@/lib/format"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/status"
import { SLA_WARN_MIN, SLA_CRIT_MIN, totalMinutes, historyTime } from "@/lib/sla"
import { sameWeekdayLastWeek, weekdayLabel } from "@/lib/compare"
import { StatusDot } from "@/components/ui/status-dot"
import { StatCard } from "@/components/ui/stat-card"
import { useOrders } from "@/lib/orders-context"
import { useRestaurant } from "@/lib/restaurant-context"

// Only COMPLETED orders are real revenue — cancelled/not-fulfilled/in-flight orders don't count
const REVENUE_STATES = ["COMPLETED"]
// Orders that still owe the customer something — the live queue
const ACTIVE_STATES = ["PAID", "PREPARING", "READY"]
// Enough history to cover the 15-day revenue chart, the 7-day sparklines, and
// the same-weekday-last-week baseline — and, unlike the previous unbounded
// fetch, it stays the same size as a restaurant's order history grows.
const HISTORY_DAYS = 15
// One row's worth at the widest (xl, 6-col) breakpoint — keeps this section's
// height bounded and predictable so the whole page fits in one screen.
const RECENT_ORDERS_LIMIT = 6
// The live strip is minute-granular, so a 15s tick is plenty to keep it honest
// between the 2s order polls in OrdersProvider.
const CLOCK_TICK_MS = 15000

function formatMinutes(mins) {
  if (mins == null) return "—"
  if (mins < 60) return `${mins.toFixed(0)}m`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return `${h}h ${m}m`
}

function ageLabel(ms) {
  if (ms == null) return "—"
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function avg(samples) {
  return samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : null
}

function summarizeDay(list) {
  const committed = list.filter((o) => REVENUE_STATES.includes(o.status))
  const revenue = committed.reduce((s, o) => s + o.totalAmount, 0)
  return {
    orders: list.length,
    revenue,
    aov: committed.length ? revenue / committed.length : 0,
    wait: avg(list.map(totalMinutes).filter((m) => m != null)),
  }
}

// One cell of the live strip. Renders as a link so every number on the
// "needs attention" row is one click from the screen that resolves it — a
// count you can't act on is just decoration.
function LiveTile({ href, label, value, icon: Icon, tone = "idle", hint }) {
  const tones = {
    idle: "text-slate-800",
    active: "text-slate-900",
    warn: "text-amber-600",
    crit: "text-red-600",
  }
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/50 transition-colors min-w-0">
      <div className={`p-1.5 rounded-lg flex-shrink-0 ${tone === "crit" ? "bg-red-50" : tone === "warn" ? "bg-amber-50" : "bg-slate-100"}`}>
        <Icon className={`h-4 w-4 ${tone === "crit" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "text-slate-400"}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{label}</p>
        <p className={`text-lg font-bold leading-tight ${tones[tone]}`}>
          {value}
          {hint && <span className="text-xs font-normal text-slate-400 ml-1.5">{hint}</span>}
        </p>
      </div>
    </Link>
  )
}

export function DashboardOverview() {
  const restaurant = useRestaurant()
  const slaWarnMin = restaurant?.slaWarnMinutes ?? SLA_WARN_MIN
  const slaCritMin = restaurant?.slaCritMinutes ?? SLA_CRIT_MIN

  // Today's orders come from the dashboard-wide 2s poll rather than a fetch of
  // our own, so the live strip is as fresh as the Kitchen Display.
  const liveOrders = useOrders()?.orders ?? []

  // Everything before today — static for the session, so it's fetched once.
  const [history, setHistory] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const params = localDateRange(daysAgoStr(HISTORY_DAYS - 1), daysAgoStr(1))
    axios.get(`${API}/api/order`, { params, withCredentials: true }).then((r) => setHistory(r.data)).catch(() => {})
    axios.get(`${API}/api/menu/`, { withCredentials: true }).then((r) => setMenuItems(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS)
    return () => clearInterval(t)
  }, [])

  // ── Live strip — what needs attention right now ────────────────────────────
  const inQueue = liveOrders.filter((o) => ACTIVE_STATES.includes(o.status))
  const oldestMs = inQueue.length
    ? Math.max(...inQueue.map((o) => now - new Date(o.createdAt).getTime()))
    : null
  // Same rule the Kitchen Display flags on: time spent in PREPARING, falling
  // back to updatedAt for orders whose history predates status tracking.
  const overSla = liveOrders.filter((o) => {
    if (o.status !== "PREPARING") return false
    const started = historyTime(o, "PREPARING") ?? new Date(o.updatedAt).getTime()
    return (now - started) / 60000 >= slaCritMin
  }).length
  const readyWaiting = liveOrders.filter((o) => o.status === "READY").length

  const oldestMins = oldestMs != null ? oldestMs / 60000 : null
  const oldestTone = oldestMins == null ? "idle" : oldestMins >= slaCritMin ? "crit" : oldestMins >= slaWarnMin ? "warn" : "active"

  // Items switched off while the restaurant is taking orders — actionable in a
  // way the old "Menu Items" count never was.
  const unavailableCount = menuItems.filter((m) => m.isActive !== false && !m.available).length

  // ── Daily series over the history window, oldest → newest ──────────────────
  const allOrders = [...history, ...liveOrders]
  const byDay = new Map()
  allOrders.forEach((o) => {
    const key = new Date(o.createdAt).toDateString()
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push(o)
  })

  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (HISTORY_DAYS - 1 - i))
    return { date: d, ...summarizeDay(byDay.get(d.toDateString()) || []) }
  })

  const today = days[HISTORY_DAYS - 1]
  // 7 days back — a fair baseline. Yesterday isn't: on a weekly-seasonal
  // business, "Monday vs Sunday" mostly measures which day it is.
  const baseline = days[HISTORY_DAYS - 8]
  const baselineLabel = `vs last ${weekdayLabel(sameWeekdayLastWeek())}`

  // No sparklines here, deliberately. The Overview's job is "what is true right
  // now" — the delta against last week already carries the direction, and four
  // more charts above the fold made the landing screen read as a wall of data.
  // The full daily trends live one click away on Analytics.
  const stats = [
    {
      title: "Orders Today", value: today.orders, icon: ShoppingBag, tint: "brand",
      current: today.orders, previous: baseline?.orders,
    },
    {
      title: "Revenue Today", value: formatCurrency(today.revenue), icon: IndianRupee, tint: "brand-secondary",
      current: today.revenue, previous: baseline?.revenue,
    },
    {
      title: "Avg Order Value", value: formatCurrency(today.aov), icon: Receipt, tint: "brand-accent",
      current: today.aov, previous: baseline?.aov,
    },
    {
      title: "Avg Customer Wait", value: formatMinutes(today.wait), icon: Timer, tint: "brand",
      current: today.wait, previous: baseline?.wait, invert: true,
      tooltip: "Average time from order placed to COMPLETED, for orders that finished today.",
    },
  ]

  const revenueSeries = days.map((d) => ({
    day: d.date.toLocaleDateString([], { day: "numeric", month: "short" }),
    revenue: d.revenue,
  }))

  const recentOrders = [...allOrders]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, RECENT_ORDERS_LIMIT)

  return (
    <div className="space-y-3">
      {/* ── Zone 1: right now ────────────────────────────────────────────────
          Deliberately a different shape from the KPI tiles below — this row is
          live operational state to act on, not performance to review. */}
      <Card className="border-0 shadow-sm py-0 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              Right now
            </p>
            {unavailableCount > 0 && (
              <Link href="/dashboard/menu" className="text-xs font-medium text-amber-600 hover:text-amber-700">
                {unavailableCount} item{unavailableCount === 1 ? "" : "s"} unavailable →
              </Link>
            )}
          </div>
          {/* Separators come from a 1px gap over a tinted container rather than
              divide-x — on the 2-column layout `divide-x` also draws a border
              down the left of the cell that starts the second row. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100 border-t border-slate-100">
            <LiveTile href="/dashboard/orders" label="In queue" value={inQueue.length} icon={Flame}
              tone={inQueue.length > 0 ? "active" : "idle"} />
            <LiveTile href="/dashboard/kitchen" label="Oldest waiting" value={ageLabel(oldestMs)} icon={Hourglass}
              tone={oldestTone} />
            <LiveTile href="/dashboard/kitchen" label={`Over ${slaCritMin}m SLA`} value={overSla} icon={AlertTriangle}
              tone={overSla > 0 ? "crit" : "idle"} />
            <LiveTile href="/dashboard/orders?status=READY" label="Ready & waiting" value={readyWaiting} icon={PackageCheck}
              tone={readyWaiting > 0 ? "warn" : "idle"} hint={readyWaiting > 0 ? "to collect" : null} />
          </div>
        </CardContent>
      </Card>

      {/* ── Zone 2: today's performance, against a same-weekday baseline ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat, i) => (
          <StatCard key={stat.title} {...stat} sub={baselineLabel} compact delay={i * 60} />
        ))}
      </div>

      {/* Revenue chart */}
      <Card className="border-0 shadow-sm py-3 gap-2">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Revenue · last {HISTORY_DAYS} days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={revenueSeries} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
          {allOrders.length > RECENT_ORDERS_LIMIT && (
            <Link href="/dashboard/orders" className="text-xs font-medium text-slate-400 hover:text-slate-700">
              View all →
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No orders yet</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {recentOrders.map((order) => (
                <Link key={order.id} href="/dashboard/orders"
                  className="rounded-lg border border-slate-100 p-2.5 hover:border-slate-200 hover:bg-muted/40 transition-colors min-w-0 block">
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
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
