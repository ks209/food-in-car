"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, RefreshCw, Eye, ScanLine, Calendar, Undo2, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
import { OrderInvoice } from "@/components/order-invoice"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/status"
import { StatusDot } from "@/components/ui/status-dot"
import { todayStr, daysAgoStr, localDateRange, orderTimeLabel, PAYMENT_METHOD_LABELS } from "@/lib/format"

// No PENDING: GET /api/order never returns unpaid orders, so that chip was always 0.
const STATUS_KEYS = ["all", "PAID", "PREPARING", "READY", "COMPLETED", "CANCELLED", "NOT_FULFILLED"]

// Grouped in the day-end report, so these are a fixed list rather than free
// text — "out of stock" three times a week is a purchasing problem.
const END_REASONS = ["Out of stock", "Customer cancelled", "Kitchen error", "Wrong order", "Too busy", "Other"]

// Refund owed on a cancelled / not-fulfilled PhonePe order (see backend
// utils/refunds.js). Automatic refunds are off: the restaurant refunds in
// PhonePe and records it here.
function RefundStatus({ order, onMarkDone }) {
  const refund = order.refunds?.[0]
  if (!refund) return null
  const amount = `₹${refund.amount.toFixed(0)}`
  if (refund.status === "COMPLETED") {
    return <p className="text-xs text-emerald-600 mt-1 inline-flex items-center gap-1"><Undo2 className="h-3 w-3" /> Refunded {amount}</p>
  }
  // DUE (and legacy PENDING/FAILED rows): the restaurant refunds in PhonePe,
  // then records it here — the app doesn't move the money itself.
  return (
    <p className="text-xs text-amber-600 mt-1 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1" title={refund.error || undefined}>
        <AlertTriangle className="h-3 w-3" /> Refund {amount} due — refund in PhonePe
      </span>
      <button type="button" onClick={onMarkDone} className="underline font-medium hover:text-amber-700">Mark refunded</button>
    </p>
  )
}

