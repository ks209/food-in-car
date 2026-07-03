"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, IndianRupee, Receipt, Repeat, Trophy } from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import axios from "axios"
import { API } from "@/lib/api"

// Committed orders count toward revenue (exclude pending/cancelled)
const REVENUE_STATES = ["PAID", "PREPARING", "READY", "COMPLETED"]
const WINDOW_DAYS = 30
const CAT_COLORS = ["#f59e0b", "#0ea5e9", "#10b981", "#a855f7", "#ef4444", "#ec4899", "#14b8a6", "#eab308"]

const tooltipStyle = {
  background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 10, color: "#fafafa", fontSize: 12,
}

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
    { title: "Orders", value: recent.length, icon: ShoppingBag },
    { title: "Revenue", value: `₹${revenue.toFixed(0)}`, icon: IndianRupee },
    { title: "Avg Order Value", value: `₹${aov.toFixed(0)}`, icon: Receipt },
    { title: "Repeat Customers", value: repeatCustomers, icon: Repeat },
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
  const fulfilment = [
    { name: "In-Car", value: inCar },
    { name: "Pickup", value: pickup },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-800">Analytics</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Key trends from the last {WINDOW_DAYS} days.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <Card key={k.title} className="border shadow-sm anim-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.title}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{k.value}</p>
                </div>
                <div className="p-2.5 rounded-xl brand-bg-subtle">
                  <k.icon className="h-5 w-5 brand-text" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Best-selling categories + Fulfilment split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Best-selling categories · {WINDOW_DAYS} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No sales yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topCategories.length * 44)}>
                <BarChart data={topCategories} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={110} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={tooltipStyle}
                    formatter={(v, _n, p) => [`${v} sold · ₹${p.payload.revenue.toFixed(0)}`, p.payload.name]}
                  />
                  <Bar dataKey="units" radius={[0, 6, 6, 0]} maxBarSize={26}>
                    {topCategories.map((c, i) => <Cell key={c.name} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Pickup vs In-Car</CardTitle>
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
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
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
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Top items · {WINDOW_DAYS} days</CardTitle>
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
                        <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{it.units} sold · ₹{it.revenue.toFixed(0)}</span>
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
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Orders by hour · {WINDOW_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={byHour} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a" interval={2} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={28} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} orders`, "Orders"]}
                  labelFormatter={(h) => `${h}:00 – ${h}:59`}
                />
                <Bar dataKey="orders" fill="var(--brand, #f97316)" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
