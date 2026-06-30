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

const STATUS_PILL = {
  PREPARING:  "bg-amber-50 text-amber-700",
  READY:      "bg-sky-50 text-sky-700",
  PAID:       "bg-emerald-50 text-emerald-700",
  COMPLETED:  "bg-slate-100 text-slate-600",
  CANCELLED:  "bg-red-50 text-red-700",
  PENDING:    "bg-blue-50 text-blue-700",
}

// Revenue counts orders the customer has committed to (not pending/cancelled)
const REVENUE_STATES = ["PAID", "PREPARING", "READY", "COMPLETED"]
const STATUS_COLORS = {
  PENDING: "#3b82f6", PAID: "#10b981", PREPARING: "#f59e0b",
  READY: "#0ea5e9", COMPLETED: "#64748b", CANCELLED: "#ef4444",
}

export function DashboardOverview() {
  const [orders, setOrders] = useState([])
  const [menuCount, setMenuCount] = useState(0)

  useEffect(() => {
    axios.get(`${API}/api/order`, { withCredentials: true }).then((r) => setOrders(r.data)).catch(() => {})
    axios.get(`${API}/api/menu/`, { withCredentials: true }).then((r) => setMenuCount(r.data.length)).catch(() => {})
  }, [])

  const today = new Date().toDateString()
  const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today)
  const revenueToday = todayOrders.filter((o) => REVENUE_STATES.includes(o.status)).reduce((sum, o) => sum + o.totalAmount, 0)
  const activeOrders = orders.filter((o) => ["PENDING", "PAID", "PREPARING", "READY"].includes(o.status)).length

  const stats = [
    { title: "Orders Today", value: todayOrders.length, icon: ShoppingBag },
    { title: "Revenue Today", value: `₹${revenueToday.toFixed(0)}`, icon: IndianRupee },
    { title: "Active Orders", value: activeOrders, icon: Clock },
    { title: "Menu Items", value: menuCount, icon: ChefHat },
  ]

  // Revenue for the last 7 days (committed orders), oldest → newest
  const revenue7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const key = d.toDateString()
    const revenue = orders
      .filter((o) => REVENUE_STATES.includes(o.status) && new Date(o.createdAt).toDateString() === key)
      .reduce((s, o) => s + o.totalAmount, 0)
    return { day: d.toLocaleDateString([], { weekday: "short" }), revenue }
  })

  // Orders grouped by status
  const byStatus = Object.entries(
    orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc }, {})
  ).map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={stat.title} className="border shadow-sm anim-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{stat.title}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                </div>
                <div className="p-2.5 rounded-xl brand-bg-subtle">
                  <stat.icon className="h-5 w-5 brand-text" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Revenue · last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenue7d} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#71717a" width={48}
                  tickFormatter={(v) => `₹${v}`} />
                <Tooltip formatter={(v) => [`₹${v}`, "Revenue"]} cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fafafa", fontSize: 12 }} />
                <Bar dataKey="revenue" fill="var(--brand, #f97316)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Orders by status</CardTitle>
          </CardHeader>
          <CardContent>
            {byStatus.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-16">No orders yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {byStatus.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name] || "#cbd5e1"} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1c1c1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#fafafa", fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Recent Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No orders yet</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {orders.slice(0, 8).map((order) => (
                <div key={order.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-slate-400 w-10">#{order.id}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {order.user?.customerName || order.guestName || "Guest"}
                      </p>
                      {(order.guestVehicle || order.user?.vehicles?.[0]) && (
                        <p className="text-xs text-slate-400">{order.guestVehicle || order.user?.vehicles?.[0]}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-slate-800">₹{order.totalAmount.toFixed(0)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[order.status] || "bg-slate-100 text-slate-600"}`}>
                      {order.status}
                    </span>
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
