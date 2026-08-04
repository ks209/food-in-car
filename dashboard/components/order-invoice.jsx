"use client"

import { Fragment, useState } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Printer, Receipt } from "lucide-react"
import { formatCurrency, PAYMENT_METHOD_LABELS } from "@/lib/format"

// Fixed ink colors, independent of the app's dark theme — a printed bill is
// always on white paper, so its on-screen preview should match exactly what
// prints, and never inherit the dashboard's dark-mode text/border remaps
// (those target Tailwind's text-slate-*/border-slate-* utility classes, which
// this component deliberately avoids for that reason).
const INK = "#18181b"
const MUTED = "#71717a"
const DIVIDER = "#d4d4d8"

function Row({ label, value }) {
  if (!value) return null
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: INK, textAlign: "right" }}>{value}</span>
    </div>
  )
}

function InvoiceBody({ order, className }) {
  const customer = order.user?.customerName || order.guestName || "Guest"
  const vehicle = order.guestVehicle
  const phone = order.user?.phoneNumber
  const r = order.restaurant || {}
  const paymentLabel = PAYMENT_METHOD_LABELS[order.paymentMethod] || "Cash on Delivery"

  return (
    <div
      className={className}
      style={{ background: "#fff", color: INK, borderRadius: 12, padding: "20px 18px", fontSize: 13, lineHeight: 1.5 }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", borderBottom: `1px dashed ${DIVIDER}`, paddingBottom: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: INK }}>{r.name || "Restaurant"}</p>
        {r.address && <p style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{r.address}</p>}
        {r.phone && <p style={{ fontSize: 11, color: MUTED }}>{r.phone}</p>}
      </div>

      {/* Meta */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, marginBottom: 12 }}>
        <Row label="Invoice" value={`#${order.dailyOrderNumber ?? order.id}`} />
        <Row label="Date" value={new Date(order.createdAt).toLocaleString()} />
        <Row label="Customer" value={customer} />
        <Row label="Phone" value={phone} />
        <Row label={vehicle ? "Vehicle" : "Fulfilment"} value={vehicle || "Pickup"} />
        <Row label="Payment" value={paymentLabel} />
        {order.waiter?.name && <Row label="Delivered by" value={order.waiter.name} />}
      </div>

      {/* Items */}
      <div style={{ borderTop: `1px dashed ${DIVIDER}`, paddingTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "6px 10px", fontSize: 12 }}>
          <span style={{ color: MUTED, fontWeight: 600 }}>Item</span>
          <span style={{ color: MUTED, fontWeight: 600, textAlign: "center" }}>Qty</span>
          <span style={{ color: MUTED, fontWeight: 600, textAlign: "right" }}>Amount</span>

          {order.orderItems?.map((i) => (
            <Fragment key={i.id}>
              <span style={{ color: INK }}>
                {i.name}
                {i.options?.length > 0 && (
                  <span style={{ display: "block", fontSize: 10, color: MUTED }}>
                    {i.options.map((o) => o.name).join(", ")}
                  </span>
                )}
              </span>
              <span style={{ color: INK, textAlign: "center" }}>{i.quantity}</span>
              <span style={{ color: INK, textAlign: "right" }}>
                {formatCurrency(i.finalPrice * i.quantity)}
              </span>
            </Fragment>
          ))}
        </div>

        <div style={{
          borderTop: `1px dashed ${DIVIDER}`, marginTop: 12, paddingTop: 10,
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>Total</span>
          <span style={{ fontWeight: 700, fontSize: 16, color: INK }}>{formatCurrency(order.totalAmount)}</span>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 10, color: MUTED, marginTop: 16 }}>Thank you for your order!</p>
    </div>
  )
}

// Printable bill/invoice for a single order.
//
// The on-screen preview lives inside the Dialog below. The actual print target
// is a SEPARATE copy, portalled directly onto <body> (see globals.css's
// `.invoice-print-area` rules) — deliberately not the copy inside the dialog.
// Radix's DialogContent is `position: fixed` with a CSS transform, and a
// transformed ancestor becomes the containing block for fixed/absolute
// descendants; printing through it made the receipt re-center on every page
// the (still browser-managed) full page-height produced. Portalling a plain,
// normal-flow copy straight onto <body> and hiding everything else at the
// body level sidesteps that entirely — the bill just prints once, in place.
export function OrderInvoice({ order }) {
  const [open, setOpen] = useState(false)

  if (!order) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Receipt className="h-3.5 w-3.5 mr-1" />Bill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Invoice · Order #{order.dailyOrderNumber ?? order.id}</DialogTitle></DialogHeader>

        <InvoiceBody order={order} />

        <Button className="w-full brand-bg text-white no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
        </Button>
      </DialogContent>

      {/* Only mounted while this specific dialog is open — otherwise every
          order row's OrderInvoice would portal a hidden bill onto <body>,
          and any stray Ctrl+P on the page would print all of them at once. */}
      {open && createPortal(
        <InvoiceBody order={order} className="invoice-print-area" />,
        document.body
      )}
    </Dialog>
  )
}
