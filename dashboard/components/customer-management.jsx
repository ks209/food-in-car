"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Contact, Car, Loader2 } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
import { formatCurrency } from "@/lib/format"
import { ORDER_STATUS_COLORS } from "@/lib/status"
import { StatusDot } from "@/components/ui/status-dot"

export function CustomerManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  const fetchCustomers = async (search) => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/api/order/customers`, { params: { search }, withCredentials: true })
      setCustomers(res.data)
    } catch {
      toast.error("Failed to fetch customers")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => fetchCustomers(searchTerm), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  const openCustomer = async (customer) => {
    setSelectedCustomer(customer)
    setLoadingOrders(true)
    try {
      const res = await axios.get(`${API}/api/order/customers/${customer.phoneNumber}`, { withCredentials: true })
      setCustomerOrders(res.data)
    } catch {
      toast.error("Failed to fetch order history")
    } finally {
      setLoadingOrders(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-slate-500 text-sm">{customers.length} customer{customers.length === 1 ? "" : "s"}</p>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
        <Input
          placeholder="Search by name or phone number…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 bg-white"
        />
      </div>

      {/* List */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
            <Contact className="h-4 w-4" /> Customers
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && customers.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">Loading…</p>
          ) : customers.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">No customers found</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openCustomer(c)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.customerName}</p>
                    <p className="text-xs text-slate-400">
                      {c.phoneNumber}
                      {c.vehicles?.length > 0 && (
                        <span className="inline-flex items-center gap-1 ml-2">
                          <Car className="h-3 w-3" /> {c.vehicles.map((v) => v.vehicleNo).join(", ")}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{formatCurrency(c.totalSpent)}</p>
                    <p className="text-xs text-slate-400">
                      {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                      {c.lastOrderAt && ` · last ${new Date(c.lastOrderAt).toLocaleDateString([], { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer detail dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => { if (!open) { setSelectedCustomer(null); setCustomerOrders([]) } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCustomer?.customerName}</DialogTitle>
          </DialogHeader>
          {selectedCustomer && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{selectedCustomer.phoneNumber}</span>
                {selectedCustomer.vehicles?.length > 0 && (
                  <span className="text-slate-500 inline-flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" /> {selectedCustomer.vehicles.map((v) => v.vehicleNo).join(", ")}
                  </span>
                )}
              </div>

              {loadingOrders ? (
                <div className="flex items-center justify-center py-10 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading orders…
                </div>
              ) : customerOrders.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No orders yet</p>
              ) : (
                <div className="divide-y divide-slate-50 -mx-6">
                  {customerOrders.map((order) => (
                    <div key={order.id} className="px-6 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-slate-400">#{order.id}</span>
                        <StatusDot color={ORDER_STATUS_COLORS[order.status] || "#94a3b8"}>{order.status}</StatusDot>
                        <span className="text-sm font-semibold text-slate-800">{formatCurrency(order.totalAmount)}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {order.orderItems?.map((i) => `${i.quantity}× ${i.name}`).join(", ") || "—"}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