export function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [fromDate, setFromDate] = useState(todayStr)
  const [toDate, setToDate] = useState(todayStr)
  // Whether the range is "today" as picked by the user — if so it rolls over
  // to the new day on its own when the dashboard is left open past day end.
  const [followToday, setFollowToday] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  // Order being cancelled / marked not fulfilled, and why
  const [endTarget, setEndTarget] = useState(null)
  const [endReason, setEndReason] = useState("")
  const [endNote, setEndNote] = useState("")
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  // Range of the latest request — a slow response for a range the user has
  // already moved away from must not overwrite the new range's orders.
  const currentRange = useRef("")
  currentRange.current = `${fromDate}|${toDate}`

  const setRange = (from, to) => {
    if (!from || !to) return // a cleared date input would otherwise fetch every order ever
    if (from > to) to = from
    setFromDate(from)
    setToDate(to)
    setFollowToday(from === todayStr() && to === todayStr())
  }

  // Server-side date filtering — the backend only returns orders in [fromDate, toDate],
  // so this stays cheap even as order history grows (no more fetching everything client-side).
  // `manual` = a user action (range change, Refresh): only those show the
  // spinner and error toast, not the silent 2s poll.
  const fetchOrders = async ({ manual = false } = {}) => {
    const range = `${fromDate}|${toDate}`
    if (manual) setLoading(true)
    try {
      const res = await axios.get(`${API}/api/order`, { params: localDateRange(fromDate, toDate), withCredentials: true })
      if (currentRange.current === range) setOrders(res.data)
    } catch {
      if (manual) toast.error("Failed to fetch orders")
    } finally {
      if (manual) setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders({ manual: true })
    const t = setInterval(() => {
      if (followToday && fromDate !== todayStr()) {
        setFromDate(todayStr()); setToDate(todayStr()) // new business day — re-runs this effect
        return
      }
      fetchOrders()
    }, 2000)
    return () => clearInterval(t)
  }, [fromDate, toDate, followToday])

  // Lets other screens deep-link into a pre-filtered view (?status=READY from
  // the Overview live strip). Read off window rather than useSearchParams so
  // this page doesn't need a Suspense boundary to stay statically renderable.
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status")
    if (status && STATUS_KEYS.includes(status)) setStatusFilter(status)
  }, [])

  const updateOrderStatus = async (orderId, status) => {
    // Ending an order needs a reason (the server requires one) — collected in
    // a dialog, which also warns about the refund. See endOrder() below.
    if (status === "CANCELLED" || status === "NOT_FULFILLED") {
      setEndTarget({ order: orders.find((o) => o.id === orderId), status })
      setEndReason(""); setEndNote("")
      return
    }
    // Optimistic — flip the status locally right away so the badge/buttons don't
    // sit on the old status for the round trip; fetchOrders() reconciles after.
    const previous = orders
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)))
    try {
      const res = await axios.put(`${API}/api/order/${orderId}/status`, { status }, { withCredentials: true })
      const refund = res.data?.refunds?.[0]
      toast.success(refund && refund.status !== "COMPLETED"
        ? `Order ${status === "CANCELLED" ? "cancelled" : "marked not fulfilled"} · ₹${refund.amount.toFixed(0)} to refund in PhonePe`
        : `Order marked ${status.toLowerCase()}`)
      fetchOrders()
    } catch (err) {
      setOrders(previous)
      toast.error(err.response?.data?.error || "Failed to update status")
    }
  }

  // Cancel / not-fulfilled, with the reason the day-end report groups by.
  const endOrder = async () => {
    if (!endTarget || !endReason) return
    const { order, status } = endTarget
    const reason = endNote.trim() ? `${endReason}: ${endNote.trim()}` : endReason
    setEndTarget(null)
    const previous = orders
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)))
    try {
      const res = await axios.put(`${API}/api/order/${order.id}/status`, { status, reason }, { withCredentials: true })
      const refund = res.data?.refunds?.[0]
      toast.success(refund && refund.status !== "COMPLETED"
        ? `Order ${status === "CANCELLED" ? "cancelled" : "marked not fulfilled"} · ₹${refund.amount.toFixed(0)} to refund in PhonePe`
        : `Order ${status === "CANCELLED" ? "cancelled" : "marked not fulfilled"}`)
      fetchOrders()
    } catch (err) {
      setOrders(previous)
      toast.error(err.response?.data?.error || "Failed to update status")
    }
  }

  // Records a refund the restaurant made in PhonePe themselves — the app
  // doesn't move money (see backend utils/refunds.js).
  const markRefunded = async (orderId, amount) => {
    if (!window.confirm(`Mark ₹${amount.toFixed(0)} as refunded? Do this only after refunding the customer in PhonePe.`)) return
    try {
      await axios.post(`${API}/api/order/${orderId}/refund-done`, {}, { withCredentials: true })
      toast.success("Marked as refunded")
      fetchOrders()
    } catch (err) {
      toast.error(err.response?.data?.error || "Couldn't record the refund")
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

  // The details dialog reads the live copy from the poll, not the snapshot
  // taken when it was opened — otherwise it keeps showing the old status.
  const shownOrder = orders.find((o) => o.id === selectedOrder?.id) || selectedOrder

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
            className={`filter-chip ${statusFilter === status ? "filter-chip-active" : ""}`}
          >
            {status === "all" ? "All" : ORDER_STATUS_LABELS[status] || status} · {count}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchOrders({ manual: true })}
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
            onChange={(e) => setRange(e.target.value, toDate)}
            className="bg-white w-[132px] sm:w-[150px]"
          />
          <span className="text-slate-400 text-sm">–</span>
          <Input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={(e) => setRange(fromDate, e.target.value)}
            className="bg-white w-[132px] sm:w-[150px]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant={isToday ? "secondary" : "outline"} size="sm" className="text-xs"
            onClick={() => setRange(todayStr(), todayStr())}>
            Today
          </Button>
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => setRange(daysAgoStr(6), todayStr())}>
            Last 7 days
          </Button>
          <Button variant="outline" size="sm" className="text-xs"
            onClick={() => setRange(daysAgoStr(29), todayStr())}>
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

      {/* Ending an order — the reason is required, and feeds the day-end report */}
      <Dialog open={!!endTarget} onOpenChange={(open) => { if (!open) setEndTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {endTarget?.status === "CANCELLED" ? "Cancel" : "Mark not fulfilled"} order #{endTarget?.order?.dailyOrderNumber ?? endTarget?.order?.id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-2">
              {END_REASONS.map((reason) => (
                <button key={reason} type="button" onClick={() => setEndReason(reason)}
                  className={`filter-chip ${endReason === reason ? "filter-chip-active" : ""}`}>
                  {reason}
                </button>
              ))}
            </div>
            <Input placeholder="Note (optional)" value={endNote} onChange={(e) => setEndNote(e.target.value)} />
            {endTarget?.order?.paymentMethod === "PHONEPE" && (
              <p className="text-xs text-amber-600">
                ₹{endTarget.order.totalAmount.toFixed(0)} will be flagged as a refund due — refund the customer in PhonePe,
                then mark it refunded here.
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEndTarget(null)}>Keep order</Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" disabled={!endReason} onClick={endOrder}>
                {endTarget?.status === "CANCELLED" ? "Cancel order" : "Not fulfilled"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                          {order.guestName || order.user?.customerName || "Guest"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {order.guestVehicle
                            ? order.guestVehicle
                            : <span className="text-amber-600 font-medium">Pickup</span>}
                          {order.parkingSpot && ` · ${order.parkingSpot}`}
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
                            <ScanLine className="h-3 w-3" /> Served by {order.waiter.name}
                          </p>
                        )}
                        <RefundStatus order={order} onMarkDone={() => markRefunded(order.id, order.refunds[0].amount)} />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-slate-900">₹{order.totalAmount.toFixed(0)}</span>
                      <StatusDot color={ORDER_STATUS_COLORS[order.status] || "#94a3b8"} className="w-24">{ORDER_STATUS_LABELS[order.status] || order.status}</StatusDot>
                      <span className="text-xs text-slate-400">
                        {orderTimeLabel(order.createdAt)}
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
                        <DialogHeader><DialogTitle>Order #{shownOrder?.dailyOrderNumber ?? shownOrder?.id}</DialogTitle></DialogHeader>
                        {shownOrder && (
                          <div className="space-y-4 pt-1">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-slate-500">
                                {new Date(shownOrder.createdAt).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <StatusDot color={ORDER_STATUS_COLORS[shownOrder.status] || "#94a3b8"}>{ORDER_STATUS_LABELS[shownOrder.status] || shownOrder.status}</StatusDot>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Customer</p>
                              <p className="text-sm font-medium">{shownOrder.guestName || shownOrder.user?.customerName}</p>
                              {shownOrder.user?.phoneNumber && <p className="text-sm text-slate-500">{shownOrder.user.phoneNumber}</p>}
                              <p className="text-sm text-slate-500">
                                {shownOrder.guestVehicle ? `Vehicle: ${shownOrder.guestVehicle}` : "Pickup order"}
                              </p>
                              {shownOrder.parkingSpot && (
                                <p className="text-sm text-slate-500">Parked at: {shownOrder.parkingSpot}</p>
                              )}
                              <p className="text-sm text-slate-500">
                                Payment: {PAYMENT_METHOD_LABELS[shownOrder.paymentMethod] || "Cash on Delivery"}
                              </p>
                              <RefundStatus order={shownOrder} onMarkDone={() => markRefunded(shownOrder.id, shownOrder.refunds[0].amount)} />
                            </div>
                            {shownOrder.waiter?.name && (
                              <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Served by</p>
                                <p className="text-sm font-medium text-emerald-600">{shownOrder.waiter.name}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Items</p>
                              <div className="space-y-1.5">
                                {shownOrder.orderItems?.map((item) => (
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
                                  <span>₹{shownOrder.totalAmount.toFixed(0)}</span>
                                </div>
                              </div>
                            </div>
                            {shownOrder.deliveryInstructions && (
                              <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Instructions</p>
                                <p className="text-sm text-slate-700">{shownOrder.deliveryInstructions}</p>
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
                        <ScanLine className="h-3.5 w-3.5" /> Awaiting server scan
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
