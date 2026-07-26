"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, IndianRupee, Receipt, Repeat, Trophy, Timer, AlertTriangle, Download } from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, ReferenceLine,
} from "recharts"
import axios from "axios"
import { API } from "@/lib/api"
import { CHART_TOOLTIP_STYLE as tooltipStyle, formatCurrency, formatHour, toLocalDateStr, todayStr } from "@/lib/format"
import { CHART_CATEGORY_COLORS } from "@/lib/chart-colors"
import { SLA_WARN_MIN, SLA_CRIT_MIN, slaColor, prepMinutes } from "@/lib/sla"
import { StatusDot } from "@/components/ui/status-dot"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/export"

// Committed orders count toward revenue (exclude pending/cancelled)
const REVENUE_STATES = ["PAID", "PREPARING", "READY", "COMPLETED"]
const WINDOW_DAYS = 30

export function Analytics() {
  const [orders, setOrders] = useState([])
  const [menu, setMenu] = useState([])

  useEffect(() => {
    axios.get(`${API}/api/order`, { withCredentials: true }).then((r) => setOrders(r.data)).catch(() => {})
    axios.get(`${API}/api/menu/`, { withCredentials: true }).then((r) => setMenu(r.data)).catch(() => {})
  }, [])

  const cutoff = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const recent = orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff)
  // What actually sold — drop cancelled orders from item/category tallies
  const sold = recent.filter((o) => o.status !== "CANCELLED")

  // menuItemId -> category name
  const catByItem = new Map(menu.map((m) => [m.id, m.category?.name || "Uncategorized"]))

  // ── KPIs (last 30 days) ──────────────────────────────────────────────────────
  const committed = recent.filter((o) => REVENUE_STATES.includes(o.status))
  const revenue = committed.reduce((s, o) => s + o.totalAmount, 0)
  const aov = committed.length ? revenue / committed.length : 0

  const orderCountByCustomer = recent.reduce((acc, o) => {
    const key = o.user?.id ?? o.guestName ?? o.id
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const repeatCustomers = Object.values(orderCountByCustomer).filter((n) => n > 1).length

  const kpis = [
    { title: "Orders", value: recent.length, icon: ShoppingBag, tint: "brand" },
    { title: "Revenue", value: formatCurrency(revenue), icon: IndianRupee, tint: "brand-secondary" },
    { title: "Avg Order Value", value: formatCurrency(aov), icon: Receipt, tint: "brand-accent" },
    { title: "Repeat Customers", value: repeatCustomers, icon: Repeat, tint: "brand" },
  ]

  // ── Best-selling categories (last 30 days), by units sold ────────────────────
  const catAgg = {}
  sold.forEach((o) =>
    (o.orderItems || []).forEach((it) => {
      const cat = catByItem.get(it.menuItemId) || "Uncategorized"
      const qty = it.quantity || 1
      const rev = (it.finalPrice ?? it.unitPrice ?? 0) * qty
      if (!catAgg[cat]) catAgg[cat] = { name: cat, units: 0, revenue: 0 }
      catAgg[cat].units += qty
      catAgg[cat].revenue += rev
    })
  )
  const topCategories = Object.values(catAgg).sort((a, b) => b.units - a.units).slice(0, 8)

  // ── Top-selling items (last 30 days), by units sold ──────────────────────────
  const itemAgg = {}
  sold.forEach((o) =>
    (o.orderItems || []).forEach((it) => {
      const name = it.name || "Item"
      const qty = it.quantity || 1
      if (!itemAgg[name]) itemAgg[name] = { name, units: 0, revenue: 0 }
      itemAgg[name].units += qty
      itemAgg[name].revenue += (it.finalPrice ?? it.unitPrice ?? 0) * qty
    })
  )
  const topItems = Object.values(itemAgg).sort((a, b) => b.units - a.units).slice(0, 6)
  const topItemMax = topItems[0]?.units || 1

  // ── Orders by hour of day (last 30 days) ─────────────────────────────────────
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}`, orders: 0 }))
  recent.forEach((o) => { byHour[new Date(o.createdAt).getHours()].orders += 1 })

  // ── Pickup vs In-Car (last 30 days) ──────────────────────────────────────────
  const inCar = sold.filter((o) => o.guestVehicle).length
  const pickup = sold.length - inCar
  const fulfilmentTotal = inCar + pickup
  const fulfilment = [
    { name: "In-Car", value: inCar, pct: fulfilmentTotal ? Math.round((inCar / fulfilmentTotal) * 100) : 0 },
    { name: "Pickup", value: pickup, pct: fulfilmentTotal ? Math.round((pickup / fulfilmentTotal) * 100) : 0 },
  ].filter((d) => d.value > 0)

  // ── Prep-time trends (last 30 days) — which categories/items blow past SLA ──
  // Only orders that actually reached READY have a PREPARING→READY duration to measure.
  const timed = recent
    .map((o) => ({ order: o, mins: prepMinutes(o) }))
    .filter((t) => t.mins !== null)

  const avgPrepAll = timed.length ? timed.reduce((s, t) => s + t.mins, 0) / timed.length : null
  const breached = timed.filter((t) => t.mins >= SLA_CRIT_MIN)

  const avg = (samples) => samples.reduce((s, v) => s + v, 0) / samples.length

  const catPrepAgg = {}
  timed.forEach(({ order, mins }) => {
    const cats = new Set((order.orderItems || []).map((it) => catByItem.get(it.menuItemId) || "Uncategorized"))
    cats.forEach((cat) => {
      if (!catPrepAgg[cat]) catPrepAgg[cat] = []
      catPrepAgg[cat].push(mins)
    })
  })
  const catPrepTrend = Object.entries(catPrepAgg)
    .map(([name, samples]) => ({ name, avgMin: avg(samples), orders: samples.length }))
    .sort((a, b) => b.avgMin - a.avgMin)
    .slice(0, 8)

  const itemPrepAgg = {}
  timed.forEach(({ order, mins }) => {
    const names = new Set((order.orderItems || []).map((it) => it.name || "Item"))
    names.forEach((name) => {
      if (!itemPrepAgg[name]) itemPrepAgg[name] = []
      itemPrepAgg[name].push(mins)
    })
  })
  const itemPrepTrend = Object.entries(itemPrepAgg)
    .map(([name, samples]) => ({ name, avgMin: avg(samples), orders: samples.length }))
    .sort((a, b) => b.avgMin - a.avgMin)
    .slice(0, 6)

  // Daily avg prep time, oldest → newest — is SLA compliance improving or slipping?
  const dailyPrepTrend = Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (WINDOW_DAYS - 1 - i))
    const key = toLocalDateStr(d)
    const samples = timed.filter((t) => toLocalDateStr(new Date(t.order.createdAt)) === key).map((t) => t.mins)
    return {
      day: d.toLocaleDateString([], { day: "numeric", month: "short" }),
      avgMin: samples.length ? avg(samples) : null,
      breached: samples.filter((m) => m >= SLA_CRIT_MIN).length,
    }
  })

  // Avg prep time by order-placed hour — lines up against "Orders by hour" to
  // show whether SLA breaches cluster at rush times.
  const hourPrepSamples = Array.from({ length: 24 }, () => [])
  timed.forEach((t) => hourPrepSamples[new Date(t.order.createdAt).getHours()].push(t.mins))
  const byHourPrep = hourPrepSamples.map((samples, h) => ({
    hour: `${h}`,
    avgMin: samples.length ? avg(samples) : null,
    orders: samples.length,
  }))

  const exportSections = [
    { title: "KPIs", rows: [["Metric", "Value"], ...kpis.map((k) => [k.title, String(k.value)])] },
    { title: "Best-selling categories", rows: [["Category", "Units sold", "Revenue"], ...topCategories.map((c) => [c.name, c.units, c.revenue.toFixed(2)])] },
    { title: "Top items", rows: [["Item", "Units sold", "Revenue"], ...topItems.map((i) => [i.name, i.units, i.revenue.toFixed(2)])] },
    { title: "Orders by hour", rows: [["Hour", "Orders"], ...byHour.map((h) => [formatHour(h.hour), h.orders])] },
    { title: "Daily prep-time trend", rows: [["Date", "Avg prep (min)", "Orders over SLA"], ...dailyPrepTrend.map((d) => [d.day, d.avgMin != null ? d.avgMin.toFixed(1) : "", d.breached])] },
    { title: "Prep time by hour", rows: [["Hour", "Avg prep (min)", "Orders"], ...byHourPrep.map((h) => [formatHour(h.hour), h.avgMin != null ? h.avgMin.toFixed(1) : "", h.orders])] },
    { title: "Prep time by category", rows: [["Category", "Avg prep (min)", "Orders"], ...catPrepTrend.map((c) => [c.name, c.avgMin.toFixed(1), c.orders])] },
    { title: "Slowest items (prep time)", rows: [["Item", "Avg prep (min)", "Orders"], ...itemPrepTrend.map((i) => [i.name, i.avgMin.toFixed(1), i.orders])] },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Key trends from the last {WINDOW_DAYS} days.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => downloadCsv(`analytics-${todayStr()}.csv`, exportSections)}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="space-y-6">

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <Card key={k.title} className="border-0 shadow-sm anim-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.title}</p>
                <div className={`p-1.5 rounded-lg ${k.tint}-bg-subtle`}>
                  <k.icon className={`h-4 w-4 ${k.tint}-text`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily prep-time trend — is SLA compliance improving or slipping? */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <Timer className="h-4 w-4" /> Prep-time trend · {WINDOW_DAYS} days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {timed.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-16">No completed prep times yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyPrepTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                  interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={32} allowDecimals={false}
                  tickFormatter={(v) => `${v}m`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v, _n, p) => v == null ? ["No orders", "Avg prep"] : [`${v.toFixed(1)}m avg · ${p.payload.breached} over SLA`, "Avg prep"]}
                />
                <ReferenceLine y={SLA_WARN_MIN} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: `${SLA_WARN_MIN}m`, position: "insideTopLeft", fontSize: 10, fill: "#f59e0b" }} />
                <ReferenceLine y={SLA_CRIT_MIN} stroke="#ef4444" strokeDasharray="4 4"
                  label={{ value: `${SLA_CRIT_MIN}m SLA`, position: "insideTopLeft", fontSize: 10, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="avgMin" stroke="var(--brand, #f97316)" strokeWidth={2} dot={false}
                  connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Best-selling categories + Fulfilment split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Best-selling categories · {WINDOW_DAYS} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No sales yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topCategories.length * 44)}>
                <BarChart data={topCategories} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" allowDecimals={false}
                    label={{ value: "units sold", position: "insideBottom", offset: -4, fontSize: 11, fill: "#71717a" }} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={110} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={tooltipStyle}
                    formatter={(v, _n, p) => [`${v} sold · ${formatCurrency(p.payload.revenue)}`, p.payload.name]}
                  />
                  <Bar dataKey="units" radius={[0, 6, 6, 0]} maxBarSize={26}>
                    {topCategories.map((c, i) => <Cell key={c.name} fill={CHART_CATEGORY_COLORS[i % CHART_CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Pickup vs In-Car</CardTitle>
          </CardHeader>
          <CardContent>
            {fulfilment.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={fulfilment} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    <Cell fill="var(--brand, #f97316)" />
                    <Cell fill="#94a3b8" />
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(value, name, entry) => [`${value} orders (${entry.payload.pct}%)`, name]} />
                  <Legend iconType="circle" iconSize={8} formatter={(v, entry) => (
                    <span className="text-xs text-slate-600">{v} · {entry.payload.pct}%</span>
                  )} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top items + Orders by hour + Avg prep by hour — the last two share an hour
          axis so a spike in volume can be read against a spike in prep time. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Top items · {WINDOW_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-8">No sales yet</p>
            ) : (
              <div className="space-y-3">
                {topItems.map((it, i) => (
                  <div key={it.name} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-800 truncate">{it.name}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{it.units} sold · {formatCurrency(it.revenue)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full brand-bg rounded-full" style={{ width: `${(it.units / topItemMax) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Orders by hour · {WINDOW_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byHour} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="hourGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-accent, #f59e0b)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--brand, #f97316)" stopOpacity={0.75} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a" interval={2}
                  tickFormatter={formatHour} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={28} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} orders`, "Orders"]}
                  labelFormatter={(h) => formatHour(h)}
                />
                <Bar dataKey="orders" fill="url(#hourGradient)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Avg prep time by hour · {WINDOW_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byHourPrep} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a" interval={2}
                  tickFormatter={formatHour} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={28} allowDecimals={false}
                  tickFormatter={(v) => `${v}m`} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v, _n, p) => v == null ? ["No orders", "Avg prep"] : [`${v.toFixed(1)}m avg · ${p.payload.orders} order${p.payload.orders === 1 ? "" : "s"}`, "Avg prep"]}
                  labelFormatter={(h) => formatHour(h)}
                />
                <Bar dataKey="avgMin" radius={[4, 4, 0, 0]} maxBarSize={24}>
                  {byHourPrep.map((h) => <Cell key={h.hour} fill={slaColor(h.avgMin ?? 0)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Prep-time trends — which categories/items blow past the kitchen SLA */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <Timer className="h-4 w-4" /> Prep-time trends · {WINDOW_DAYS} days
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            {avgPrepAll !== null
              ? `Avg ${avgPrepAll.toFixed(1)}m to prepare · ${breached.length} order${breached.length === 1 ? "" : "s"} over the ${SLA_CRIT_MIN}m SLA`
              : "No completed prep times yet"}
          </p>
        </CardHeader>
        <CardContent>
          {timed.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-16">No completed prep times yet</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">By category — slowest first</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, catPrepTrend.length * 40)}>
                    <BarChart data={catPrepTrend} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a"
                        label={{ value: "avg minutes", position: "insideBottom", offset: -4, fontSize: 11, fill: "#71717a" }} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={100} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={tooltipStyle}
                        formatter={(v, _n, p) => [`${v.toFixed(1)}m avg · ${p.payload.orders} order${p.payload.orders === 1 ? "" : "s"}`, p.payload.name]}
                      />
                      <Bar dataKey="avgMin" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {catPrepTrend.map((c) => <Cell key={c.name} fill={slaColor(c.avgMin)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500 mb-3">Slowest items</p>
                  <div className="space-y-3">
                    {itemPrepTrend.map((it) => (
                      <div key={it.name} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{it.name}</p>
                          <p className="text-xs text-slate-400">{it.orders} order{it.orders === 1 ? "" : "s"}</p>
                        </div>
                        <StatusDot color={slaColor(it.avgMin)} className="flex-shrink-0">{it.avgMin.toFixed(1)}m</StatusDot>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-5 pt-4 border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slaColor(0) }} /> On time (&lt;{SLA_WARN_MIN}m)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slaColor(SLA_WARN_MIN) }} /> Slow ({SLA_WARN_MIN}–{SLA_CRIT_MIN}m)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <AlertTriangle className="h-3 w-3 text-red-500" /> Over SLA (&gt;{SLA_CRIT_MIN}m)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
