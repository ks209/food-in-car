"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Contact, Car, Loader2, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
import { formatCurrency } from "@/lib/format"
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from "@/lib/status"
import { StatusDot } from "@/components/ui/status-dot"

const SORT_OPTIONS = [
  { value: "lastOrderAt", label: "Last order" },
  { value: "totalSpent", label: "Total spent" },
  { value: "orderCount", label: "Order count" },
  { value: "name", label: "Name" },
]
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

export function CustomerManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [sortBy, setSortBy] = useState("lastOrderAt")
  const [sortDir, setSortDir] = useState("desc")

  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  const fetchCustomers = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API}/api/order/customers`, {
        params: { search: debouncedSearch, page, pageSize, sortBy, sortDir },
        withCredentials: true,
      })
      setCustomers(res.data.customers)
      setTotal(res.data.total)
    } catch {
      toast.error("Failed to fetch customers")
    } finally {
      setLoading(false)
    }
  }

  // Debounce the search box; a new search always jumps back to page 1 (a stale
  // page number past the new, smaller result set would just render empty).
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchTerm); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => { fetchCustomers() }, [page, pageSize, sortBy, sortDir, debouncedSearch])

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortBy(key); setSortDir("desc") }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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
      <p className="text-slate-500 text-sm">{total} customer{total === 1 ? "" : "s"}</p>

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input
            placeholder="Search by name or phone number…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setSortDir("desc") }}>
            <SelectTrigger className="w-[150px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="flex-shrink-0" onClick={() => toggleSort(sortBy)} title={sortDir === "asc" ? "Ascending" : "Descending"}>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
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
                  className="w-full flex flex-wrap items-center justify-between gap-y-1 px-4 sm:px-5 py-3.5 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="min-w-0">
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

      {/* Pagination */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1) }}>
              <SelectTrigger className="w-[80px] h-8 bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <span>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

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
                        <span className="text-xs font-mono text-slate-400">#{order.dailyOrderNumber ?? order.id}</span>
                        <StatusDot color={ORDER_STATUS_COLORS[order.status] || "#94a3b8"}>{ORDER_STATUS_LABELS[order.status] || order.status}</StatusDot>
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
