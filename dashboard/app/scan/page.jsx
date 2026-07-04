"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import axios from "axios"
import { API } from "@/lib/api"

const READER_ID = "waiter-qr-reader"

function ScanInner() {
  const params = useSearchParams()
  const token = params.get("token")
  const scannerRef = useRef(null)
  const busyRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const completeOrder = async (rawCode) => {
    const code = (rawCode || "").trim().toUpperCase()
    if (!code || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    try {
      const res = await axios.put(
        `${API}/api/order/scan?token=${encodeURIComponent(token)}`,
        { code },
        { withCredentials: true }
      )
      setResult({ ok: true, order: res.data })
      await stopCamera()
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.error || "Could not complete this order" })
    } finally {
      setSubmitting(false)
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
        () => {}
      )
      setScanning(true)
    } catch {
      setResult({ ok: false, message: "Unable to access camera — use manual entry below" })
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

  useEffect(() => () => { stopCamera() }, [])

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-slate-600">Missing or invalid scan link. Ask the restaurant to generate a new one.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4">
      <div className="w-full max-w-sm space-y-4 mt-4">
        <div className="text-center">
          <h1 className="text-lg font-bold text-slate-800">Delivery Scanner</h1>
          <p className="text-xs text-slate-500">Scan the QR on the customer's phone to complete the order.</p>
        </div>

        <div id={READER_ID} className="rounded-xl overflow-hidden bg-slate-900 aspect-square w-full flex items-center justify-center text-slate-500 text-xs">
          {!scanning && "Camera is off"}
        </div>

        {scanning ? (
          <button className="w-full py-2.5 rounded-lg border border-slate-300 text-sm font-medium" onClick={stopCamera}>
            Stop camera
          </button>
        ) : (
          <button className="w-full py-2.5 rounded-lg bg-orange-600 text-white text-sm font-medium" onClick={startCamera}>
            Start camera
          </button>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); completeOrder(manualCode); setManualCode("") }}
        >
          <input
            placeholder="Enter code"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm uppercase tracking-widest"
          />
          <button type="submit" disabled={submitting || !manualCode.trim()}
            className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium disabled:opacity-50">
            Complete
          </button>
        </form>

        {result && (
          <div className={`rounded-xl p-4 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {result.ok ? (
              <div className="space-y-1">
                <p className="font-semibold">✓ Order #{result.order.id} delivered</p>
                <p className="text-slate-600">
                  {result.order.user?.customerName || result.order.guestName || "Guest"}
                  {` · ${result.order.guestVehicle || "Pickup"}`}
                </p>
                <p className="font-bold text-slate-800">₹{result.order.totalAmount.toFixed(0)}</p>
              </div>
            ) : (
              <p>{result.message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function WaiterScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>}>
      <ScanInner />
    </Suspense>
  )
}
