"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Plus, Minus, Trash2, Receipt, WifiOff, CheckCircle2, Clock, RotateCcw, AlertCircle, X } from "lucide-react"
import { toast } from "sonner"
import { API } from "@/lib/api"
import { useRestaurant } from "@/lib/restaurant-context"
import { useBilling } from "@/lib/billing-context"
import { cacheMenu, getCachedMenu, loadParked, saveParked } from "@/lib/billing-db"
import { formatCurrency, orderTimeLabel } from "@/lib/format"
import { OrderInvoice, printOrderReceipt } from "@/components/order-invoice"
import { DEFAULT_PRINT_SETTINGS, applyPaperSize, loadPrintSettings, savePrintSettings } from "@/lib/printing"
import { orderGst } from "@/lib/gst"

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
  const [cart, setCart] = useState([]) // [{ cartKey, id, name, optionLabel, selectedOptions, price, quantity }]
  const [guestName, setGuestName] = useState("")
  const [guestVehicle, setGuestVehicle] = useState("")
  const [mobileNumber, setMobileNumber] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("COD")
  const [creating, setCreating] = useState(false)
  const [optionsFor, setOptionsFor] = useState(null) // menu item awaiting its option choices
  const [editingKey, setEditingKey] = useState(null) // rejected bill being corrected
  const [cashReceived, setCashReceived] = useState("") // for the change calculation
  const [parked, setParked] = useState([])             // bills on hold, per device
  const [customOpen, setCustomOpen] = useState(false)  // "custom item" dialog
  const [custom, setCustom] = useState({ name: "", price: "" })

  const [printSettings, setPrintSettings] = useState(DEFAULT_PRINT_SETTINGS)
  const [printerOpen, setPrinterOpen] = useState(false)

  useEffect(() => {
    setParked(loadParked())
    const saved = loadPrintSettings()
    setPrintSettings(saved)
    applyPaperSize(saved.paper) // so the very first print is already sized right
  }, [])

  const updatePrintSettings = (patch) => {
    const next = { ...printSettings, ...patch }
    setPrintSettings(next)
    savePrintSettings(next)
  }

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

  // One cart line per item + choice of options: a Regular Coke and a Large Coke
  // are different lines, and "+1" on one must not bump the other.
  const addToCart = (item, options = []) => {
    const cartKey = `${item.id}|${options.map((o) => o.id).sort().join(",")}`
    const price = item.price + options.reduce((s, o) => s + (o.priceDelta || 0), 0)
    setCart((prev) => {
      const existing = prev.find((c) => c.cartKey === cartKey)
      if (existing) return prev.map((c) => (c.cartKey === cartKey ? { ...c, quantity: c.quantity + 1 } : c))
      return [...prev, {
        cartKey,
        id: item.id,
        name: item.name,
        optionLabel: options.map((o) => o.name).join(", "),
        selectedOptions: options.map((o) => ({ name: o.name, priceDelta: o.priceDelta || 0 })),
        price,
        quantity: 1,
      }]
    })
  }

  // Items with option groups need a choice first (size, add-ons); the rest go
  // straight into the bill on tap.
  const pickItem = (item) => {
    if (item.optionGroups?.length) setOptionsFor(item)
    else addToCart(item)
  }

  const decrement = (cartKey) => {
    setCart((prev) => prev.flatMap((c) => (c.cartKey === cartKey ? (c.quantity > 1 ? [{ ...c, quantity: c.quantity - 1 }] : []) : [c])))
  }
  const increment = (line) => setCart((prev) => prev.map((c) => (c.cartKey === line.cartKey ? { ...c, quantity: c.quantity + 1 } : c)))
  const removeItem = (cartKey) => setCart((prev) => prev.filter((c) => c.cartKey !== cartKey))

  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  // GST per the restaurant's Settings (the server recomputes the same when the bill syncs).
  const tax = orderGst(restaurant, subtotal)
  const total = tax.total
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0)

  const resetForm = () => {
    setCart([]); setGuestName(""); setGuestVehicle(""); setMobileNumber(""); setCashReceived("")
  }

  // ── Cash & change ─────────────────────────────────────────────────────────
  const tendered = Number(cashReceived)
  const change = Number.isFinite(tendered) && cashReceived !== "" ? tendered - total : null
  // Exact amount, then the notes a customer is most likely to hand over for
  // this bill — the next ₹100 up, plus any bigger standard notes.
  const cashSuggestions = useMemo(() => {
    if (total <= 0) return []
    const rounded = Math.ceil(total / 100) * 100
    return [...new Set([Math.ceil(total), rounded, 500, 2000].filter((v) => v >= total))].slice(0, 4)
  }, [total])

  // ── Hold / resume bills ───────────────────────────────────────────────────
  // Kept per device (localStorage) like the offline queue: a held bill is an
  // unfinished sale, not something the server should know about.
  const currentAsHeld = () => ({
    id: `${Date.now()}`,
    label: guestName.trim() || `${itemCount} item${itemCount === 1 ? "" : "s"} · ${formatCurrency(total)}`,
    cart, guestName, guestVehicle, mobileNumber, paymentMethod,
    savedAt: Date.now(),
  })

  const persistParked = (next) => { setParked(next); saveParked(next) }

  const holdBill = () => {
    if (cart.length === 0) return
    persistParked([currentAsHeld(), ...parked])
    resetForm(); setEditingKey(null)
    toast.success("Bill held — resume it any time")
  }

  const resumeBill = (held) => {
    // Swap in one step: whatever is on screen goes on hold, the chosen bill
    // comes off it. Doing this as two separate updates would compute the
    // second from a stale list and lose the cart being put down.
    const keep = parked.filter((p) => p.id !== held.id)
    persistParked(cart.length > 0 ? [currentAsHeld(), ...keep] : keep)
    setCart(held.cart)
    setGuestName(held.guestName || ""); setGuestVehicle(held.guestVehicle || "")
    setMobileNumber(held.mobileNumber || ""); setPaymentMethod(held.paymentMethod || "COD")
    setCashReceived("")
  }

  const discardHeld = (id) => {
    const next = parked.filter((p) => p.id !== id)
    setParked(next); saveParked(next)
  }

  // ── Quick keys ────────────────────────────────────────────────────────────
  // The items this till actually sells, most-billed first, from its own recent
  // bills — in most places a handful of items are nearly every order.
  const quickItems = useMemo(() => {
    const counts = new Map()
    for (const b of billing?.bills || []) {
      for (const i of b.payload?.items || []) {
        if (i.id) counts.set(i.id, (counts.get(i.id) || 0) + i.quantity)
      }
    }
    if (counts.size === 0) return []
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => menu.find((m) => m.id === id))
      .filter(Boolean)
      .slice(0, 8)
  }, [billing?.bills, menu])

  // ── Custom (off-menu) item ────────────────────────────────────────────────
  const addCustomItem = () => {
    const name = custom.name.trim() || "Custom item"
    const price = Number(custom.price)
    if (!Number.isFinite(price) || price <= 0) { toast.error("Enter a price"); return }
    setCart((prev) => [...prev, {
      cartKey: `custom-${Date.now()}`,
      id: null, // not a menu item — the server stores it by name alone
      name, optionLabel: "", selectedOptions: [], price, quantity: 1,
    }])
    setCustom({ name: "", price: "" }); setCustomOpen(false)
  }

  // price is per unit INCLUDING the chosen options; the server stores
  // selectedOptions on the order item (see routes/order POST /pos).
  const buildPayload = () => ({
    items: cart.map((c) => ({ id: c.id, name: c.name, price: c.price, quantity: c.quantity, selectedOptions: c.selectedOptions || [] })),
    totalAmount: total,
    guestName: guestName.trim(),
    guestVehicle: guestVehicle.trim(),
    mobileNumber: mobileNumber.trim(),
    paymentMethod,
  })

  // Loads a rejected bill back into the form so it can be corrected — a blind
  // retry of a bill the server refused just fails the same way.
  const editBill = (bill) => {
    setCart((bill.payload.items || []).map((i, idx) => ({
      cartKey: `${i.id ?? "x"}|revise-${idx}`,
      id: i.id,
      name: i.name,
      optionLabel: (i.selectedOptions || []).map((o) => o.name).join(", "),
      selectedOptions: i.selectedOptions || [],
      price: i.price,
      quantity: i.quantity,
    })))
    setGuestName(bill.payload.guestName || "")
    setGuestVehicle(bill.payload.guestVehicle || "")
    setMobileNumber(bill.payload.mobileNumber || "")
    setPaymentMethod(bill.payload.paymentMethod || "COD")
    setEditingKey(bill.idempotencyKey)
    window.scrollTo({ top: 0, behavior: "smooth" })
    toast.info(`Editing ${bill.localBillNo || "rejected bill"} — fix it and save to resubmit`)
  }

  const handleCreateBill = async () => {
    if (cart.length === 0) return
    setCreating(true)
    try {
      if (editingKey) {
        await billing.reviseBill(editingKey, buildPayload())
        toast.success("Bill corrected — resubmitting")
        setEditingKey(null)
        resetForm()
        return
      }
      const payload = buildPayload()
      const bill = await billing.createBill(payload)
      toast.success(billing.online ? "Bill created" : "Bill saved — will sync once you're back online")
      // Straight to the printer, so the customer gets the bill without anyone
      // hunting for it in the list first.
      if (printSettings.autoPrint) {
        printOrderReceipt(
          { ...billAsOrder(bill, restaurant), cashReceived: change !== null ? tendered : null },
          printSettings,
        ).catch(() => toast.error("Couldn't print — check Printer setup"))
      }
      resetForm()
    } catch {
      toast.error("Couldn't save the bill locally")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
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

        {/* Bills on hold — a second customer at the counter shouldn't cost you
            the first one's cart. */}
        {parked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">On hold:</span>
            {parked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs">
                <button type="button" onClick={() => resumeBill(p)} className="font-medium text-amber-700 hover:text-amber-900">
                  {p.label}
                </button>
                <button type="button" onClick={() => discardHeld(p.id)} className="text-amber-400 hover:text-amber-700" title="Discard">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Most-billed items on this till — in most places a handful of items
            are nearly every order, so they shouldn't need searching for. */}
        {quickItems.length > 0 && !search && (
          <div className="flex flex-wrap gap-2">
            {quickItems.map((item) => (
              <button key={`quick-${item.id}`} onClick={() => pickItem(item)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-400 hover:shadow-sm transition-all">
                <span className="text-sm font-medium text-slate-800">{item.name}</span>
                <span className="text-sm font-bold text-slate-900 ml-2">{formatCurrency(item.price)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c} onClick={() => setActiveCategory(c)}
              className={`filter-chip ${activeCategory === c ? "filter-chip-active" : ""}`}>
              {c}
            </button>
          ))}
          {/* Anything not on the menu — a special, a packaged drink, a bulk order */}
          <button onClick={() => setCustomOpen(true)} className="filter-chip">
            <Plus className="h-3 w-3 inline mr-1" />Custom item
          </button>
        </div>

        {menu.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">
            {billing?.online ? "No available menu items" : "No cached menu available offline yet — connect once so items are cached for offline use"}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visibleItems.map((item) => (
              <button key={item.id} onClick={() => pickItem(item)}
                className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400 hover:shadow-sm transition-all">
                <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                <p className="text-sm font-bold text-slate-900 mt-1">{formatCurrency(item.price)}</p>
                {item.optionGroups?.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">Choose options</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart + bill list */}
      <div className="space-y-4">
        {/* Sticky only in the two-column layout: stacked on smaller screens it
            would sit on top of the menu cards as they scroll past. */}
        <Card className="border-0 shadow-sm bg-white xl:sticky xl:top-24 xl:z-10 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                <Receipt className="h-4 w-4" /> New Bill
              </CardTitle>
              {/* Printer is a property of this counter, not the restaurant —
                  so its setup lives here, per device. */}
              <button type="button" onClick={() => setPrinterOpen(true)}
                className="text-xs text-slate-400 underline hover:text-slate-700">
                Printer setup
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Tap a menu item to add it</p>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.cartKey} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      {c.optionLabel && <p className="text-xs text-slate-500 truncate">{c.optionLabel}</p>}
                      <p className="text-xs text-slate-400">{formatCurrency(c.price)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => decrement(c.cartKey)} className="h-6 w-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="text-sm font-semibold w-5 text-center">{c.quantity}</span>
                      <button onClick={() => increment(c)} className="h-6 w-6 rounded-md border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeItem(c.cartKey)} className="h-6 w-6 rounded-md flex items-center justify-center text-red-400 hover:bg-red-50">
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

            {tax.rate > 0 && cart.length > 0 && (
              <div className="space-y-1 pt-2 text-xs text-slate-500">
                {!tax.inclusive && (
                  <div className="flex justify-between"><span>Item total</span><span>{formatCurrency(tax.subtotal)}</span></div>
                )}
                <div className="flex justify-between">
                  <span>GST {tax.rate}%{tax.inclusive ? " (included)" : ""}</span>
                  <span>{formatCurrency(tax.gstAmount)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-slate-500">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total)}</span>
            </div>

            {/* Cash & change — the most-used control on a counter till */}
            {paymentMethod === "COD" && cart.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">Cash received</Label>
                  <Input type="number" inputMode="numeric" value={cashReceived} placeholder="₹"
                    onChange={(e) => setCashReceived(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cashSuggestions.map((amount) => (
                    <button key={amount} type="button" onClick={() => setCashReceived(String(amount))}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-slate-400">
                      {formatCurrency(amount)}
                    </button>
                  ))}
                </div>
                {change !== null && (
                  <p className={`text-sm font-semibold ${change < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {change < 0
                      ? `${formatCurrency(Math.abs(change))} short`
                      : `Change due ${formatCurrency(change)}`}
                  </p>
                )}
              </div>
            )}
            <Button className="w-full brand-bg text-white" disabled={cart.length === 0 || creating} onClick={handleCreateBill}>
              {creating ? "Saving…" : editingKey ? "Resubmit Bill" : "Create Bill"}
            </Button>
            {editingKey ? (
              <button type="button" className="w-full text-xs text-slate-500 underline hover:text-slate-800"
                onClick={() => { setEditingKey(null); resetForm() }}>
                Cancel edit
              </button>
            ) : (
              <Button variant="outline" className="w-full" disabled={cart.length === 0} onClick={holdBill}>
                Hold bill
              </Button>
            )}
          </CardContent>
        </Card>

        <RecentBills onEdit={editBill} />
      </div>

      {/* Printer setup — stored on this device only */}
      <Dialog open={printerOpen} onOpenChange={(open) => { if (!open) setPrinterOpen(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Printer setup</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-sm">Paper</Label>
              <div className="flex gap-2">
                {[{ v: "58", l: '58mm (2")' }, { v: "80", l: '80mm (3")' }, { v: "a4", l: "A4 / normal" }].map((o) => (
                  <button key={o.v} type="button" onClick={() => updatePrintSettings({ paper: o.v })}
                    className={`filter-chip ${printSettings.paper === o.v ? "filter-chip-active" : ""}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">How to print</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => updatePrintSettings({ mode: "browser" })}
                  className={`filter-chip ${printSettings.mode === "browser" ? "filter-chip-active" : ""}`}>
                  System printer
                </button>
                <button type="button" onClick={() => updatePrintSettings({ mode: "rawbt" })}
                  className={`filter-chip ${printSettings.mode === "rawbt" ? "filter-chip-active" : ""}`}>
                  RawBT (Android Bluetooth)
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {printSettings.mode === "browser"
                  ? "Uses the printer installed on this device. To skip the print dialog, start Chrome with --kiosk-printing and set the thermal printer as default."
                  : "Sends the receipt to the RawBT app, which prints to a paired Bluetooth printer. Install RawBT from the Play Store first."}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Print automatically</Label>
                <p className="text-xs text-slate-500">Print as soon as a bill is created.</p>
              </div>
              <button type="button" onClick={() => updatePrintSettings({ autoPrint: !printSettings.autoPrint })}
                className={`filter-chip ${printSettings.autoPrint ? "filter-chip-active" : ""}`}>
                {printSettings.autoPrint ? "On" : "Off"}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Copies</Label>
                <p className="text-xs text-slate-500">e.g. one for the customer, one for the kitchen.</p>
              </div>
              <Input type="number" min={1} max={3} value={printSettings.copies} className="h-8 w-16 text-sm"
                onChange={(e) => updatePrintSettings({ copies: Math.max(1, Math.min(3, Number(e.target.value) || 1)) })} />
            </div>

            <Button variant="outline" className="w-full"
              onClick={() => printOrderReceipt(sampleReceipt(restaurant), printSettings)}>
              Print a test receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Off-menu item: billed by name and price, no menu item behind it */}
      <Dialog open={customOpen} onOpenChange={(open) => { if (!open) setCustomOpen(false) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Custom item</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label className="text-sm">Name</Label>
              <Input value={custom.name} placeholder="e.g. Special thali"
                onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Price (₹)</Label>
              <Input type="number" inputMode="numeric" value={custom.price} autoFocus
                onChange={(e) => setCustom({ ...custom, price: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") addCustomItem() }} />
            </div>
            <Button className="w-full brand-bg text-white" onClick={addCustomItem}>Add to bill</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ItemOptionsDialog
        item={optionsFor}
        onClose={() => setOptionsFor(null)}
        onAdd={(item, options) => { addToCart(item, options); setOptionsFor(null) }}
      />
    </div>
  )
}

// Same choices the customer app offers (size, add-ons): one pick per group when
// `multiple` is off, any number when it's on, and `required` groups must have one.
function ItemOptionsDialog({ item, onClose, onAdd }) {
  const [picked, setPicked] = useState({}) // groupId -> option id[]

  // Reset whenever a different item is opened, and preselect the first option
  // of each required single-choice group so the common case is one tap.
  useEffect(() => {
    if (!item) return
    const initial = {}
    for (const g of item.optionGroups || []) {
      if (g.required && !g.multiple && g.options?.[0]) initial[g.id] = [g.options[0].id]
    }
    setPicked(initial)
  }, [item?.id])

  if (!item) return null

  const groups = item.optionGroups || []
  const toggle = (group, option) => {
    setPicked((prev) => {
      const current = prev[group.id] || []
      if (group.multiple) {
        return { ...prev, [group.id]: current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id] }
      }
      return { ...prev, [group.id]: current.includes(option.id) && !group.required ? [] : [option.id] }
    })
  }

  const chosen = groups.flatMap((g) => (g.options || []).filter((o) => (picked[g.id] || []).includes(o.id)))
  const missing = groups.filter((g) => g.required && !(picked[g.id] || []).length).map((g) => g.title)
  const total = item.price + chosen.reduce((s, o) => s + (o.priceDelta || 0), 0)

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{item.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-1 max-h-[60vh] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.id}>
              <p className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">
                {group.title}
                <span className="ml-1 normal-case tracking-normal text-slate-400">
                  {group.required ? "(required)" : "(optional)"}{group.multiple ? " · choose any" : ""}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {(group.options || []).map((option) => {
                  const active = (picked[group.id] || []).includes(option.id)
                  return (
                    <button key={option.id} type="button" onClick={() => toggle(group, option)}
                      className={`filter-chip ${active ? "filter-chip-active" : ""}`}>
                      {option.name}{option.priceDelta ? ` +${formatCurrency(option.priceDelta)}` : ""}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <p className="text-xs text-amber-600">Pick an option for {missing.join(", ")}</p>
        )}
        <Button className="w-full brand-bg text-white" disabled={missing.length > 0} onClick={() => onAdd(item, chosen)}>
          Add · {formatCurrency(total)}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// An order-shaped view of a queued bill, so the same invoice component can
// print it before it has ever reached the server. Once synced, the server's
// own order is used instead (it has the real order number and GST snapshot).
function billAsOrder(bill, restaurant) {
  if (bill.syncedOrder) return { ...bill.syncedOrder, localBillNo: bill.localBillNo }
  const items = bill.payload.items || []
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const tax = orderGst(restaurant, subtotal)
  return {
    id: bill.localBillNo || "—",
    dailyOrderNumber: bill.localBillNo,
    createdAt: bill.createdAt,
    guestName: bill.payload.guestName || "Walk-in Customer",
    guestVehicle: bill.payload.guestVehicle || null,
    paymentMethod: bill.payload.paymentMethod,
    orderItems: items.map((i, idx) => ({
      id: `${bill.idempotencyKey}-${idx}`,
      name: i.name,
      quantity: i.quantity,
      finalPrice: i.price,
      options: (i.selectedOptions || []).map((o) => ({ name: o.name })),
    })),
    subtotalAmount: tax.subtotal,
    gstRate: tax.rate,
    gstAmount: tax.gstAmount,
    gstin: restaurant?.gstin || null,
    pricesIncludeGst: tax.inclusive,
    totalAmount: bill.payload.totalAmount,
    restaurant,
  }
}

// A throwaway bill for the "Print a test receipt" button — enough to check
// paper width, alignment and that the printer is reachable at all.
function sampleReceipt(restaurant) {
  return {
    id: "TEST",
    dailyOrderNumber: "TEST",
    createdAt: Date.now(),
    guestName: "Test print",
    paymentMethod: "COD",
    orderItems: [
      { id: 1, name: "Masala Chai", quantity: 2, finalPrice: 20, options: [] },
      { id: 2, name: "Veg Sandwich (grilled)", quantity: 1, finalPrice: 60, options: [{ name: "Extra cheese" }] },
    ],
    totalAmount: 100,
    restaurant,
  }
}

function RecentBills({ onEdit }) {
  const billing = useBilling()
  const restaurant = useRestaurant()
  if (!billing) return null
  const { bills, retryBill, exportBillsCsv } = billing

  if (bills.length === 0) return null

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Bills</CardTitle>
          {/* Safety valve: a device that has to be wiped or replaced with bills
              still queued shouldn't take the only copy of them with it. */}
          <button type="button" onClick={exportBillsCsv} className="text-xs text-slate-400 underline hover:text-slate-700">
            Export CSV
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
          {bills.slice(0, 25).map((b) => {
            const meta = STATUS_META[b.status] || STATUS_META.pending
            const Icon = meta.icon
            // The local number exists from the moment the bill is rung up; the
            // server's order number is appended once it syncs.
            const serverNo = b.syncedOrder ? `#${b.syncedOrder.dailyOrderNumber ?? b.syncedOrder.id}` : null
            const label = [b.localBillNo, serverNo].filter(Boolean).join(" · ")
              || b.payload.guestName || "Walk-in"
            return (
              <div key={b.idempotencyKey} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
                  <p className="text-xs text-slate-400">
                    {formatCurrency(b.payload.totalAmount)} · {orderTimeLabel(b.createdAt)}
                    {b.payload.guestName ? ` · ${b.payload.guestName}` : ""}
                  </p>
                  {b.status === "failed" && b.error && <p className="text-xs text-red-500 mt-0.5 truncate">{b.error}</p>}
                  {b.mismatch && (
                    <p className="text-xs text-amber-600 mt-0.5">
                      Priced {formatCurrency(b.mismatch.printed)} on the bill, recorded {formatCurrency(b.mismatch.recorded)} — menu prices changed
                    </p>
                  )}
                </div>
                {/* Printable straight away, offline included */}
                <OrderInvoice order={billAsOrder(b, restaurant)} />
                <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${meta.cls}`}>
                  <Icon className="h-3 w-3" /> {meta.label}
                </span>
                {b.status === "failed" && (
                  <>
                    <button onClick={() => onEdit?.(b)} className="text-xs text-slate-500 underline hover:text-slate-800 flex-shrink-0">
                      Edit
                    </button>
                    <button onClick={() => retryBill(b.idempotencyKey)} className="text-slate-400 hover:text-slate-700 flex-shrink-0" title="Retry">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
