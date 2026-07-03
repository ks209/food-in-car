"use client"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Printer, Receipt } from "lucide-react"

// Printable bill/invoice for a single order. The print button calls window.print();
// the @media print rules in globals.css isolate the `.invoice-print-area` element.
export function OrderInvoice({ order }) {
  if (!order) return null
  const customer = order.user?.customerName || order.guestName || "Guest"
  const vehicle = order.guestVehicle
  const phone = order.user?.phoneNumber
  const r = order.restaurant || {}

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Receipt className="h-3.5 w-3.5 mr-1" />Bill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Invoice · Order #{order.id}</DialogTitle></DialogHeader>

        <div className="invoice-print-area text-slate-800">
          {/* Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <p className="text-base font-bold">{r.name || "Restaurant"}</p>
            {r.address && <p className="text-xs text-slate-500">{r.address}</p>}
            {r.phone && <p className="text-xs text-slate-500">{r.phone}</p>}
          </div>

          {/* Meta */}
          <div className="text-xs text-slate-600 space-y-0.5 mb-3">
            <div className="flex justify-between"><span>Invoice</span><span>#{order.id}</span></div>
            <div className="flex justify-between"><span>Date</span><span>{new Date(order.createdAt).toLocaleString()}</span></div>
            <div className="flex justify-between"><span>Customer</span><span>{customer}</span></div>
            {phone && <div className="flex justify-between"><span>Phone</span><span>{phone}</span></div>}
            <div className="flex justify-between"><span>{vehicle ? "Vehicle" : "Fulfilment"}</span><span>{vehicle || "Pickup"}</span></div>
            {order.waiter?.name && <div className="flex justify-between"><span>Delivered by</span><span>{order.waiter.name}</span></div>}
          </div>

          {/* Items */}
          <div className="border-t border-dashed border-slate-300 pt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left font-medium pb-1">Item</th>
                  <th className="text-center font-medium pb-1">Qty</th>
                  <th className="text-right font-medium pb-1">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.orderItems?.map((i) => (
                  <tr key={i.id} className="align-top">
                    <td className="py-0.5">
                      {i.name}
                      {i.options?.length > 0 && (
                        <span className="block text-[10px] text-slate-400">{i.options.map((o) => o.name).join(", ")}</span>
                      )}
                    </td>
                    <td className="py-0.5 text-center">{i.quantity}</td>
                    <td className="py-0.5 text-right">₹{(i.finalPrice * i.quantity).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-dashed border-slate-300 mt-3 pt-2 flex justify-between text-sm font-bold">
              <span>Total</span>
              <span>₹{order.totalAmount.toFixed(0)}</span>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-400 mt-4">Thank you for your order!</p>
        </div>

        <Button className="w-full brand-bg text-white no-print" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
        </Button>
      </DialogContent>
    </Dialog>
  )
}
