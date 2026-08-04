"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, RefreshCw, Eye, ScanLine, Calendar } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
import { OrderInvoice } from "@/components/order-invoice"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/status"
import { StatusDot } from "@/components/ui/status-dot"
import { todayStr, daysAgoStr, localDateRange, PAYMENT_METHOD_LABELS } from "@/lib/format"

const STATUS_KEYS = ["all", "PENDING", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED", "NOT_FULFILLED"]

export function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [fromDate, setFromDate] = useState(todayStr)
  const [toDate, setToDate] = useState(todayStr)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)

  // Server-side date filtering — the backend only returns orders in [fromDate, toDate],
  // so this stays cheap even as order history grows (no more fetching everything client-side).
  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = (fromDate && toDate) ? localDateRange(fromDate, toDate) : {}
      const res = await axios.get(`${API}/api/order`, { params, withCredentials: true })
      setOrders(res.data)
    } catch {
      toast.error("Failed to fetch orders")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    const t = setInterval(fetchOrders, 2000)
    return () => clearInterval(t)
  }, [fromDate, toDate])

  const updateOrderStatus = async (orderId, status) => {
    // Optimistic — flip the status locally right away so the badge/buttons don't
    // sit on the old status for the round trip; fetchOrders() reconciles after.
    const previous = orders
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)))
    try {
      await axios.put(`${API}/api/order/${orderId}/status`, { status }, { withCredentials: true })
      toast.success(`Order marked ${status.toLowerCase()}`)
      fetchOrders()
    } catch {
      setOrders(previous)
      toast.error("Failed to update status")
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.user?.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toString().includes(searchTerm) ||
      order.dailyOrderNumber?.toString().includes(searchTerm)
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = Object.fromEntries(
    STATUS_KEYS.map((s) => [s, s === "all" ? orders.length : orders.filter((o) => o.status === s).length])
  )

  const rangeRevenue = orders
    .filter((o) => o.status === "COMPLETED")
    .reduce((sum, o) => sum + o.totalAmount, 0)

  const isToday = fromDate === todayStr() && toDate === todayStr()
  const fmtDay = (s) => new Date(s + "T00:00:00").toLocaleDateString([], { day: "numeric", month: "short" })

  return (
    <div className="space-y-5">
      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(statusCounts).map(([status, count]) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === status
                ? "brand-bg text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {status === "all" ? "All" : ORDER_STATUS_LABELS[status] || status} · {count}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchOrders()}
          disabled={loading}
          className="ml-auto h-8 text-slate-500 hover:text-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Date range + search */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <Input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="bg-white w-[132px] sm:w-[150px]"
          />
          <span className="text-slate-400 text-sm">–</span>
          <Input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setToDate(e.target.value)}
            className="bg-white w-[132px] sm:w-[150px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant={isToday ? "secondary" : "outline"} size="sm" className="text-xs"
            onClick={() => { setFromDate(todayStr()); setToDate(todayStr()) }}>
            Today
          </Button>
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => { setFromDate(daysAgoStr(6)); setToDate(todayStr()) }}>
            Last 7 days
          </Button>
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => { setFromDate(daysAgoStr(29)); setToDate(todayStr()) }}>
            Last 30 days
          </Button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input
            placeholder="Search by name or order ID…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
      </div>

      {/* Range summary */}
      <p className="text-xs text-slate-400">
        {isToday ? "Today" : `${fmtDay(fromDate)} – ${fmtDay(toDate)}`}
        {" · "}{orders.length} order{orders.length === 1 ? "" : "s"}
        {" · "}₹{rangeRevenue.toLocaleString("en-IN")} revenue
      </p>

      {/* Orders */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-12">No orders found</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredOrders.map((order) => (
                <div key={order.id} className="px-4 sm:px-5 py-4 hover:bg-muted/40 transition-colors">
                  <div className="flex flex-wrap items-start justify-between gap-y-2">
                    <div className="flex items-start gap-4 min-w-0">
                      <span className="text-xs font-mono text-slate-400 pt-0.5 w-10 flex-shrink-0">#{order.dailyOrderNumber ?? order.id}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {order.user?.customerName || order.guestName || "Guest"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {order.guestVehicle
                            ? order.guestVehicle
                            : <span className="text-amber-600 font-medium">Pickup</span>}
                          {" · "}
                          <span className={order.paymentMethod === "PHONEPE" ? "text-violet-600 font-medium" : "text-slate-500 font-medium"}>
                            {order.paymentMethod === "PHONEPE" ? "PhonePe" : "COD"}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {order.orderItems?.map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—"}
                        </p>
                        {order.status === "COMPLETED" && order.waiter?.name && (
                          <p className="text-xs text-emerald-600 mt-1 inline-flex items-center gap-1">
                            <ScanLine className="h-3 w-3" /> Delivered by {order.waiter.name}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-slate-900">₹{order.totalAmount.toFixed(0)}</span>
                      <StatusDot color={ORDER_STATUS_COLORS[order.status] || "#94a3b8"} className="w-24">{ORDER_STATUS_LABELS[order.status] || order.status}</StatusDot>
                      <span className="text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3 ml-14">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Order #{selectedOrder?.dailyOrderNumber ?? selectedOrder?.id}</DialogTitle></DialogHeader>
                        {selectedOrder && (
                          <div className="space-y-4 pt-1">
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Customer</p>
                              <p className="text-sm font-medium">{selectedOrder.user?.customerName || selectedOrder.guestName}</p>
                              {selectedOrder.user?.phoneNumber && <p className="text-sm text-slate-500">{selectedOrder.user.phoneNumber}</p>}
                              <p className="text-sm text-slate-500">
                                {selectedOrder.guestVehicle ? `Vehicle: ${selectedOrder.guestVehicle}` : "Pickup order"}
                              </p>
                              <p className="text-sm text-slate-500">
                                Payment: {PAYMENT_METHOD_LABELS[selectedOrder.paymentMethod] || "Cash on Delivery"}
                              </p>
                            </div>
                            {selectedOrder.waiter?.name && (
                              <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Delivered by</p>
                                <p className="text-sm font-medium text-emerald-600">{selectedOrder.waiter.name}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Items</p>
                              <div className="space-y-1.5">
                                {selectedOrder.orderItems?.map((item) => (
                                  <div key={item.id} className="flex justify-between text-sm">
                                    <div>
                                      <span>{item.quantity}× {item.name}</span>
                                      {item.options?.length > 0 && (
                                        <p className="text-xs text-slate-400">{item.options.map((o) => o.name).join(", ")}</p>
                                      )}
                                    </div>
                                    <span>₹{(item.finalPrice * item.quantity).toFixed(0)}</span>
                                  </div>
                                ))}
                                <div className="border-t pt-2 flex justify-between font-semibold text-sm">
                                  <span>Total</span>
                                  <span>₹{selectedOrder.totalAmount.toFixed(0)}</span>
                                </div>
                              </div>
                            </div>
                            {selectedOrder.deliveryInstructions && (
                              <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Instructions</p>
                                <p className="text-sm text-slate-700">{selectedOrder.deliveryInstructions}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>

                    {(order.status === "PENDING" || order.status === "PAID") && (
                      <>
                        <Button size="sm" className="text-xs brand-bg text-white"
                          onClick={() => updateOrderStatus(order.id, "PREPARING")}>
                          Start Preparing
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs text-red-500 hover:bg-red-50"
                          onClick={() => updateOrderStatus(order.id, "CANCELLED")}>
                          Cancel
                        </Button>
                      </>
                    )}
                    {order.status === "PREPARING" && (
                      <Button size="sm" className="text-xs bg-sky-600 hover:bg-sky-700 text-white"
                        onClick={() => updateOrderStatus(order.id, "READY")}>
                        Mark Ready
                      </Button>
                    )}
                    {order.status === "READY" && (
                      <span className="text-xs text-sky-600 font-medium inline-flex items-center gap-1 mr-1">
                        <ScanLine className="h-3.5 w-3.5" /> Awaiting delivery scan
                      </span>
                    )}
                    {(order.status === "PENDING" || order.status === "PAID" || order.status === "PREPARING" || order.status === "READY") && (
                      <Button size="sm" variant="outline" className="text-xs text-purple-600 hover:bg-purple-50"
                        onClick={() => updateOrderStatus(order.id, "NOT_FULFILLED")}>
                        Not Fulfilled
                      </Button>
                    )}

                    <OrderInvoice order={order} />
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
