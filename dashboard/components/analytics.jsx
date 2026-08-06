"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  ShoppingBag, IndianRupee, Receipt, Repeat, Trophy, Timer, AlertTriangle, Download,
  Calendar, CheckCircle2, XCircle, CalendarDays, Grid2x2, Ghost, Sparkles,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  Cell, Legend, ReferenceLine, ScatterChart, Scatter, ZAxis,
} from "recharts"
import axios from "axios"
import { API } from "@/lib/api"
import {
  CHART_TOOLTIP_STYLE as tooltipStyle, CHART_TOOLTIP_WRAPPER_STYLE as tooltipWrapperStyle,
  CHART_TOOLTIP_ITEM_STYLE as tooltipItemStyle, CHART_TOOLTIP_LABEL_STYLE as tooltipLabelStyle,
  formatCurrency, formatHour, todayStr, daysAgoStr,
} from "@/lib/format"
import { CHART_CATEGORY_COLORS } from "@/lib/chart-colors"
import { ORDER_STATUS_LABELS } from "@/lib/status"
import { formatRangeLabel } from "@/lib/compare"
import { StatusDot } from "@/components/ui/status-dot"
import { StatCard } from "@/components/ui/stat-card"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/export"

const STATUS_FILTER_OPTIONS = ["PENDING", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED", "NOT_FULFILLED"]

// Menu-engineering quadrants (Kasavana-Smith). The label is the decision, not
// the jargon — an owner should be able to act on the card without a glossary.
const QUADRANTS = {
  star:      { label: "Stars",      color: "#10b981", hint: "Popular and high value — feature these" },
  plowhorse: { label: "Plowhorses", color: "#f59e0b", hint: "Sell well but earn little — reprice or cut cost" },
  puzzle:    { label: "Puzzles",    color: "#8b5cf6", hint: "Earn well but rarely ordered — promote" },
  dog:       { label: "Dogs",       color: "#94a3b8", hint: "Neither — candidates for removal" },
}

function fmtMin(mins) {
  if (mins == null) return "—"
  if (mins < 1) return `${Math.round(mins * 60)}s`
  if (mins < 60) return `${mins.toFixed(1)}m`
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
}

const dayLabel = (isoDate) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })

