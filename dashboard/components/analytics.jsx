"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import {
  ShoppingBag, IndianRupee, Receipt, Repeat, Trophy, Timer, AlertTriangle, Download,
  Calendar, CheckCircle2, XCircle, Info, CalendarDays,
} from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, ReferenceLine,
} from "recharts"
import axios from "axios"
import { API } from "@/lib/api"
import { CHART_TOOLTIP_STYLE as tooltipStyle, CHART_TOOLTIP_WRAPPER_STYLE as tooltipWrapperStyle, CHART_TOOLTIP_ITEM_STYLE as tooltipItemStyle, CHART_TOOLTIP_LABEL_STYLE as tooltipLabelStyle, formatCurrency, formatHour, toLocalDateStr, todayStr, daysAgoStr, localDateRange } from "@/lib/format"
import { CHART_CATEGORY_COLORS } from "@/lib/chart-colors"
import { SLA_WARN_MIN, SLA_CRIT_MIN, slaColor, prepMinutes, totalMinutes } from "@/lib/sla"
import { ORDER_STATUS_LABELS } from "@/lib/status"
import { useRestaurant } from "@/lib/restaurant-context"
import { StatusDot } from "@/components/ui/status-dot"
import { Button } from "@/components/ui/button"
import { downloadCsv } from "@/lib/export"

