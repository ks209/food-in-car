"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, RefreshCw, Eye, ScanLine } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
import { OrderInvoice } from "@/components/order-invoice"

const STATUS_PILL = {
  PENDING:    "bg-blue-50 text-blue-700",
  PAID:       "bg-emerald-50 text-emerald-700",
  PREPARING:  "bg-amber-50 text-amber-700",
  READY:      "bg-sky-50 text-sky-700",
  COMPLETED:  "bg-slate-100 text-slate-600",
  CANCELLED:  "bg-red-50 text-red-700",
}

const STATUS_KEYS = ["all", "PENDING", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED"]

export function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/api/order`, { withCredentials: true })
      setOrders(res.data)
    } catch {
      toast.error("Failed to fetch orders")
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh so the kitchen view stays live
  useEffect(() => {
    fetchOrders()
    const t = setInterval(fetchOrders, 15000)
    return () => clearInterval(t)
  }, [])

  const updateOrderStatus = async (orderId, status) => {
    try {
      await axios.put(`${API}/api/order/${orderId}/status`, { status }, { withCredentials: true })
      toast.success(`Order marked ${status.toLowerCase()}`)
      fetchOrders()
    } catch {
      toast.error("Failed to update status")
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.user?.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.guestName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toString().includes(searchTerm)
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = Object.fromEntries(
    STATUS_KEYS.map((s) => [s, s === "all" ? orders.length : orders.filter((o) => o.status === s).length])
  )

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
            {status === "all" ? "All" : status} · {count}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchOrders}
          disabled={loading}
          className="ml-auto h-8 text-slate-500 hover:text-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
        <Input
          placeholder="Search by name or order ID…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-white"
        />
      </div>

      {/* Orders */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {filteredOrders.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-12">No orders found</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {filteredOrders.map((order) => (
                <div key={order.id} className="px-5 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <span className="text-xs font-mono text-slate-400 pt-0.5 w-10">#{order.id}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {order.user?.customerName || order.guestName || "Guest"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {order.guestVehicle
                            ? order.guestVehicle
                            : <span className="text-amber-600 font-medium">Pickup</span>}
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[order.status] || "bg-slate-100 text-slate-600"}`}>
                        {order.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 ml-14">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Order #{selectedOrder?.id}</DialogTitle></DialogHeader>
                        {selectedOrder && (
                          <div className="space-y-4 pt-1">
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Customer</p>
                              <p className="text-sm font-medium">{selectedOrder.user?.customerName || selectedOrder.guestName}</p>
                              {selectedOrder.user?.phoneNumber && <p className="text-sm text-slate-500">{selectedOrder.user.phoneNumber}</p>}
                              <p className="text-sm text-slate-500">
                                {selectedOrder.guestVehicle ? `Vehicle: ${selectedOrder.guestVehicle}` : "Pickup order"}
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

                    {order.status === "PENDING" && (
                      <>
                        <Button size="sm" className="h-7 text-xs brand-bg text-white"
                          onClick={() => updateOrderStatus(order.id, "PREPARING")}>
                          Start Preparing
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 hover:bg-red-50"
                          onClick={() => updateOrderStatus(order.id, "CANCELLED")}>
                          Cancel
                        </Button>
                      </>
                    )}
                    {order.status === "PAID" && (
                      <Button size="sm" className="h-7 text-xs brand-bg text-white"
                        onClick={() => updateOrderStatus(order.id, "PREPARING")}>
                        Start Preparing
                      </Button>
                    )}
                    {order.status === "PREPARING" && (
                      <Button size="sm" className="h-7 text-xs bg-sky-600 hover:bg-sky-700 text-white"
                        onClick={() => updateOrderStatus(order.id, "READY")}>
                        Mark Ready
                      </Button>
                    )}
                    {order.status === "READY" && (
                      <span className="text-xs text-sky-600 font-medium inline-flex items-center gap-1">
                        <ScanLine className="h-3.5 w-3.5" /> Awaiting delivery scan
                      </span>
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