export function Analytics() {
  const [data, setData] = useState(null)
  const [waiters, setWaiters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // ── Filters (slicers) ─────────────────────────────────────────────────────
  // All of these are now query parameters: the aggregation happens server-side,
  // so the browser no longer holds every raw order to filter over.
  const [fromDate, setFromDate] = useState(() => daysAgoStr(29))
  const [toDate, setToDate] = useState(todayStr)
  const [orderType, setOrderType] = useState("all")
  const [payment, setPayment] = useState("all")
  const [status, setStatus] = useState("all")
  const [waiterId, setWaiterId] = useState("all")
  const [customerType, setCustomerType] = useState("all")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = {
      from: fromDate, to: toDate, orderType, payment, status, waiterId, customerType,
      // Day and hour bucketing must use the restaurant's local timezone, not
      // the server's — see the same offset handling in the endpoint.
      tzOffsetMinutes: -new Date().getTimezoneOffset(),
    }
    axios.get(`${API}/api/analytics/summary`, { params, withCredentials: true })
      .then((r) => { if (!cancelled) { setData(r.data); setError("") } })
      .catch(() => { if (!cancelled) setError("Couldn't load analytics for this range.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fromDate, toDate, orderType, payment, status, waiterId, customerType])

  useEffect(() => {
    axios.get(`${API}/api/waiter`, { withCredentials: true }).then((r) => setWaiters(r.data)).catch(() => {})
  }, [])

  const isToday = fromDate === todayStr() && toDate === todayStr()

  // Nothing to render until the first response lands. Afterwards the previous
  // payload stays on screen while a new one loads, so changing a slicer dims
  // the page instead of blanking it.
  if (!data) {
    return (
      <p className="text-slate-400 text-sm text-center py-24">
        {error || "Loading analytics…"}
      </p>
    )
  }

  const { kpis, prep, menu, sla } = data
  const cur = kpis.current
  const prev = kpis.previous
  const base = (v) => (kpis.hasBaseline ? v : null)
  const asPct = (v) => (v != null ? `${Math.round(v)}%` : "—")
  const baselineSub = kpis.hasBaseline
    ? `vs ${formatRangeLabel(data.previous.from, data.previous.to)}`
    : `no orders in ${formatRangeLabel(data.previous.from, data.previous.to)}`

  const daily = data.daily.map((d) => ({ ...d, label: dayLabel(d.date) }))
  const windowDays = data.range.days
  const peakHour = data.byHour.some((h) => h.orders > 0)
    ? data.byHour.reduce((best, h) => (h.orders > best.orders ? h : best)).hour
    : null

  // The three rate metrics compare in percentage POINTS; reporting a completion
  // rate moving 90%→95% as "+5.6%" would be a different claim. They get no
  // sparkline either — a daily rate off two or three orders is mostly noise,
  // and a noisy sparkline reads as a real trend.
  const kpiCards = [
    {
      title: "Orders", value: cur.orders, icon: ShoppingBag, tint: "brand",
      current: cur.orders, previous: base(prev.orders), trend: daily.map((d) => d.orders),
    },
    {
      title: "Revenue", value: formatCurrency(cur.revenue), icon: IndianRupee, tint: "brand-secondary",
      current: cur.revenue, previous: base(prev.revenue), trend: daily.map((d) => d.revenue),
    },
    {
      title: "Avg Order Value", value: formatCurrency(cur.aov), icon: Receipt, tint: "brand-accent",
      current: cur.aov, previous: base(prev.aov),
      trend: daily.map((d) => (d.committed ? d.revenue / d.committed : 0)),
    },
    {
      title: "Repeat Customers", value: `${cur.repeatCustomers} (${Math.round(cur.returningPct)}%)`, icon: Repeat, tint: "brand",
      current: cur.returningPct, previous: base(prev.returningPct), mode: "pts",
      tooltip: `${cur.repeatCustomers} of ${cur.distinctCustomers} customers placed more than one order in this range (${Math.round(cur.returningPct)}% returning) · those customers placed ${cur.ordersFromRepeat} of the ${cur.orders} orders shown.`,
    },
    {
      title: "Completion Rate", value: asPct(cur.completionRate), icon: CheckCircle2, tint: "brand-secondary",
      current: cur.completionRate, previous: base(prev.completionRate), mode: "pts",
    },
    {
      title: "Cancellation Rate", value: asPct(cur.cancellationRate), icon: XCircle, tint: "brand-accent",
      current: cur.cancellationRate, previous: base(prev.cancellationRate), mode: "pts", invert: true,
    },
  ]

  const fulfilmentTotal = data.fulfilment.inCar + data.fulfilment.pickup
  const inCarPct = fulfilmentTotal ? (data.fulfilment.inCar / fulfilmentTotal) * 100 : 0

  const topItemMax = data.topItems[0]?.units || 1

  const quadrantCounts = menu.matrix.reduce((acc, i) => {
    acc[i.quadrant] = (acc[i.quadrant] || 0) + 1
    return acc
  }, {})

  const exportSections = [
    { title: "KPIs", rows: [
      ["Metric", "Value", `Previous (${formatRangeLabel(data.previous.from, data.previous.to)})`],
      ...kpiCards.map((k) => [k.title, String(k.value), k.previous == null ? "" : (k.mode === "pts" ? `${Math.round(k.previous)}%` : Math.round(k.previous))]),
    ] },
    { title: "Orders by day", rows: [["Date", "Orders", "Revenue"], ...daily.map((d) => [d.date, d.orders, d.revenue.toFixed(2)])] },
    { title: "Best-selling categories", rows: [["Category", "Units sold", "Revenue"], ...data.topCategories.map((c) => [c.name, c.units, c.revenue.toFixed(2)])] },
    { title: "Top items", rows: [["Item", "Units sold", "Revenue"], ...data.topItems.map((i) => [i.name, i.units, i.revenue.toFixed(2)])] },
    { title: "Orders by hour", rows: [["Hour", "Orders"], ...data.byHour.map((h) => [formatHour(h.hour), h.orders])] },
    { title: "Kitchen SLA", rows: [
      ["Metric", "Value"],
      ["Median prep (p50)", prep.p50 != null ? prep.p50.toFixed(1) : ""],
      ["Slow-tail prep (p90)", prep.p90 != null ? prep.p90.toFixed(1) : ""],
      ["SLA compliance %", prep.compliancePct != null ? prep.compliancePct.toFixed(1) : ""],
      ["Orders over SLA", prep.breached],
      ["Timed orders", prep.sampleCount],
    ] },
    { title: "Prep time by day", rows: [["Date", "p50 (min)", "p90 (min)", "Over SLA"], ...daily.map((d) => [d.date, d.prepP50?.toFixed(1) ?? "", d.prepP90?.toFixed(1) ?? "", d.breached])] },
    { title: "Prep time by category", rows: [["Category", "p50 (min)", "p90 (min)", "Orders"], ...prep.byCategory.map((c) => [c.name, c.p50.toFixed(1), c.p90.toFixed(1), c.orders])] },
    { title: "Slowest items", rows: [["Item", "p50 (min)", "p90 (min)", "Orders"], ...prep.slowestItems.map((i) => [i.name, i.p50.toFixed(1), i.p90.toFixed(1), i.orders])] },
    { title: "Menu engineering", rows: [["Item", "Category", "Units", "Revenue", "Revenue per unit", "Quadrant"], ...menu.matrix.map((i) => [i.name, i.category, i.units, i.revenue.toFixed(2), i.unitRevenue.toFixed(2), QUADRANTS[i.quadrant].label])] },
    { title: "Items with no sales", rows: [["Item", "Category", "Price"], ...menu.dead.map((i) => [i.name, i.category, i.price.toFixed(2)])] },
    { title: "Option attach rates", rows: [["Item", "Option", "Attach %", "Times chosen", "Item orders"], ...menu.optionAttach.map((o) => [o.item, o.option, o.attachPct.toFixed(1), o.chosen, o.itemOrders])] },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Key trends from the selected range, compared against {formatRangeLabel(data.previous.from, data.previous.to)}.
          </p>
        </div>
        <Button variant="outline" size="sm" className="text-xs"
          onClick={() => downloadCsv(`analytics-${todayStr()}.csv`, exportSections)}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {/* Dimmed rather than blanked while a slicer change is in flight — the
          numbers on screen stay readable instead of flashing to a spinner. */}
      <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>

        {/* Filters (slicers) — every KPI and chart below reacts to these. */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 flex-wrap">
                <Calendar className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <Input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)} className="bg-white w-[118px] h-7 text-xs px-1.5" />
                <span className="text-slate-400 text-xs">–</span>
                <Input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)} className="bg-white w-[118px] h-7 text-xs px-1.5" />
              </div>
              <div className="flex items-center gap-1">
                <Button variant={isToday ? "secondary" : "outline"} size="sm" className="text-xs h-7 px-2"
                  onClick={() => { setFromDate(todayStr()); setToDate(todayStr()) }}>Today</Button>
                <Button variant="outline" size="sm" className="text-xs h-7 px-2"
                  onClick={() => { setFromDate(daysAgoStr(6)); setToDate(todayStr()) }}>7d</Button>
                <Button variant="outline" size="sm" className="text-xs h-7 px-2"
                  onClick={() => { setFromDate(daysAgoStr(29)); setToDate(todayStr()) }}>30d</Button>
                <Button variant="outline" size="sm" className="text-xs h-7 px-2"
                  onClick={() => { setFromDate(daysAgoStr(89)); setToDate(todayStr()) }}>90d</Button>
              </div>

              <div className="w-px h-5 bg-border mx-0.5 hidden sm:block" />

              <Select value={orderType} onValueChange={setOrderType}>
                <SelectTrigger className="h-7 text-xs w-[92px] bg-white"><SelectValue placeholder="Order type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="delivery">In-Car</SelectItem>
                </SelectContent>
              </Select>

              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger className="h-7 text-xs w-[100px] bg-white"><SelectValue placeholder="Payment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="COD">Cash</SelectItem>
                  <SelectItem value="PHONEPE">PhonePe</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-7 text-xs w-[95px] bg-white"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_FILTER_OPTIONS.map((s) => <SelectItem key={s} value={s}>{ORDER_STATUS_LABELS[s] || s}</SelectItem>)}
                </SelectContent>
              </Select>

              {waiters.length > 0 && (
                <Select value={waiterId} onValueChange={setWaiterId}>
                  <SelectTrigger className="h-7 text-xs w-[100px] bg-white"><SelectValue placeholder="Waiter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All waiters</SelectItem>
                    {waiters.map((w) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              <Select value={customerType} onValueChange={setCustomerType}>
                <SelectTrigger className="h-7 text-xs w-[100px] bg-white"><SelectValue placeholder="Customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="repeat">Repeat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* KPIs — each carries a delta against the equal-length prior window. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpiCards.map((k, i) => (
            <StatCard key={k.title} {...k} sub={baselineSub} delay={i * 60} />
          ))}
        </div>

        {cur.orders === 0 ? (
          <p className="text-slate-400 text-sm text-center py-16">No orders match these filters</p>
        ) : (
        <>

        {/* Orders — daily trend */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Orders · {windowDays} day{windowDays === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                  interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={28} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                  itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                  formatter={(v, _n, p) => [`${v} order${v === 1 ? "" : "s"} · ${formatCurrency(p.payload.revenue)}`, "Orders"]} />
                <Bar dataKey="orders" fill="var(--brand, #f97316)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Kitchen performance ────────────────────────────────────────────
            Percentiles, not averages. An average prep time hides the tail, and
            the tail is what generates complaints — a kitchen can average 8
            minutes while one order in ten takes 25. p90 is the number worth
            managing, and SLA compliance is the one an owner can set a target on. */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <Timer className="h-4 w-4" /> Kitchen performance · {windowDays} day{windowDays === 1 ? "" : "s"}
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Prep = kitchen only (Preparing→Ready) · Total = the customer's full wait (placed→Completed)
              {prep.sampleCount > 0 && ` · ${prep.sampleCount} timed order${prep.sampleCount === 1 ? "" : "s"}`}
            </p>
          </CardHeader>
          <CardContent>
            {prep.sampleCount === 0 ? (
              <p className="text-slate-400 text-sm text-center py-12">No completed prep times in this range yet</p>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                  <div className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">SLA compliance</p>
                    <p className={`text-2xl font-bold mt-1 ${prep.compliancePct >= 95 ? "text-emerald-600" : prep.compliancePct >= 80 ? "text-amber-600" : "text-red-600"}`}>
                      {asPct(prep.compliancePct)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">under {sla.critMinutes}m</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Median prep</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{fmtMin(prep.p50)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">typical ticket (p50)</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Slow tail</p>
                    <p className={`text-2xl font-bold mt-1 ${prep.p90 >= sla.critMinutes ? "text-red-600" : prep.p90 >= sla.warnMinutes ? "text-amber-600" : "text-slate-900"}`}>
                      {fmtMin(prep.p90)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">1 in 10 waits this long (p90)</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 p-3">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Over SLA</p>
                    <p className={`text-2xl font-bold mt-1 ${prep.breached > 0 ? "text-red-600" : "text-slate-900"}`}>{prep.breached}</p>
                    <p className="text-xs text-slate-400 mt-0.5">total wait p90 {fmtMin(prep.total.p90)}</p>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={daily} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                      interval="preserveStartEnd" minTickGap={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={34}
                      tickFormatter={(v) => `${v}m`} />
                    <Tooltip contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                      itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                      formatter={(v, n) => [v == null ? "No orders" : fmtMin(v), n === "prepP50" ? "Median (p50)" : "Slow tail (p90)"]} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => (
                      <span className="text-xs text-slate-600">{v === "prepP50" ? "Median (p50)" : "Slow tail (p90)"}</span>
                    )} />
                    <ReferenceLine y={sla.warnMinutes} stroke="#f59e0b" strokeDasharray="4 4"
                      label={{ value: `${sla.warnMinutes}m`, position: "insideTopLeft", fontSize: 10, fill: "#f59e0b" }} />
                    <ReferenceLine y={sla.critMinutes} stroke="#ef4444" strokeDasharray="4 4"
                      label={{ value: `${sla.critMinutes}m SLA`, position: "insideTopLeft", fontSize: 10, fill: "#ef4444" }} />
                    <Line type="monotone" dataKey="prepP50" stroke="var(--brand, #f97316)" strokeWidth={2} dot={false} connectNulls={false} />
                    <Line type="monotone" dataKey="prepP90" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>

                {/* Ranked by p90, not average — a station that is usually fine
                    but occasionally catastrophic is exactly what an average buries. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-5 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Slowest categories — by p90</p>
                    {prep.byCategory.length === 0 ? (
                      <p className="text-slate-400 text-sm py-4">Not enough timed orders</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={Math.max(120, prep.byCategory.length * 30)}>
                        <BarChart data={prep.byCategory} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 18 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a"
                            label={{ value: "p90 minutes", position: "insideBottom", offset: -4, fontSize: 11, fill: "#71717a" }} />
                          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={100} />
                          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                            itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                            formatter={(v, _n, p) => [`p90 ${fmtMin(v)} · median ${fmtMin(p.payload.p50)} · ${p.payload.orders} order${p.payload.orders === 1 ? "" : "s"}`, p.payload.name]} />
                          <Bar dataKey="p90" radius={[0, 6, 6, 0]} maxBarSize={22}>
                            {prep.byCategory.map((c) => (
                              <Cell key={c.name} fill={c.p90 >= sla.critMinutes ? "#ef4444" : c.p90 >= sla.warnMinutes ? "#f59e0b" : "#94a3b8"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-3">Slowest items — by p90</p>
                    <div className="space-y-3">
                      {prep.slowestItems.map((it) => (
                        <div key={it.name} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{it.name}</p>
                            <p className="text-xs text-slate-400">median {fmtMin(it.p50)} · {it.orders} order{it.orders === 1 ? "" : "s"}</p>
                          </div>
                          <StatusDot color={it.p90 >= sla.critMinutes ? "#ef4444" : it.p90 >= sla.warnMinutes ? "#f59e0b" : "#94a3b8"} className="flex-shrink-0">
                            {fmtMin(it.p90)}
                          </StatusDot>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 mt-5 pt-4 border-t border-slate-100">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-slate-400" /> On time (&lt;{sla.warnMinutes}m)
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Slow ({sla.warnMinutes}–{sla.critMinutes}m)
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <AlertTriangle className="h-3 w-3 text-red-500" /> Over SLA (&gt;{sla.critMinutes}m)
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Best-selling categories + fulfilment split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Trophy className="h-4 w-4" /> Best-selling categories
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.topCategories.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-16">No sales yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, data.topCategories.length * 44)}>
                  <BarChart data={data.topCategories} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a"
                      tickFormatter={(v) => formatCurrency(v)}
                      label={{ value: "revenue", position: "insideBottom", offset: -4, fontSize: 11, fill: "#71717a" }} />
                    <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={110} />
                    <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                      itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                      formatter={(v, _n, p) => [`${formatCurrency(v)} · ${p.payload.units} sold`, p.payload.name]} />
                    <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={26}>
                      {data.topCategories.map((c, i) => <Cell key={c.name} fill={CHART_CATEGORY_COLORS[i % CHART_CATEGORY_COLORS.length]} />)}
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
              {fulfilmentTotal === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No orders yet</p>
              ) : (
                // A two-slice donut spent a whole card saying one number; a
                // split bar says the same thing in a fraction of the space.
                <div className="space-y-4">
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                    <div style={{ width: `${inCarPct}%`, backgroundColor: "var(--brand, #f97316)" }} />
                    <div style={{ width: `${100 - inCarPct}%`, backgroundColor: "#94a3b8" }} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--brand, #f97316)" }} /> In-Car
                      </span>
                      <span className="font-semibold text-slate-800">{data.fulfilment.inCar} · {Math.round(inCarPct)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-full bg-slate-400" /> Pickup
                      </span>
                      <span className="font-semibold text-slate-800">{data.fulfilment.pickup} · {Math.round(100 - inCarPct)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top items + orders by hour */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Top items</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topItems.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No sales yet</p>
              ) : (
                <div className="space-y-3">
                  {data.topItems.map((it, i) => (
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
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                Orders by hour {peakHour !== null && <span className="normal-case text-slate-400 font-normal">· peak {formatHour(peakHour)}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.byHour} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                    itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                    formatter={(v, _n, p) => [
                      p.payload.samples ? `${v} orders · median prep ${fmtMin(p.payload.prepP50)}` : `${v} orders`,
                      "Orders",
                    ]}
                    labelFormatter={(h) => formatHour(h)} />
                  <Bar dataKey="orders" fill="url(#hourGradient)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Menu engineering ───────────────────────────────────────────────
            Popularity against value, split into the four classic quadrants, so
            the menu becomes a set of decisions rather than a ranking. */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <Grid2x2 className="h-4 w-4" /> Menu engineering
            </CardTitle>
            <p className="text-xs text-slate-400 mt-1">
              Units sold against revenue per unit. Lines mark the thresholds: {menu.thresholds.units.toFixed(1)} units
              and {formatCurrency(menu.thresholds.unitRevenue)} per unit.
              {" "}Revenue per unit stands in for margin — add a cost per menu item to make this true profit.
            </p>
          </CardHeader>
          <CardContent>
            {menu.matrix.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No items sold in this range</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3 mb-4">
                  {Object.entries(QUADRANTS).map(([key, q]) => (
                    <div key={key} className="flex items-center gap-1.5" title={q.hint}>
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: q.color }} />
                      <span className="text-xs font-medium text-slate-600">{q.label}</span>
                      <span className="text-xs text-slate-400">{quadrantCounts[key] || 0}</span>
                    </div>
                  ))}
                </div>

                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 12, right: 20, left: 4, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis type="number" dataKey="units" name="Units sold" tickLine={false} axisLine={false}
                      fontSize={12} stroke="#71717a" allowDecimals={false}
                      label={{ value: "units sold →", position: "insideBottom", offset: -8, fontSize: 11, fill: "#71717a" }} />
                    <YAxis type="number" dataKey="unitRevenue" name="Revenue per unit" tickLine={false} axisLine={false}
                      fontSize={12} stroke="#71717a" width={58} tickFormatter={(v) => formatCurrency(v)}
                      label={{ value: "₹ per unit →", angle: -90, position: "insideLeft", fontSize: 11, fill: "#71717a" }} />
                    <ZAxis type="number" dataKey="revenue" range={[60, 400]} name="Revenue" />
                    <Tooltip cursor={{ strokeDasharray: "4 4" }}
                      contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                      itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const i = payload[0].payload
                        return (
                          <div style={tooltipStyle} className="px-3 py-2">
                            <p className="font-semibold">{i.name}</p>
                            <p className="text-xs opacity-80">{i.category}</p>
                            <p className="text-xs mt-1">
                              {i.units} sold · {formatCurrency(i.unitRevenue)}/unit · {formatCurrency(i.revenue)} total
                            </p>
                            <p className="text-xs mt-1" style={{ color: QUADRANTS[i.quadrant].color }}>
                              {QUADRANTS[i.quadrant].label} — {QUADRANTS[i.quadrant].hint}
                            </p>
                          </div>
                        )
                      }} />
                    <ReferenceLine x={menu.thresholds.units} stroke="#94a3b8" strokeDasharray="4 4" />
                    <ReferenceLine y={menu.thresholds.unitRevenue} stroke="#94a3b8" strokeDasharray="4 4" />
                    <Scatter data={menu.matrix} fillOpacity={0.85}>
                      {menu.matrix.map((i) => <Cell key={`${i.id}-${i.name}`} fill={QUADRANTS[i.quadrant].color} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>

        {/* Dead items + option attach — two views built from data nothing
            surfaced before: items nobody ordered, and add-ons that ride along. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Ghost className="h-4 w-4" /> No sales in this range
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                On the menu and orderable, but nobody bought one. {menu.deadTotal} item{menu.deadTotal === 1 ? "" : "s"} total.
              </p>
            </CardHeader>
            <CardContent>
              {menu.dead.length === 0 ? (
                <p className="text-emerald-600 text-sm text-center py-8">Every available item sold at least once</p>
              ) : (
                <div className="space-y-2">
                  {menu.dead.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{it.name}</p>
                        <p className="text-xs text-slate-400 truncate">{it.category}</p>
                      </div>
                      <span className="text-sm font-semibold text-slate-500 flex-shrink-0">{formatCurrency(it.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Option attach rates
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                How often an add-on is chosen with its item — a pricing lever hiding in the order data.
              </p>
            </CardHeader>
            <CardContent>
              {menu.optionAttach.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No options chosen in this range</p>
              ) : (
                <div className="space-y-3">
                  {menu.optionAttach.map((o) => (
                    <div key={`${o.item}-${o.option}`}>
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="text-sm text-slate-800 truncate">
                          <span className="font-medium">{o.option}</span>
                          <span className="text-slate-400"> · {o.item}</span>
                        </span>
                        <span className="text-xs font-semibold text-slate-600 flex-shrink-0">{Math.round(o.attachPct)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, o.attachPct)}%`, backgroundColor: "var(--brand-secondary, #7c3aed)" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        </>
        )}
      </div>
    </div>
  )
}
