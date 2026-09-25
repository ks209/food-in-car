"use client"

import { useEffect, useMemo, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, TrendingDown, TrendingUp, Minus } from "lucide-react"
import { toast } from "sonner"
import { API } from "@/lib/api"
import { formatCurrency, todayStr, daysAgoStr, localDateRange } from "@/lib/format"

// What sells, what doesn't, and what a price change did — read from orders, so
// it reflects what was actually bought rather than what the menu claims.

const SORTS = {
  revenue: { label: "Revenue", get: (r) => r.revenue },
  quantity: { label: "Quantity", get: (r) => r.quantity },
  name: { label: "Name", get: (r) => r.name },
}

export function MenuPerformance() {
  const [fromDate, setFromDate] = useState(() => daysAgoStr(29))
  const [toDate, setToDate] = useState(todayStr)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState("revenue")
  const [showDeadOnly, setShowDeadOnly] = useState(false)

  useEffect(() => {
    if (!fromDate || !toDate) return
    setLoading(true)
    axios.get(`${API}/api/reports/menu-performance`, { params: localDateRange(fromDate, toDate), withCredentials: true })
      .then((r) => setData(r.data))
      .catch(() => toast.error("Couldn't load menu performance"))
      .finally(() => setLoading(false))
  }, [fromDate, toDate])

  const rows = useMemo(() => {
    if (!data) return []
    const list = showDeadOnly ? data.items.filter((i) => i.quantity === 0) : data.items
    const get = SORTS[sortBy].get
    return [...list].sort((a, b) => (sortBy === "name" ? String(get(a)).localeCompare(String(get(b))) : get(b) - get(a)))
  }, [data, sortBy, showDeadOnly])

  const core = new Set(data?.coreItemIds || [])

  // Turns the menu off for an item that never sells, without leaving this page.
  const markUnavailable = async (item) => {
    try {
      await axios.put(`${API}/api/menu/${item.id}`, { available: false }, { withCredentials: true })
      toast.success(`"${item.name}" marked unavailable`)
      setData((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id ? { ...i, available: false } : i)) }))
    } catch { toast.error("Couldn't update the item") }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Menu Performance</h1>
          <p className="text-slate-500 text-sm">What actually sells, from completed orders.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <Input type="date" value={fromDate} max={toDate} onChange={(e) => e.target.value && setFromDate(e.target.value)} className="bg-white w-[150px]" />
          <span className="text-slate-400 text-sm">–</span>
          <Input type="date" value={toDate} min={fromDate} onChange={(e) => e.target.value && setToDate(e.target.value)} className="bg-white w-[150px]" />
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setFromDate(daysAgoStr(6)); setToDate(todayStr()) }}>7 days</Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setFromDate(daysAgoStr(29)); setToDate(todayStr()) }}>30 days</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : !data ? null : (
        <>
          {/* The menu that earns vs the menu that exists */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Revenue" value={formatCurrency(data.totalRevenue)} />
            <Stat label="Items sold" value={data.items.filter((i) => i.quantity > 0).length} sub={`of ${data.items.length} on the menu`} />
            <Stat label="Carry 80% of sales" value={data.coreItemIds.length} sub="core items" />
            <Stat label="Sold nothing" value={data.deadItems.length} sub={`in ${data.days} day${data.days === 1 ? "" : "s"}`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(SORTS).map(([key, s]) => (
              <button key={key} onClick={() => setSortBy(key)} className={`filter-chip ${sortBy === key ? "filter-chip-active" : ""}`}>
                {s.label}
              </button>
            ))}
            <button onClick={() => setShowDeadOnly((v) => !v)} className={`filter-chip ${showDeadOnly ? "filter-chip-active" : ""}`}>
              Never sold
            </button>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                      <th className="px-4 py-2.5 font-medium">Item</th>
                      <th className="px-4 py-2.5 font-medium text-right">Sold</th>
                      <th className="px-4 py-2.5 font-medium text-right">Per day</th>
                      <th className="px-4 py-2.5 font-medium text-right">Revenue</th>
                      <th className="px-4 py-2.5 font-medium text-right">Share</th>
                      <th className="px-4 py-2.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-slate-800">{item.name}</span>
                          {core.has(item.id) && <span className="ml-2 text-[10px] font-semibold text-emerald-600 uppercase">core</span>}
                          {!item.available && <span className="ml-2 text-[10px] font-semibold text-slate-400 uppercase">off</span>}
                          <span className="block text-xs text-slate-400">{item.category || "No category"} · {formatCurrency(item.price)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{item.perDay}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(item.revenue)}</td>
                        <td className="px-4 py-2.5 text-right text-slate-500">{item.sharePct}%</td>
                        <td className="px-4 py-2.5 text-right">
                          {item.quantity === 0 && item.available && (
                            <button onClick={() => markUnavailable(item)} className="text-xs text-slate-400 underline hover:text-slate-700">
                              Mark unavailable
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Nothing to show for this range</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Sold at the counter as one-off items — a recurring name here is a
              menu item waiting to be created. */}
          {data.offMenu?.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">Off-menu items billed</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {data.offMenu.map((o) => (
                  <div key={o.name} className="flex justify-between text-sm">
                    <span className="text-slate-700">{o.name} <span className="text-slate-400">× {o.quantity}</span></span>
                    <span className="font-medium">{formatCurrency(o.revenue)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data.priceChanges?.length > 0 && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">Price changes in this range</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.priceChanges.map((c, i) => {
                  const delta = c.perDayAfter - c.perDayBefore
                  const Icon = delta > 0.05 ? TrendingUp : delta < -0.05 ? TrendingDown : Minus
                  const tone = delta > 0.05 ? "text-emerald-600" : delta < -0.05 ? "text-red-600" : "text-slate-400"
                  return (
                    <div key={`${c.menuItemId}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate">{c.name}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(c.changedAt).toLocaleDateString()} → {formatCurrency(c.price)}
                          {c.changedBy ? ` · ${c.changedBy}` : ""}
                        </p>
                      </div>
                      <p className={`text-xs font-medium flex items-center gap-1 flex-shrink-0 ${tone}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {c.perDayBefore} → {c.perDayAfter} /day
                      </p>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-xl font-semibold text-slate-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}