// Only COMPLETED orders are real revenue — cancelled/not-fulfilled/in-flight orders don't count
const REVENUE_STATES = ["COMPLETED"]
const NON_SALE_STATES = ["CANCELLED", "NOT_FULFILLED"]
const STATUS_FILTER_OPTIONS = ["PENDING", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED", "NOT_FULFILLED"]

const customerKey = (o) => o.user?.id ?? o.guestName ?? o.id

export function Analytics() {
  const restaurant = useRestaurant()
  const slaWarnMin = restaurant?.slaWarnMinutes ?? SLA_WARN_MIN
  const slaCritMin = restaurant?.slaCritMinutes ?? SLA_CRIT_MIN

  const [orders, setOrders] = useState([])
  const [menu, setMenu] = useState([])
  const [waiters, setWaiters] = useState([])
  const [loading, setLoading] = useState(false)

  // ── Filters (slicers) ─────────────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState(() => daysAgoStr(29))
  const [toDate, setToDate] = useState(todayStr)
  const [orderType, setOrderType] = useState("all") // all | pickup | delivery
  const [payment, setPayment] = useState("all") // all | COD | PHONEPE
  const [status, setStatus] = useState("all") // all | <OrderStatus>
  const [waiterId, setWaiterId] = useState("all")
  const [customerType, setCustomerType] = useState("all") // all | new | repeat

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = localDateRange(fromDate, toDate)
      const res = await axios.get(`${API}/api/order`, { params, withCredentials: true })
      setOrders(res.data)
    } catch {
      // stay quiet — charts just render empty
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchOrders() }, [fromDate, toDate])
  useEffect(() => {
    axios.get(`${API}/api/menu/`, { withCredentials: true }).then((r) => setMenu(r.data)).catch(() => {})
    axios.get(`${API}/api/waiter`, { withCredentials: true }).then((r) => setWaiters(r.data)).catch(() => {})
  }, [])

  const windowDays = Math.max(1, Math.round((new Date(toDate) - new Date(fromDate)) / 86400000) + 1)

  // "Repeat" is based on purchase history across the whole date-range fetch —
  // filtering by other dimensions shouldn't change who counts as a repeat
  // customer, only which of their orders show up.
  const orderCountByCustomerFull = {}
  orders.forEach((o) => { const k = customerKey(o); orderCountByCustomerFull[k] = (orderCountByCustomerFull[k] || 0) + 1 })
  const isRepeatCustomer = (o) => orderCountByCustomerFull[customerKey(o)] > 1

  // ── Apply slicers ────────────────────────────────────────────────────────────
  const filtered = orders.filter((o) => {
    if (orderType !== "all") {
      const isPickup = !o.guestVehicle
      if (orderType === "pickup" && !isPickup) return false
      if (orderType === "delivery" && isPickup) return false
    }
    if (payment !== "all" && o.paymentMethod !== payment) return false
    if (status !== "all" && o.status !== status) return false
    if (waiterId !== "all" && String(o.waiter?.id) !== waiterId) return false
    if (customerType !== "all") {
      const repeat = isRepeatCustomer(o)
      if (customerType === "repeat" && !repeat) return false
      if (customerType === "new" && repeat) return false
    }
    return true
  })
  // What actually sold — drop cancelled/not-fulfilled orders from item/category tallies
  const sold = filtered.filter((o) => !NON_SALE_STATES.includes(o.status))

  // menuItemId -> category name
  const catByItem = new Map(menu.map((m) => [m.id, m.category?.name || "Uncategorized"]))

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const committed = filtered.filter((o) => REVENUE_STATES.includes(o.status))
  const revenue = committed.reduce((s, o) => s + o.totalAmount, 0)
  const aov = committed.length ? revenue / committed.length : 0

  const cancelled = filtered.filter((o) => o.status === "CANCELLED" || o.status === "NOT_FULFILLED").length
  const resolved = filtered.filter((o) => ["COMPLETED", "CANCELLED", "NOT_FULFILLED"].includes(o.status)).length
  const completionRate = resolved ? Math.round((committed.length / resolved) * 100) : null
  const cancellationRate = resolved ? Math.round((cancelled / resolved) * 100) : null

  const orderCountByCustomer = {}
  filtered.forEach((o) => { const k = customerKey(o); orderCountByCustomer[k] = (orderCountByCustomer[k] || 0) + 1 })
  const distinctCustomers = Object.keys(orderCountByCustomer).length
  const repeatCustomers = Object.values(orderCountByCustomer).filter((n) => n > 1).length
  const returningPct = distinctCustomers ? Math.round((repeatCustomers / distinctCustomers) * 100) : 0
  const ordersFromRepeat = filtered.filter((o) => orderCountByCustomer[customerKey(o)] > 1).length

  const peakHourCounts = Array.from({ length: 24 }, () => 0)
  filtered.forEach((o) => { peakHourCounts[new Date(o.createdAt).getHours()] += 1 })
  const peakHour = peakHourCounts.some((c) => c > 0) ? peakHourCounts.indexOf(Math.max(...peakHourCounts)) : null

  const kpis = [
    { title: "Orders", value: filtered.length, icon: ShoppingBag, tint: "brand" },
    { title: "Revenue", value: formatCurrency(revenue), icon: IndianRupee, tint: "brand-secondary" },
    { title: "Avg Order Value", value: formatCurrency(aov), icon: Receipt, tint: "brand-accent" },
    {
      title: "Repeat Customers", value: `${repeatCustomers} (${returningPct}%)`, icon: Repeat, tint: "brand",
      tooltip: `${repeatCustomers} of ${distinctCustomers} customers placed more than one order in this range (${returningPct}% returning) · those customers placed ${ordersFromRepeat} of the ${filtered.length} orders shown.`,
    },
    { title: "Completion Rate", value: completionRate !== null ? `${completionRate}%` : "—", icon: CheckCircle2, tint: "brand-secondary" },
    { title: "Cancellation Rate", value: cancellationRate !== null ? `${cancellationRate}%` : "—", icon: XCircle, tint: "brand-accent" },
  ]

  // ── Best-selling categories, by revenue ──────────────────────────────────────
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
  const topCategories = Object.values(catAgg).sort((a, b) => b.revenue - a.revenue).slice(0, 8)

  // ── Top-selling items, by units sold ─────────────────────────────────────────
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

  // ── Orders by hour of day ─────────────────────────────────────────────────────
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}`, orders: 0 }))
  filtered.forEach((o) => { byHour[new Date(o.createdAt).getHours()].orders += 1 })

  // ── Orders — daily trend, zero-filled for days with no orders ────────────────
  const dailyOrders = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(`${fromDate}T00:00:00`)
    d.setDate(d.getDate() + i)
    const key = toLocalDateStr(d)
    const dayOrders = filtered.filter((o) => toLocalDateStr(new Date(o.createdAt)) === key)
    return {
      day: d.toLocaleDateString([], { day: "numeric", month: "short" }),
      orders: dayOrders.length,
      revenue: dayOrders.filter((o) => REVENUE_STATES.includes(o.status)).reduce((s, o) => s + o.totalAmount, 0),
    }
  })

  // ── Pickup vs In-Car ──────────────────────────────────────────────────────────
  const inCar = sold.filter((o) => o.guestVehicle).length
  const pickup = sold.length - inCar
  const fulfilmentTotal = inCar + pickup
  const fulfilment = [
    { name: "In-Car", value: inCar, pct: fulfilmentTotal ? Math.round((inCar / fulfilmentTotal) * 100) : 0 },
    { name: "Pickup", value: pickup, pct: fulfilmentTotal ? Math.round((pickup / fulfilmentTotal) * 100) : 0 },
  ].filter((d) => d.value > 0)

  // ── Prep time & total order time ─────────────────────────────────────────────
  // Prep = PREPARING→READY (kitchen only). Total = created→COMPLETED (the
  // customer's actual wait). Only orders that reached the relevant milestone
  // contribute a sample.
  const timed = filtered
    .map((o) => ({ order: o, mins: prepMinutes(o), totalMins: totalMinutes(o) }))
    .filter((t) => t.mins !== null || t.totalMins !== null)
  const prepSamples = timed.filter((t) => t.mins !== null)
  const totalSamples = timed.filter((t) => t.totalMins !== null)

  const avgPrepAll = prepSamples.length ? prepSamples.reduce((s, t) => s + t.mins, 0) / prepSamples.length : null
  const avgTotalAll = totalSamples.length ? totalSamples.reduce((s, t) => s + t.totalMins, 0) / totalSamples.length : null
  const breached = prepSamples.filter((t) => t.mins >= slaCritMin)

  const avg = (samples) => samples.reduce((s, v) => s + v, 0) / samples.length

  const catPrepAgg = {}
  prepSamples.forEach(({ order, mins }) => {
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
  prepSamples.forEach(({ order, mins }) => {
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

  // Daily avg prep + total time, oldest → newest — is SLA compliance improving?
  const dailyPrepTrend = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(`${fromDate}T00:00:00`)
    d.setDate(d.getDate() + i)
    const key = toLocalDateStr(d)
    const prepDay = prepSamples.filter((t) => toLocalDateStr(new Date(t.order.createdAt)) === key).map((t) => t.mins)
    const totalDay = totalSamples.filter((t) => toLocalDateStr(new Date(t.order.createdAt)) === key).map((t) => t.totalMins)
    return {
      day: d.toLocaleDateString([], { day: "numeric", month: "short" }),
      avgMin: prepDay.length ? avg(prepDay) : null,
      avgTotalMin: totalDay.length ? avg(totalDay) : null,
      breached: prepDay.filter((m) => m >= slaCritMin).length,
    }
  })

  // Avg prep time by order-placed hour, based only on orders that actually
  // reached READY — lines up against "Orders by hour" to show whether SLA
  // breaches cluster at rush times.
  const hourPrepSamples = Array.from({ length: 24 }, () => [])
  prepSamples.forEach((t) => hourPrepSamples[new Date(t.order.createdAt).getHours()].push(t.mins))
  const byHourPrep = hourPrepSamples.map((samples, h) => ({
    hour: `${h}`,
    avgMin: samples.length ? avg(samples) : null,
    orders: samples.length,
  }))

  const exportSections = [
    { title: "KPIs", rows: [["Metric", "Value"], ...kpis.map((k) => [k.title, String(k.value)])] },
    { title: "Orders by day", rows: [["Date", "Orders", "Revenue"], ...dailyOrders.map((d) => [d.day, d.orders, d.revenue.toFixed(2)])] },
    { title: "Best-selling categories", rows: [["Category", "Units sold", "Revenue"], ...topCategories.map((c) => [c.name, c.units, c.revenue.toFixed(2)])] },
    { title: "Top items", rows: [["Item", "Units sold", "Revenue"], ...topItems.map((i) => [i.name, i.units, i.revenue.toFixed(2)])] },
    { title: "Orders by hour", rows: [["Hour", "Orders"], ...byHour.map((h) => [formatHour(h.hour), h.orders])] },
    { title: "Daily prep + total time trend", rows: [["Date", "Avg prep (min)", "Avg total (min)", "Orders over SLA"], ...dailyPrepTrend.map((d) => [d.day, d.avgMin != null ? d.avgMin.toFixed(1) : "", d.avgTotalMin != null ? d.avgTotalMin.toFixed(1) : "", d.breached])] },
    { title: "Prep time by hour", rows: [["Hour", "Avg prep (min)", "Orders"], ...byHourPrep.map((h) => [formatHour(h.hour), h.avgMin != null ? h.avgMin.toFixed(1) : "", h.orders])] },
    { title: "Prep time by category", rows: [["Category", "Avg prep (min)", "Orders"], ...catPrepTrend.map((c) => [c.name, c.avgMin.toFixed(1), c.orders])] },
    { title: "Slowest items (prep time)", rows: [["Item", "Avg prep (min)", "Orders"], ...itemPrepTrend.map((i) => [i.name, i.avgMin.toFixed(1), i.orders])] },
  ]

  const isToday = fromDate === todayStr() && toDate === todayStr()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-800">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Key trends from the selected range.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => downloadCsv(`analytics-${todayStr()}.csv`, exportSections)}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="space-y-6">

      {/* Filters (slicers) — every chart/KPI below reacts to these. Every
          control here is deliberately narrow so the whole bar fits on one
          row at common laptop widths instead of the last item wrapping. */}
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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={k.title} className="border-0 shadow-sm anim-fade-up" style={{ animationDelay: `${i * 60}ms` }} title={k.tooltip}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  {k.title}
                  {k.tooltip && <Info className="h-3 w-3 text-slate-400" />}
                </p>
                <div className={`p-1.5 rounded-lg ${k.tint}-bg-subtle`}>
                  <k.icon className={`h-4 w-4 ${k.tint}-text`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading && orders.length === 0 ? (
        <p className="text-slate-400 text-sm text-center py-16">Loading…</p>
      ) : filtered.length === 0 ? (
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
            <BarChart data={dailyOrders} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                interval="preserveStartEnd" minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={28} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={tooltipStyle}
                wrapperStyle={tooltipWrapperStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                formatter={(v, _n, p) => [`${v} order${v === 1 ? "" : "s"} · ${formatCurrency(p.payload.revenue)}`, "Orders"]}
              />
              <Bar dataKey="orders" fill="var(--brand, #f97316)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Daily prep + total time trend — is SLA compliance improving or slipping? */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <Timer className="h-4 w-4" /> Prep time vs total order time · {windowDays} day{windowDays === 1 ? "" : "s"}
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            Prep = kitchen only (PREPARING→READY) · Total = the customer's full wait (placed→COMPLETED)
            {avgPrepAll !== null && ` · avg prep ${avgPrepAll.toFixed(1)}m`}
            {avgTotalAll !== null && ` · avg total ${avgTotalAll.toFixed(1)}m`}
          </p>
        </CardHeader>
        <CardContent>
          {timed.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-16">No timed orders yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={dailyPrepTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                  interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={32} allowDecimals={false}
                  tickFormatter={(v) => `${v}m`} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  wrapperStyle={tooltipWrapperStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(v, n) => {
                    if (v == null) return ["No orders", n === "avgMin" ? "Prep" : "Total"]
                    return [`${v.toFixed(1)}m`, n === "avgMin" ? "Avg prep" : "Avg total"]
                  }}
                />
                <Legend iconType="circle" iconSize={8} formatter={(v) => (
                  <span className="text-xs text-slate-600">{v === "avgMin" ? "Prep time" : "Total time"}</span>
                )} />
                <ReferenceLine y={slaWarnMin} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: `${slaWarnMin}m`, position: "insideTopLeft", fontSize: 10, fill: "#f59e0b" }} />
                <ReferenceLine y={slaCritMin} stroke="#ef4444" strokeDasharray="4 4"
                  label={{ value: `${slaCritMin}m SLA`, position: "insideTopLeft", fontSize: 10, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="avgMin" stroke="var(--brand, #f97316)" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="avgTotalMin" stroke="var(--brand-secondary, #7c3aed)" strokeWidth={2} dot={false} connectNulls={false} />
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
              <Trophy className="h-4 w-4" /> Best-selling categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No sales yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topCategories.length * 44)}>
                <BarChart data={topCategories} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a"
                    tickFormatter={(v) => formatCurrency(v)}
                    label={{ value: "revenue", position: "insideBottom", offset: -4, fontSize: 11, fill: "#71717a" }} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={110} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={tooltipStyle}
                    wrapperStyle={tooltipWrapperStyle}
                    itemStyle={tooltipItemStyle}
                    labelStyle={tooltipLabelStyle}
                    formatter={(v, _n, p) => [`${formatCurrency(v)} · ${p.payload.units} sold`, p.payload.name]}
                  />
                  <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={26}>
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
                  <Tooltip contentStyle={tooltipStyle} wrapperStyle={tooltipWrapperStyle}
                    itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle}
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

      {/* Top items + Orders by hour */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Top items</CardTitle>
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
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              Orders by hour {peakHour !== null && <span className="normal-case text-slate-400 font-normal">· peak {formatHour(peakHour)}</span>}
            </CardTitle>
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
                  wrapperStyle={tooltipWrapperStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(v) => [`${v} orders`, "Orders"]}
                  labelFormatter={(h) => formatHour(h)}
                />
                <Bar dataKey="orders" fill="url(#hourGradient)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

      {/* Prep-time trends — which categories/items blow past the kitchen SLA */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <Timer className="h-4 w-4" /> Prep-time breakdown
          </CardTitle>
          <p className="text-xs text-slate-400 mt-1">
            {avgPrepAll !== null
              ? `Avg ${avgPrepAll.toFixed(1)}m to prepare · ${breached.length} order${breached.length === 1 ? "" : "s"} over the ${slaCritMin}m SLA`
              : "No completed prep times yet"}
          </p>
        </CardHeader>
        <CardContent>
          {prepSamples.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-16">No completed prep times yet</p>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2">By category — slowest first</p>
                  <ResponsiveContainer width="100%" height={Math.max(120, catPrepTrend.length * 30)}>
                    <BarChart data={catPrepTrend} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 18 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a"
                        label={{ value: "avg minutes", position: "insideBottom", offset: -4, fontSize: 11, fill: "#71717a" }} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={100} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={tooltipStyle}
                        wrapperStyle={tooltipWrapperStyle}
                        itemStyle={tooltipItemStyle}
                        labelStyle={tooltipLabelStyle}
                        formatter={(v, _n, p) => [`${v.toFixed(1)}m avg · ${p.payload.orders} order${p.payload.orders === 1 ? "" : "s"}`, p.payload.name]}
                      />
                      <Bar dataKey="avgMin" radius={[0, 6, 6, 0]} maxBarSize={22}>
                        {catPrepTrend.map((c) => <Cell key={c.name} fill={slaColor(c.avgMin, slaWarnMin, slaCritMin)} />)}
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
                        <StatusDot color={slaColor(it.avgMin, slaWarnMin, slaCritMin)} className="flex-shrink-0">{it.avgMin.toFixed(1)}m</StatusDot>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 mt-5 pt-4 border-t border-slate-100">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slaColor(0, slaWarnMin, slaCritMin) }} /> On time (&lt;{slaWarnMin}m)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: slaColor(slaWarnMin, slaWarnMin, slaCritMin) }} /> Slow ({slaWarnMin}–{slaCritMin}m)
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <AlertTriangle className="h-3 w-3 text-red-500" /> Over SLA (&gt;{slaCritMin}m)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      </>
      )}
      </div>
    </div>
  )
}
