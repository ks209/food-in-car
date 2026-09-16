"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import axios from "axios"
import {
  Car, ShoppingBag, Phone, ScanLine, Flame, CheckCircle2, Clock, Hand, Undo2,
  Volume2, VolumeX, X, SquareParking, MessageSquareText, WifiOff, Keyboard,
} from "lucide-react"
import { API } from "@/lib/api"

const READER_ID = "waiter-qr-reader"
const POLL_MS = 5000
const DEFAULT_WARN_MIN = 8
const DEFAULT_CRIT_MIN = 15

// ── helpers ───────────────────────────────────────────────────────────────────

function minutesSince(iso, now) {
  return Math.max(0, (now - new Date(iso).getTime()) / 60000)
}

function waitLabel(mins) {
  if (mins < 1) return "just now"
  if (mins < 60) return `${Math.floor(mins)} min`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ${Math.floor(mins % 60)}m`
  return `${Math.floor(mins / (24 * 60))}d`
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

// Short two-note ping + vibration for "new order ready". Audio only works after
// the waiter has touched the page once (browser autoplay rules).
function useReadyAlert(enabled) {
  const ctxRef = useRef(null)
  useEffect(() => {
    const unlock = () => {
      try {
        if (!ctxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext
          if (Ctx) ctxRef.current = new Ctx()
        }
        if (ctxRef.current?.state === "suspended") ctxRef.current.resume()
      } catch {}
    }
    window.addEventListener("pointerdown", unlock)
    return () => window.removeEventListener("pointerdown", unlock)
  }, [])

  return useCallback(() => {
    if (!enabled) return
    try { navigator.vibrate?.([200, 100, 200]) } catch {}
    const ctx = ctxRef.current
    if (!ctx || ctx.state !== "running") return
    ;[880, 1175].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.18
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.35, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.18)
    })
  }, [enabled])
}

// ── scanner sheet ─────────────────────────────────────────────────────────────

function ScannerSheet({ token, target, onClose, onDelivered }) {
  const scannerRef = useRef(null)
  const busyRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState("")
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current
    if (scanner) {
      try { await scanner.stop(); await scanner.clear() } catch {}
      scannerRef.current = null
    }
    setScanning(false)
  }, [])

  const completeOrder = async (rawCode) => {
    const code = (rawCode || "").trim().toUpperCase()
    if (!code || busyRef.current) return
    busyRef.current = true
    setSubmitting(true)
    try {
      const res = await axios.put(`${API}/api/order/scan?token=${encodeURIComponent(token)}`, { code })
      setResult({ ok: true, order: res.data })
      await stopCamera()
      onDelivered()
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.error || "Could not complete this order" })
    } finally {
      setSubmitting(false)
      setTimeout(() => { busyRef.current = false }, 1500)
    }
  }

  const startCamera = async () => {
    setResult(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setResult({ ok: false, message: "Camera needs a secure (https) connection — use the code instead." })
      return
    }
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const scanner = new Html5Qrcode(READER_ID)
      scannerRef.current = scanner
      // Responsive qrbox: never larger than the video, or html5-qrcode throws.
      const qrbox = (w, h) => {
        const size = Math.floor(Math.min(w, h) * 0.7)
        return { width: size, height: size }
      }
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox }, (decoded) => completeOrder(decoded), () => {})
      setScanning(true)
    } catch (err) {
      await stopCamera()
      const denied = err?.name === "NotAllowedError" || /permission/i.test(err?.message || "")
      setResult({
        ok: false,
        message: denied
          ? "Camera permission was blocked — allow camera access in your browser, or type the code."
          : "Unable to access camera — type the code instead.",
      })
    }
  }

  // Open straight into the camera — that's why the sheet was opened.
  useEffect(() => {
    startCamera()
    return () => { stopCamera() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = async () => { await stopCamera(); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={close}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-900">Scan customer&apos;s QR</p>
            {target && (
              <p className="text-xs text-slate-500">
                For #{target.dailyOrderNumber ?? target.id} · {target.guestVehicle || "Pickup"}
                {target.parkingSpot ? ` · ${target.parkingSpot}` : ""}
              </p>
            )}
          </div>
          <button onClick={close} className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-square w-full">
          {/* Owned entirely by html5-qrcode — keep it free of React children. */}
          <div id={READER_ID} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />
          {!scanning && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <span>Camera is off</span>
              <button onClick={startCamera} className="pointer-events-auto px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-medium">
                Start camera
              </button>
            </div>
          )}
        </div>

        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); completeOrder(manualCode); setManualCode("") }}>
          <div className="relative flex-1">
            <Keyboard className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              placeholder="Or type the code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              className="w-full pl-8 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm uppercase tracking-widest"
            />
          </div>
          <button type="submit" disabled={submitting || !manualCode.trim()}
            className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-semibold disabled:opacity-50">
            Deliver
          </button>
        </form>

        {result && (
          <div className={`rounded-xl p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {result.ok ? (
              <div className="space-y-0.5">
                <p className="font-semibold">✓ Order #{result.order.dailyOrderNumber ?? result.order.id} delivered</p>
                <p className="text-slate-600">
                  {result.order.user?.customerName || result.order.guestName || "Guest"}
                  {` · ${result.order.guestVehicle || "Pickup"}`}
                  {result.order.parkingSpot && ` · ${result.order.parkingSpot}`}
                </p>
                <button onClick={close} className="mt-2 w-full py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold">Done</button>
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

// ── order cards ───────────────────────────────────────────────────────────────

function ItemsList({ order }) {
  return (
    <ul className="space-y-0.5">
      {order.orderItems.map((i) => (
        <li key={i.id} className="text-sm text-slate-800">
          <span className="font-semibold">{i.quantity}×</span> {i.name}
          {i.options?.length > 0 && <span className="text-slate-500"> ({i.options.map((o) => o.name).join(", ")})</span>}
        </li>
      ))}
    </ul>
  )
}

function Destination({ order, large }) {
  if (!order.guestVehicle) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-bold text-amber-700 ${large ? "text-lg" : "text-sm"}`}>
        <ShoppingBag className={large ? "h-5 w-5" : "h-4 w-4"} /> PICKUP
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1.5 font-bold tracking-wide text-slate-900 ${large ? "text-lg" : "text-sm"}`}>
      <Car className={large ? "h-5 w-5" : "h-4 w-4"} /> {order.guestVehicle}
    </span>
  )
}

function ReadyCard({ order, me, now, warnMin, critMin, busy, onClaim, onRelease, onScan }) {
  const mins = minutesSince(order.statusSince, now)
  const tone = mins >= critMin ? "bg-red-50 text-red-700" : mins >= warnMin ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
  const mine = order.claimedByWaiterId === me
  const takenByOther = order.claimedByWaiterId && !mine

  return (
    <div className={`rounded-2xl bg-white border p-4 space-y-3 shadow-sm ${mine ? "border-orange-400 ring-2 ring-orange-200" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">#{order.dailyOrderNumber ?? order.id}</span>
            {mine && <span className="text-[10px] font-bold uppercase tracking-wide text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">Yours</span>}
          </div>
          <Destination order={order} large />
          {order.parkingSpot && (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-sky-700">
              <SquareParking className="h-4 w-4" /> {order.parkingSpot}
            </p>
          )}
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
          <Clock className="h-3 w-3" /> {waitLabel(mins)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-700 truncate">{order.customerName}</span>
        {order.customerPhone && (
          <a href={`tel:${order.customerPhone}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">
            <Phone className="h-3.5 w-3.5" /> Call
          </a>
        )}
      </div>

      <ItemsList order={order} />

      {order.deliveryInstructions?.trim() && (
        <p className="flex gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-xs font-medium text-amber-700">
          <MessageSquareText className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {order.deliveryInstructions}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{order.paymentMethod === "PHONEPE" ? "Paid online" : "Cash on delivery"}</span>
        <span className="font-bold text-slate-900 text-sm">₹{order.totalAmount.toFixed(0)}</span>
      </div>

      {takenByOther ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Taken by <span className="font-semibold text-slate-700">{order.claimedBy?.name || "another server"}</span></p>
          <button onClick={() => onScan(order)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
            <ScanLine className="h-4 w-4" /> Scan anyway
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {mine ? (
            <button disabled={busy} onClick={() => onRelease(order)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
              <Undo2 className="h-4 w-4" /> Release
            </button>
          ) : (
            <button disabled={busy} onClick={() => onClaim(order)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300 py-2.5 text-sm font-semibold text-orange-700 disabled:opacity-50">
              <Hand className="h-4 w-4" /> I&apos;ll take it
            </button>
          )}
          <button onClick={() => onScan(order)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white">
            <ScanLine className="h-4 w-4" /> Scan to deliver
          </button>
        </div>
      )}
    </div>
  )
}

function PreparingCard({ order, now }) {
  const mins = minutesSince(order.statusSince, now)
  return (
    <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono text-slate-400">#{order.dailyOrderNumber ?? order.id}</span>
          <Destination order={order} />
        </div>
        <span className="text-xs text-slate-500 flex-shrink-0">
          {order.status === "PAID" ? "In queue" : "Cooking"} · {waitLabel(mins)}
        </span>
      </div>
      {order.parkingSpot && (
        <p className="flex items-center gap-1 text-xs font-semibold text-sky-700"><SquareParking className="h-3.5 w-3.5" /> {order.parkingSpot}</p>
      )}
      <p className="text-xs text-slate-600">{order.orderItems.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
    </div>
  )
}

function DeliveredRow({ order }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">
          #{order.dailyOrderNumber ?? order.id} · {order.guestVehicle || "Pickup"}
          {order.parkingSpot ? ` · ${order.parkingSpot}` : ""}
        </p>
        <p className="text-xs text-slate-500 truncate">{order.customerName}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-slate-900">₹{order.totalAmount.toFixed(0)}</p>
        <p className="text-xs text-slate-500">{order.deliveredAt ? timeLabel(order.deliveredAt) : ""}</p>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "ready", label: "Ready", icon: CheckCircle2 },
  { key: "preparing", label: "Coming up", icon: Flame },
  { key: "delivered", label: "My deliveries", icon: Car },
]

function WaiterApp() {
  const params = useSearchParams()
  const token = params.get("token")
  const api = useMemo(() => axios.create({ baseURL: API, params: { token } }), [token])

  const [profile, setProfile] = useState(null)
  const [data, setData] = useState(null)
  const [fatal, setFatal] = useState(null) // expired / revoked link
  const [offline, setOffline] = useState(false)
  const [tab, setTab] = useState("ready")
  const [spotFilter, setSpotFilter] = useState("all")
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [scanTarget, setScanTarget] = useState(undefined) // undefined = closed, null = open without a specific order
  const [now, setNow] = useState(() => Date.now())
  const [sound, setSound] = useState(true)

  const knownReadyRef = useRef(null)
  const alert = useReadyAlert(sound)

  useEffect(() => {
    try { setSound(localStorage.getItem("waiterSound") !== "off") } catch {}
  }, [])
  const toggleSound = () => setSound((s) => {
    try { localStorage.setItem("waiterSound", s ? "off" : "on") } catch {}
    return !s
  })

  const handleError = (err) => {
    if (err?.response?.status === 403) setFatal(err.response.data?.error || "This scan link is no longer valid")
    else setOffline(true)
  }

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/waiter-app/orders")
      setOffline(false)
      const readyIds = res.data.ready.map((o) => o.id)
      if (knownReadyRef.current && readyIds.some((id) => !knownReadyRef.current.has(id))) alert()
      knownReadyRef.current = new Set(readyIds)
      setData(res.data)
    } catch (err) {
      handleError(err)
    }
  }, [api, alert])

  useEffect(() => {
    if (!token) return
    api.get("/api/waiter-app/me").then((r) => setProfile(r.data)).catch(handleError)
    load()
    const poll = setInterval(load, POLL_MS)
    const tick = setInterval(() => setNow(Date.now()), 15000)
    return () => { clearInterval(poll); clearInterval(tick) }
  }, [token, api, load])

  const flash = (text, ok = true) => {
    setNotice({ text, ok })
    setTimeout(() => setNotice(null), 2500)
  }

  const claim = async (order) => {
    setBusyId(order.id)
    try {
      await api.post(`/api/waiter-app/orders/${order.id}/claim`)
      flash(`#${order.dailyOrderNumber ?? order.id} is yours`)
    } catch (err) {
      if (err?.response?.status === 403) return handleError(err)
      flash(err?.response?.data?.error || "Couldn't take this order", false)
    } finally {
      setBusyId(null)
      load()
    }
  }

  const release = async (order) => {
    setBusyId(order.id)
    try {
      await api.delete(`/api/waiter-app/orders/${order.id}/claim`)
    } catch (err) {
      if (err?.response?.status === 403) return handleError(err)
      flash(err?.response?.data?.error || "Couldn't release this order", false)
    } finally {
      setBusyId(null)
      load()
    }
  }

  if (!token || fatal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 p-6 text-center bg-slate-50">
        <ScanLine className="h-10 w-10 text-slate-300" />
        <p className="font-semibold text-slate-800">Scan link not valid</p>
        <p className="text-sm text-slate-600 max-w-xs">{fatal || "Missing or invalid scan link."} Ask the restaurant to share a new link from Servers.</p>
      </div>
    )
  }

  const me = profile?.waiter?.id
  const warnMin = profile?.restaurant?.slaWarnMinutes ?? DEFAULT_WARN_MIN
  const critMin = profile?.restaurant?.slaCritMinutes ?? DEFAULT_CRIT_MIN
  const ready = data?.ready ?? []
  const preparing = data?.preparing ?? []
  const delivered = data?.delivered ?? []

  // Spot chips come from what's actually waiting, so a waiter heading to one
  // area can see (and take) everything going there in one trip.
  const spotChips = [...new Set(ready.map((o) => (o.guestVehicle ? o.parkingSpot || "No spot" : "Pickup")))]
  const readyVisible = ready
    .filter((o) => spotFilter === "all" || (o.guestVehicle ? (o.parkingSpot || "No spot") : "Pickup") === spotFilter)
    // Your own taken orders first, then oldest waiting.
    .sort((a, b) => (b.claimedByWaiterId === me) - (a.claimedByWaiterId === me))
  const myActive = ready.filter((o) => o.claimedByWaiterId === me).length
  const counts = { ready: ready.length, preparing: preparing.length, delivered: delivered.length }

  const expiresAt = profile?.tokenExpiresAt ? new Date(profile.tokenExpiresAt) : null
  const expiresSoon = expiresAt && expiresAt.getTime() - now < 2 * 60 * 60000

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {profile?.restaurant?.logoUrl ? (
                <img src={profile.restaurant.logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-orange-600 text-white font-bold flex items-center justify-center">
                  {(profile?.restaurant?.name || "R")[0]}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{profile?.restaurant?.name || "Loading…"}</p>
                <p className="text-xs text-slate-500 truncate">
                  {profile?.waiter?.name ? `Hi ${profile.waiter.name}` : ""}
                  {myActive > 0 ? ` · ${myActive} taken by you` : ""}
                </p>
              </div>
            </div>
            <button onClick={toggleSound} className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600" aria-label={sound ? "Mute alerts" : "Unmute alerts"}>
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold ${tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                <t.icon className="h-3.5 w-3.5" /> {t.label}
                <span className={`ml-0.5 rounded-full px-1.5 text-[10px] ${t.key === "ready" && counts.ready ? "bg-orange-600 text-white" : "bg-slate-100 text-slate-600"}`}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-3 space-y-3">
        {offline && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <WifiOff className="h-3.5 w-3.5" /> Connection lost — retrying…
          </p>
        )}
        {expiresSoon && (
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            This link expires at {timeLabel(expiresAt.toISOString())}. Ask the restaurant for a new one before then.
          </p>
        )}

        {!data ? (
          <p className="text-center text-sm text-slate-500 py-16">Loading orders…</p>
        ) : tab === "ready" ? (
          <>
            {spotChips.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {["all", ...spotChips].map((s) => (
                  <button key={s} onClick={() => setSpotFilter(s)}
                    className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold border ${spotFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>
                    {s === "all" ? `All (${ready.length})` : `${s} (${ready.filter((o) => (o.guestVehicle ? o.parkingSpot || "No spot" : "Pickup") === s).length})`}
                  </button>
                ))}
              </div>
            )}
            {readyVisible.length === 0 ? (
              <div className="text-center py-16 space-y-1">
                <CheckCircle2 className="h-10 w-10 text-emerald-300 mx-auto" />
                <p className="font-semibold text-slate-700">Nothing waiting to go out</p>
                <p className="text-sm text-slate-500">
                  {preparing.length ? `${preparing.length} order${preparing.length === 1 ? "" : "s"} still in the kitchen.` : "New ready orders will appear here."}
                </p>
              </div>
            ) : (
              readyVisible.map((o) => (
                <ReadyCard key={o.id} order={o} me={me} now={now} warnMin={warnMin} critMin={critMin}
                  busy={busyId === o.id} onClaim={claim} onRelease={release} onScan={setScanTarget} />
              ))
            )}
          </>
        ) : tab === "preparing" ? (
          preparing.length === 0
            ? <p className="text-center text-sm text-slate-500 py-16">The kitchen has nothing in progress.</p>
            : preparing.map((o) => <PreparingCard key={o.id} order={o} now={now} />)
        ) : (
          <>
            <div className="rounded-xl bg-white border border-slate-200 p-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">Served by you today</span>
              <span className="text-lg font-bold text-slate-900">{delivered.length}</span>
            </div>
            {delivered.length === 0
              ? <p className="text-center text-sm text-slate-500 py-10">No deliveries yet today.</p>
              : delivered.map((o) => <DeliveredRow key={o.id} order={o} />)}
          </>
        )}
      </div>

      {notice && (
        <div className={`fixed left-1/2 -translate-x-1/2 bottom-24 z-40 rounded-full px-4 py-2 text-sm font-medium shadow-lg ${notice.ok ? "bg-slate-900 text-white" : "bg-red-600 text-white"}`}>
          {notice.text}
        </div>
      )}

      {/* Always-reachable scanner — for a customer who walks up with their QR. */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-gradient-to-t from-slate-50/0 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto px-4">
          <button onClick={() => setScanTarget(null)} className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 dark:bg-orange-600 py-3.5 text-white font-semibold shadow-lg">
            <ScanLine className="h-5 w-5" /> Scan a delivery QR
          </button>
        </div>
      </div>

      {scanTarget !== undefined && (
        <ScannerSheet token={token} target={scanTarget} onClose={() => setScanTarget(undefined)} onDelivered={load} />
      )}
    </div>
  )
}

export default function WaiterScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>}>
      <WaiterApp />
    </Suspense>
  )
}
