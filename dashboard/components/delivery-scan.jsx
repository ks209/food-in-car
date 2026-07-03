"use client"

import { useEffect, useRef, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Camera, CameraOff, QrCode, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "sonner"
import axios from "axios"

import { API } from "@/lib/api"
const READER_ID = "delivery-qr-reader"

export function DeliveryScan() {
  const scannerRef = useRef(null)
  const busyRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [result, setResult] = useState(null) // { ok, order, message }
  const [submitting, setSubmitting] = useState(false)

  const completeOrder = async (rawCode) => {
    const code = (rawCode || "").trim().toUpperCase()
    if (!code || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    try {
      const res = await axios.put(`${API}/api/order/scan`, { code }, { withCredentials: true })
      setResult({ ok: true, order: res.data })
      toast.success(`Order #${res.data.id} completed`)
      await stopCamera()
    } catch (err) {
      const msg = err.response?.data?.error || "Could not complete this order"
      setResult({ ok: false, message: msg })
      toast.error(msg)
    } finally {
      setSubmitting(false)
      // brief debounce so a held QR doesn't double-fire
      setTimeout(() => { busyRef.current = false }, 1500)
    }
  }

  const startCamera = async () => {
    setResult(null)
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const scanner = new Html5Qrcode(READER_ID)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => completeOrder(decoded),
        () => {} // ignore per-frame decode errors
      )
      setScanning(true)
    } catch (err) {
      toast.error("Unable to access camera — use manual entry below")
      setScanning(false)
    }
  }

  const stopCamera = async () => {
    const scanner = scannerRef.current
    if (scanner) {
      try { await scanner.stop(); await scanner.clear() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }

  // Clean up the camera if the component unmounts mid-scan
  useEffect(() => () => { stopCamera() }, [])

  return (
    <div className="max-w-md mx-auto space-y-5">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <QrCode className="h-5 w-5 brand-text" />
            <h2 className="font-semibold text-sm">Scan customer QR</h2>
          </div>

          {/* Camera viewport */}
          <div
            id={READER_ID}
            className="rounded-xl overflow-hidden bg-slate-900 aspect-square w-full flex items-center justify-center text-slate-500"
          >
            {!scanning && <span className="text-xs">Camera is off</span>}
          </div>

          {scanning ? (
            <Button variant="outline" className="w-full" onClick={stopCamera}>
              <CameraOff className="h-4 w-4 mr-2" /> Stop camera
            </Button>
          ) : (
            <Button className="w-full brand-bg text-white" onClick={startCamera}>
              <Camera className="h-4 w-4 mr-2" /> Start camera
            </Button>
          )}

          {/* Manual fallback */}
          <div className="pt-1">
            <p className="text-xs text-slate-400 mb-2">No camera? Enter the code shown on the customer's phone.</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); completeOrder(manualCode); setManualCode("") }}
            >
              <Input
                placeholder="e.g. 7KQ9TMUP"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="uppercase tracking-widest"
              />
              <Button type="submit" disabled={submitting || !manualCode.trim()} className="brand-bg text-white">
                Complete
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card className={`border-0 shadow-sm ${result.ok ? "bg-emerald-50" : "bg-red-50"}`}>
          <CardContent className="p-5">
            {result.ok ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                  <CheckCircle2 className="h-5 w-5" /> Order #{result.order.id} delivered
                </div>
                <p className="text-sm text-slate-600">
                  {result.order.user?.customerName || result.order.guestName || "Guest"}
                  {` · ${result.order.guestVehicle || "Pickup"}`}
                </p>
                <p className="text-sm text-slate-500">
                  {result.order.orderItems?.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                </p>
                <p className="text-sm font-bold text-slate-800">₹{result.order.totalAmount.toFixed(0)}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-700 font-medium">
                <XCircle className="h-5 w-5" /> {result.message}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
