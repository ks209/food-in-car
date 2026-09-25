"use client"

import { useEffect, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar, Download, Printer } from "lucide-react"
import { toast } from "sonner"
import { API } from "@/lib/api"
import { formatCurrency, todayStr, daysAgoStr, localDateRange } from "@/lib/format"

// Day-end (what the till should hold) and GST (what the accountant files).

const downloadCsv = (filename, rows) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function Reports() {
  const [fromDate, setFromDate] = useState(todayStr)
  const [toDate, setToDate] = useState(todayStr)
  const [dayEnd, setDayEnd] = useState(null)
  const [gst, setGst] = useState(null)
  const [waste, setWaste] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!fromDate || !toDate) return
    setLoading(true)
    const params = localDateRange(fromDate, toDate)
    const opts = { params, withCredentials: true }
    Promise.all([
      axios.get(`${API}/api/reports/day-end`, opts).then((r) => setDayEnd(r.data)),
      axios.get(`${API}/api/reports/gst`, opts).then((r) => setGst(r.data)),
      axios.get(`${API}/api/reports/waste`, opts).then((r) => setWaste(r.data)),
    ])
      .catch(() => toast.error("Couldn't load reports"))
      .finally(() => setLoading(false))
  }, [fromDate, toDate])

  const exportGst = () => {
    if (!gst?.rows?.length) return toast.error("Nothing to export for this range")
    downloadCsv(`gst-${fromDate}-to-${toDate}.csv`, [
      ["Invoice", "Date", "GSTIN", "SAC", "Rate %", "Taxable", "CGST", "SGST", "Total", "Payment"],
      ...gst.rows.map((r) => [
        r.invoiceNo, new Date(r.date).toLocaleString(), r.gstin, r.sac, r.rate,
        r.taxable, r.cgst, r.sgst, r.total, r.payment,
      ]),
      [], ["Totals", "", "", "", "", gst.totals.taxable, gst.totals.cgst, gst.totals.sgst, gst.totals.total, ""],
    ])
  }

  const period = fromDate === toDate ? new Date(`${fromDate}T00:00:00`).toLocaleDateString() : `${fromDate} → ${toDate}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-slate-500 text-sm">Day-end close and GST, for {period}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <Calendar className="h-4 w-4 text-slate-400" />
          <Input type="date" value={fromDate} max={toDate} onChange={(e) => e.target.value && setFromDate(e.target.value)} className="bg-white w-[150px]" />
          <span className="text-slate-400 text-sm">–</span>
          <Input type="date" value={toDate} min={fromDate} onChange={(e) => e.target.value && setToDate(e.target.value)} className="bg-white w-[150px]" />
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setFromDate(todayStr()); setToDate(todayStr()) }}>Today</Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { const d = daysAgoStr(1); setFromDate(d); setToDate(d) }}>Yesterday</Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => { setFromDate(daysAgoStr(29)); setToDate(todayStr()) }}>30 days</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
      ) : (
        <>
          {dayEnd && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">Day-end close</CardTitle>
                {/* Prints through the thermal printer setup — a Z report on the roll */}
                <Button variant="outline" size="sm" className="text-xs no-print" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5 mr-1" /> Print
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label="Orders" value={dayEnd.sales.orders} />
                  <Stat label="Gross sales" value={formatCurrency(dayEnd.sales.gross)} />
                  <Stat label="GST collected" value={formatCurrency(dayEnd.sales.gst)} />
                  <Stat label="Average order" value={formatCurrency(dayEnd.sales.averageOrder)} />
                </div>

                <Section title="Payments">
                  {Object.entries(dayEnd.byPayment).length === 0 && <Line label="No sales" value="—" />}
                  {Object.entries(dayEnd.byPayment).map(([method, v]) => (
                    <Line key={method} label={method === "PHONEPE" ? "PhonePe" : "Cash"} value={`${formatCurrency(v.amount)} · ${v.orders} order${v.orders === 1 ? "" : "s"}`} />
                  ))}
                </Section>

                <Section title="Where orders came from">
                  <Line label="Counter (POS)" value={`${formatCurrency(dayEnd.channels.counter.amount)} · ${dayEnd.channels.counter.orders}`} />
                  <Line label="Customer app" value={`${formatCurrency(dayEnd.channels.app.amount)} · ${dayEnd.channels.app.orders}`} />
                </Section>

                <Section title="Cancellations">
                  <Line label="Total" value={dayEnd.cancellations.count} />
                  {Object.entries(dayEnd.cancellations.byReason).map(([reason, count]) => (
                    <Line key={reason} label={reason} value={count} muted />
                  ))}
                </Section>

                {(dayEnd.refunds.due > 0 || dayEnd.refunds.completed > 0) && (
                  <Section title="Refunds">
                    <Line label="Owed (refund in PhonePe)" value={`${formatCurrency(dayEnd.refunds.dueAmount)} · ${dayEnd.refunds.due}`} />
                    <Line label="Marked refunded" value={`${formatCurrency(dayEnd.refunds.completedAmount)} · ${dayEnd.refunds.completed}`} muted />
                  </Section>
                )}

                {dayEnd.waste.entries > 0 && (
                  <Section title="Waste">
                    <Line label="Logged" value={`${formatCurrency(dayEnd.waste.cost)} · ${dayEnd.waste.entries} entr${dayEnd.waste.entries === 1 ? "y" : "ies"}`} />
                  </Section>
                )}
              </CardContent>
            </Card>
          )}

          {gst && (
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  GST · {gst.count} invoice{gst.count === 1 ? "" : "s"}
                </CardTitle>
                <Button variant="outline" size="sm" className="text-xs no-print" onClick={exportGst}>
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label="Taxable value" value={formatCurrency(gst.totals.taxable)} />
                  <Stat label="CGST" value={formatCurrency(gst.totals.cgst)} />
                  <Stat label="SGST" value={formatCurrency(gst.totals.sgst)} />
                  <Stat label="Invoice total" value={formatCurrency(gst.totals.total)} />
                </div>
                <p className="text-xs text-slate-400">
                  One row per completed order, split half CGST / half SGST (intra-state supply). Check the layout with your
                  accountant before filing.
                </p>
              </CardContent>
            </Card>
          )}

          <WasteCard waste={waste} from={fromDate} to={toDate} onLogged={() => {
            const params = localDateRange(fromDate, toDate)
            axios.get(`${API}/api/reports/waste`, { params, withCredentials: true }).then((r) => setWaste(r.data)).catch(() => {})
          }} />
        </>
      )}
    </div>
  )
}

function WasteCard({ waste, onLogged }) {
  if (!waste) return null
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Waste · {formatCurrency(waste.totalCost)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {waste.entries.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing logged for this range. Log waste from the Menu page.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.entries(waste.byReason).map(([reason, cost]) => (
                <span key={reason} className="text-xs rounded-full border border-slate-200 px-2.5 py-1 text-slate-600">
                  {reason}: {formatCurrency(cost)}
                </span>
              ))}
            </div>
            <div className="divide-y divide-slate-50">
              {waste.entries.slice(0, 20).map((e) => (
                <div key={e.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 truncate">{e.quantity} × {e.name}</p>
                    <p className="text-xs text-slate-400">
                      {e.reason}{e.note ? ` · ${e.note}` : ""} · {new Date(e.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-medium flex-shrink-0">{formatCurrency(e.estimatedCost)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-slate-900 mt-0.5">{value}</p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Line({ label, value, muted }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={muted ? "text-slate-400" : "text-slate-600"}>{label}</span>
      <span className={muted ? "text-slate-400" : "font-medium text-slate-800"}>{value}</span>
    </div>
  )
}
