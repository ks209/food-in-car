"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Search, Plus, Minus, Trash2, Receipt, WifiOff, CheckCircle2, Clock, RotateCcw, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { API } from "@/lib/api"
import { useRestaurant } from "@/lib/restaurant-context"
import { useBilling } from "@/lib/billing-context"
import { cacheMenu, getCachedMenu } from "@/lib/billing-db"
import { formatCurrency } from "@/lib/format"

const STATUS_META = {
  pending: { label: "Pending Sync", icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  syncing: { label: "Syncing…", icon: Clock, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  synced: { label: "Synced", icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  failed: { label: "Failed Sync", icon: AlertCircle, cls: "bg-red-50 text-red-700 border-red-200" },
}

export function BillingPos() {
  const restaurant = useRestaurant()
  const billing = useBilling()
  const [menu, setMenu] = useState([])
  const [search, setSearch] = useState("")
  const [cart, setCart] = useState([]) // [{ id, name, price, quantity }]
  const [guestName, setGuestName] = useState("")
  const [guestVehicle, setGuestVehicle] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("COD")
  const [creating, setCreating] = useState(false)

  // Menu: try the network first (and refresh the offline cache), fall back to
  // whatever was last cached if the request fails — the whole point of the POS
  // screen is that it still works with zero connectivity.
  useEffect(() => {
    if (!restaurant?.id) return
    axios.get(`${API}/api/menu/`, { withCredentials: true })
      .then((r) => {
        const items = r.data.filter((m) => m.isActive !== false && m.available)
        setMenu(items)
        cacheMenu(restaurant.id, items).catch(() => {})
      })
      .catch(() => {
        getCachedMenu(restaurant.id).then(setMenu).catch(() => {})
      })
  }, [restaurant?.id])

  const categories = useMemo(() => {
    const names = new Set(menu.map((m) => m.category?.name || "Uncategorized"))
    return ["All", ...names]
  }, [menu])
  const [activeCategory, setActiveCategory] = useState("All")

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menu.filter((m) => {
      const inCategory = activeCategory === "All" || (m.category?.name || "Uncategorized") === activeCategory
      const matchesSearch = !q || m.name.toLowerCase().includes(q)
      return inCategory && matchesSearch
    })
  }, [menu, activeCategory, search])

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id)
      if (existing) return prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c))
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }
  const decrement = (id) => {
    setCart((prev) => prev.flatMap((c) => (c.id === id ? (c.quantity > 1 ? [{ ...c, quantity: c.quantity - 1 }] : []) : [c])))
  }
  const removeItem = (id) => setCart((prev) => prev.filter((c) => c.id !== id))

  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0)

  const resetForm = () => {
    setCart([]); setGuestName(""); setGuestVehicle(""); setMobileNumber("")
  }

  const handleCreateBill = async () => {
    if (cart.length === 0) return
    setCreating(true)
    try {
      await billing.createBill({
        items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity })),
        totalAmount: total,
        guestName: guestName.trim(),
        guestVehicle: guestVehicle.trim(),
        mobileNumber: mobileNumber.trim(),
        paymentMethod,
      })
      toast.success(billing.online ? "Bill created" : "Bill saved — will sync once you're back online")
      resetForm()
    } catch {
      toast.error("Couldn't save the bill locally")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Item picker */}
      <div className="xl:col-span-2 space-y-4">
        {!billing?.online && (
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            <WifiOff className="h-3.5 w-3.5 flex-shrink-0" />
            You're offline — bills you create now are saved on this device and will sync automatically once you're back online.
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <Input placeholder="Search menu…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-white" />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setActiveCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCategory === c ? "brand-bg text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
              }`}>
              {c}
            </button>
          ))}
        </div>

        {menu.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">
            {billing?.online ? "No available menu items" : "No cached menu available offline yet — connect once so items are cached for offline use"}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visibleItems.map((item) => (
              <button key={item.id} onClick={() => addToCart(item)}
                className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400 hover:shadow-sm transition-all">
                <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                <p className="text-sm font-bold text-slate-900 mt-1">{formatCurrency(item.price)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart + bill list */}
      <div className="space-y-4">
        <Card className="border-0 shadow-sm sticky top-24">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
              <Receipt className="h-4 w-4" /> New Bill
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Tap a menu item to add it</p>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">{formatCurrency(c.price)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => decrement(c.id)} className="h-6 w-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center">{c.quantity}</span>
                      <button onClick={() => addToCart(c)} className="h-6 w-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeItem(c.id)} className="h-6 w-6 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Customer name (optional)</Label>
                <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Walk-in Customer" className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Mobile (optional)</Label>
                  <Input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit" className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vehicle (optional)</Label>
                  <Input value={guestVehicle} onChange={(e) => setGuestVehicle(e.target.value)} placeholder="e.g. DL 4C AB 1234" className="h-8 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                {["COD", "PHONEPE"].map((m) => (
                  <button key={m} onClick={() => setPaymentMethod(m)}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md border ${
                      paymentMethod === m ? "brand-bg text-white border-transparent" : "border-slate-200 text-slate-600"
                    }`}>
                    {m === "COD" ? "Cash" : "PhonePe"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-slate-500">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total)}</span>
            </div>
            <Button className="w-full brand-bg text-white" disabled={cart.length === 0 || creating} onClick={handleCreateBill}>
              {creating ? "Saving…" : "Create Bill"}
            </Button>
          </CardContent>
        </Card>

        <RecentBills />
      </div>
    </div>
  )
}

function RecentBills() {
  const billing = useBilling()
  if (!billing) return null
  const { bills, retryBill } = billing

  if (bills.length === 0) return null

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Bills</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {bills.slice(0, 25).map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.pending
            const Icon = meta.icon
            const label = b.syncedOrder ? `#${b.syncedOrder.dailyOrderNumber ?? b.syncedOrder.id}` : b.payload.guestName || "Walk-in"
            return (
              <div key={b.idempotencyKey} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
                  <p className="text-xs text-slate-400">
                    {formatCurrency(b.payload.totalAmount)} · {new Date(b.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  {b.status === "failed" && b.error && <p className="text-xs text-red-500 mt-0.5 truncate">{b.error}</p>}
                </div>
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${meta.cls}`}>
                  <Icon className="h-3 w-3" /> {meta.label}
                </span>
                {b.status === "failed" && (
                  <button onClick={() => retryBill(b.idempotencyKey)} className="text-slate-400 hover:text-slate-700 flex-shrink-0" title="Retry">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
