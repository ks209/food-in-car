"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, IndianRupee, Clock, ChefHat } from "lucide-react"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts"
import axios from "axios"

import { API } from "@/lib/api"
import { CHART_TOOLTIP_STYLE, formatCurrency } from "@/lib/format"
import { ORDER_STATUS_COLORS } from "@/lib/status"
import { StatusDot } from "@/components/ui/status-dot"

// Revenue counts orders the customer has committed to (not pending/cancelled)
const REVENUE_STATES = ["PAID", "PREPARING", "READY", "COMPLETED"]

export function DashboardOverview() {
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])

  useEffect(() => {
    axios.get(`${API}/api/order`, { withCredentials: true }).then((r) => setOrders(r.data)).catch(() => {})
    axios.get(`${API}/api/menu/`, { withCredentials: true }).then((r) => setMenuItems(r.data)).catch(() => {})
  }, [])

  const today = new Date().toDateString()
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today)
  const revenueToday = todayOrders.filter((o) => REVENUE_STATES.includes(o.status)).reduce((sum, o) => sum + o.totalAmount, 0)
  const activeOrders = orders.filter((o) => ["PENDING", "PAID", "PREPARING", "READY"].includes(o.status)).length

  // Exclude soft-deleted items (isActive === false); split the rest by availability
  const liveItems = menuItems.filter((m) => m.isActive !== false)
  const activeItems = liveItems.filter((m) => m.available).length
  const inactiveItems = liveItems.filter((m) => !m.available).length

  const stats = [
    { title: "Orders Today", value: todayOrders.length, icon: ShoppingBag },
    { title: "Revenue Today", value: formatCurrency(revenueToday), icon: IndianRupee },
    { title: "Active Orders", value: activeOrders, icon: Clock },
    { title: "Menu Items", value: liveItems.length, icon: ChefHat,
      sub: `${activeItems} active · ${inactiveItems} inactive` },
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

  // Orders grouped by status
  const byStatus = Object.entries(
    orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc }, {})
  ).map(([name, value]) => ({ name, value, pct: orders.length ? Math.round((value / orders.length) * 100) : 0 }))

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={stat.title} className="border-0 shadow-sm anim-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.title}</p>
                <stat.icon className="h-4 w-4 text-slate-300" />
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{stat.value}</p>
              {stat.sub && <p className="text-xs text-slate-400 mt-1">{stat.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Revenue · last 15 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenue15d} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="#71717a"
                  interval="preserveStartEnd" minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={54}
                  tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip formatter={(v) => [formatCurrency(v), "Revenue"]} cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="revenue" fill="var(--brand, #f97316)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Orders by status</CardTitle>
          </CardHeader>
          <CardContent>
            {byStatus.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {byStatus.map((s) => <Cell key={s.name} fill={ORDER_STATUS_COLORS[s.name] || "#cbd5e1"} />)}
                  </Pie>
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
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

      {/* Recent orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Recent Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {orders.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No orders yet</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {orders.slice(0, 8).map((order) => (
                <div key={order.id} className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-slate-400 w-10">#{order.id}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {order.user?.customerName || order.guestName || "Guest"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {order.guestVehicle
                          ? order.guestVehicle
                          : <span className="text-amber-600 font-medium">Pickup</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-slate-800">₹{order.totalAmount.toFixed(0)}</span>
                    <StatusDot color={ORDER_STATUS_COLORS[order.status] || "#94a3b8"} className="w-24">{order.status}</StatusDot>
                    <span className="text-xs text-slate-400 w-12 text-right">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
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
