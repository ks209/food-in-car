import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { QRCodeSVG } from "qrcode.react"
import { Clock, CreditCard, ChefHat, Package, PartyPopper, XCircle, Bike, StickyNote, Phone, Frown } from "lucide-react"
import { orderApi } from "../api"
import { useRestaurantTheme } from "../lib/theme"
import { useAuth } from "../context/AuthContext"

// Short ascending 3-note chime — same melody the restaurant dashboard uses for
// its "new order" alert, so the sound reads as one system across the app.
function playReadyChime(ctx) {
  if (!ctx || ctx.state !== "running") return
  const notes = [660, 880, 1046]
  const noteDur = 0.16
  const gap = 0.06
  notes.forEach((freq, i) => {
    const start = ctx.currentTime + i * (noteDur + gap)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.4, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + noteDur + 0.02)
  })
}

// Tracker nodes (PAID is folded into "Placed")
const STEPS = [
  { key: "PLACED", label: "Placed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY", label: "Ready" },
  { key: "COMPLETED", label: "Completed" },
]

// Map any (incl. legacy) status to a tracker index
function stepIndex(status) {
  switch (status) {
    case "PENDING":
    case "PAID": return 0
    case "PROCESSING":
    case "PREPARING": return 1
    case "READY": return 2
    case "DELIVERED":
    case "COMPLETED": return 3
    default: return 0
  }
}

const STATUS_LABELS = {
  PENDING: "Order Placed",
  PAID: "Payment Confirmed",
  PROCESSING: "Being Prepared",
  PREPARING: "Being Prepared",
  READY: "Ready — Show Your QR",
  DELIVERED: "Completed!",
  COMPLETED: "Completed!",
  CANCELLED: "Cancelled",
}
const STATUS_DESC = {
  PENDING: "We've received your order and it's in the queue.",
  PAID: "Payment confirmed! We're about to start preparing.",
  PROCESSING: "The kitchen is working on your order.",
  PREPARING: "The kitchen is working on your order.",
  READY: "Show the QR code below to your delivery person to collect your food.",
  DELIVERED: "Delivered & completed. Enjoy your meal!",
  COMPLETED: "Delivered & completed. Enjoy your meal!",
  CANCELLED: "This order was cancelled.",
}
const STATUS_ICON = {
  PENDING: Clock, PAID: CreditCard, PROCESSING: ChefHat, PREPARING: ChefHat,
  READY: Package, DELIVERED: PartyPopper, COMPLETED: PartyPopper, CANCELLED: XCircle,
}

export default function OrderStatusPage() {
  const { orderId, restaurantId } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  useRestaurantTheme(restaurantId)
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse] = useState(false)
  const prevStatusRef = useRef(null)
  const audioCtxRef = useRef(null)

  // Unlocks the chime and asks for notification permission on the customer's first
  // tap — browsers require user activation for both, so this piggybacks on it
  // instead of showing a separate "enable notifications" prompt.
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioCtxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext
          if (Ctx) audioCtxRef.current = new Ctx()
        }
        if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume()
      } catch {}
      try {
        if (window.Notification && Notification.permission === "default") Notification.requestPermission()
      } catch {}
    }
    unlock()
    window.addEventListener("pointerdown", unlock, { once: true })
    return () => window.removeEventListener("pointerdown", unlock)
  }, [])

  const fetchOrder = () => {
    orderApi.get(orderId, searchParams.get("code"))
      .then(r => {
        const newStatus = r.data.status
        if (prevStatusRef.current && prevStatusRef.current !== newStatus) {
          setPulse(true)
          setTimeout(() => setPulse(false), 600)
          if (newStatus === "READY") {
            playReadyChime(audioCtxRef.current)
            // Only when the tab is actually backgrounded — the pulse + QR card
            // already cover the "customer is looking at the page" case.
            if (document.hidden && window.Notification?.permission === "granted") {
              const notif = new Notification("Your order is ready!", {
                body: `Order #${r.data.id} — show your QR to collect it.`,
                icon: "/carkhanaalogo.png",
                tag: `order-ready-${r.data.id}`,
              })
              notif.onclick = () => window.focus()
            }
          }
        }
        prevStatusRef.current = newStatus
        setOrder(r.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchOrder()
    const interval = setInterval(fetchOrder, 2000)
    return () => clearInterval(interval)
  }, [orderId])

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100dvh", flexDirection:"column", gap:"1rem" }}>
      <div className="spinner" />
      <p style={{ color:"var(--muted)", fontSize:"0.9rem" }}>Loading order…</p>
    </div>
  )

  if (!order) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100dvh", flexDirection:"column", gap:"0.75rem" }}>
      <Frown size={40} strokeWidth={1.5} color="var(--muted)" />
      <p style={{ color:"var(--error)", fontWeight:600 }}>Order not found</p>
      <Link to={`/restaurant/${restaurantId}`} className="btn btn-outline">Back to Menu</Link>
    </div>
  )

  const isCancelled = order.status === "CANCELLED"
  const isReady = order.status === "READY"
  const isDone = order.status === "COMPLETED" || order.status === "DELIVERED"
  const currentStepIdx = stepIndex(order.status)
  const customerName = order.guestName || order.user?.customerName
  // The order's own vehicle is the source of truth: absent = pickup.
  const vehicleNo = order.guestVehicle
  const isPickup = !vehicleNo

  const headerBg = isCancelled
    ? "linear-gradient(135deg, #E06A6A 0%, #C24C4C 100%)"
    : isDone
    ? "linear-gradient(135deg, #4CAF7D 0%, #3C9168 100%)"
    : isReady
    ? "linear-gradient(135deg, #56B6D8 0%, #3E96B8 100%)"
    : "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)"

  const fillPct = `${(currentStepIdx / (STEPS.length - 1)) * 100}%`

  return (
    <div className="page" style={{ background:"var(--bg)" }}>

      {/* Hero */}
      <div style={{ background: headerBg, padding:"1.5rem 1.25rem 2.5rem", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"-20px", right:"-20px", width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,0.08)" }} />
        <div style={{ position:"absolute", bottom:"-25px", left:"5px", width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }} />

        <Link to={`/restaurant/${restaurantId}`}
          style={{ color:"rgba(255,255,255,0.8)", fontSize:"0.85rem", display:"inline-flex", alignItems:"center", gap:"0.35rem", position:"relative" }}>
          ← Back to Menu
        </Link>

        <div style={{ textAlign:"center", marginTop:"1.25rem", position:"relative",
          transition:"transform 0.3s", transform: pulse ? "scale(1.06)" : "scale(1)" }}>
          <div style={{ width:72, height:72, borderRadius:"50%", margin:"0 auto 0.85rem",
            background:"rgba(255,255,255,0.14)", border:"1px solid rgba(255,255,255,0.18)",
            display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(4px)" }}>
            {(() => { const Icon = STATUS_ICON[order.status] || Clock; return <Icon size={34} strokeWidth={1.75} color="white" /> })()}
          </div>
          <h1 style={{ color:"white", fontSize:"1.75rem", fontWeight:800, marginBottom:"0.3rem" }}>
            {STATUS_LABELS[order.status]}
          </h1>
          <p style={{ color:"rgba(255,255,255,0.85)", fontSize:"0.9rem", maxWidth:320, margin:"0 auto" }}>
            {STATUS_DESC[order.status]}
          </p>
          <div style={{ marginTop:"0.75rem", display:"inline-flex", background:"rgba(0,0,0,0.2)",
            borderRadius:999, padding:"0.25rem 0.75rem" }}>
            <span style={{ color:"white", fontSize:"0.82rem", fontWeight:600 }}>Order #{order.id}</span>
          </div>
        </div>
      </div>

      <div style={{ padding:"1rem", display:"flex", flexDirection:"column", gap:"0.875rem", marginTop:"-1rem" }}>

        {/* Progress tracker */}
        {!isCancelled && (
          <div className="card" style={{ padding:"1.25rem" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", position:"relative" }}>
              <div style={{ position:"absolute", top:"19px", left:"calc(19px + 1rem)", right:"calc(19px + 1rem)",
                height:3, background:"var(--border)", zIndex:0 }} />
              <div style={{ position:"absolute", top:"19px", left:"calc(19px + 1rem)",
                width: `calc(${fillPct} - 2rem * ${currentStepIdx / (STEPS.length - 1)})`,
                maxWidth:"calc(100% - 38px - 2rem)",
                height:3, background:"var(--primary)", zIndex:1, transition:"width 0.5s ease" }} />

              {STEPS.map((step, idx) => {
                const done = idx <= currentStepIdx
                const active = idx === currentStepIdx
                return (
                  <div key={step.key} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"0.4rem", flex:1, position:"relative", zIndex:2 }}>
                    <div style={{
                      width:38, height:38, borderRadius:"50%",
                      background: done ? "var(--primary)" : "var(--surface-2)",
                      border: `3px solid ${done ? "var(--primary)" : "var(--border)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontWeight:700, fontSize:"0.85rem",
                      color: done ? "white" : "var(--muted)",
                      transition:"all 0.3s",
                      boxShadow: active ? "0 0 0 4px rgba(var(--primary-rgb),0.2)" : "none",
                    }}>
                      {done ? (active && !isDone ? "●" : "✓") : idx + 1}
                    </div>
                    <p style={{ fontSize:"0.7rem", fontWeight:600, color: done ? "var(--primary)" : "var(--muted)",
                      textAlign:"center", lineHeight:1.2, maxWidth:56 }}>
                      {step.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* QR handoff card — only when READY */}
        {isReady && order.deliveryCode && (
          <div className="card" style={{ padding:"1.5rem 1.25rem", textAlign:"center", border:"2px solid #0EA5E9", boxShadow:"0 8px 24px rgba(14,165,233,0.28)" }}>
            <p style={{ fontWeight:800, fontSize:"1rem", color:"#38bdf8", marginBottom:"0.25rem", display:"flex", alignItems:"center", justifyContent:"center", gap:"0.45rem" }}>
              <Bike size={18} strokeWidth={2} /> Your food is on the way
            </p>
            <p style={{ fontSize:"0.82rem", color:"var(--text-secondary)", marginBottom:"1rem" }}>
              Show this QR to your delivery person to collect your order.
            </p>
            <div style={{ display:"inline-flex", padding:"1rem", background:"white", borderRadius:16, boxShadow:"var(--shadow)" }}>
              <QRCodeSVG value={order.deliveryCode} size={176} level="M" includeMargin={false} />
            </div>
            <p style={{ marginTop:"1rem", fontSize:"0.72rem", color:"var(--muted)", letterSpacing:"0.05em" }}>
              Or share this code
            </p>
            <p style={{ fontWeight:800, fontSize:"1.35rem", letterSpacing:"0.25em", color:"var(--text)", marginTop:"0.1rem" }}>
              {order.deliveryCode}
            </p>
          </div>
        )}

        {/* Completed celebration */}
        {isDone && (
          <div className="card" style={{ padding:"1.25rem", textAlign:"center", background:"linear-gradient(135deg, rgba(52,211,153,0.14), rgba(52,211,153,0.04))", border:"1.5px solid rgba(52,211,153,0.3)" }}>
            <PartyPopper size={28} strokeWidth={1.75} color="var(--success)" style={{ margin:"0 auto 0.4rem" }} />
            <p style={{ fontWeight:700, color:"var(--success)" }}>Order delivered — enjoy your meal!</p>
          </div>
        )}

        {/* Customer + fulfilment (vehicle or pickup) */}
        {(
          <div className="card" style={{ padding:"1rem 1.25rem" }}>
            <div style={{ display:"flex", gap:"1.25rem" }}>
              {customerName && (
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:"0.72rem", fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"0.2rem" }}>Name</p>
                  <p style={{ fontWeight:700, fontSize:"0.95rem" }}>{customerName}</p>
                </div>
              )}
              <div style={{ flex:1 }}>
                <p style={{ fontSize:"0.72rem", fontWeight:600, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"0.2rem" }}>
                  {isPickup ? "Fulfilment" : "Vehicle"}
                </p>
                <p style={{ fontWeight:700, fontSize:"0.95rem", color:"var(--primary)", letterSpacing:"0.05em" }}>
                  {isPickup ? "Pickup" : vehicleNo}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order items */}
        <div className="card" style={{ padding:"1.25rem" }}>
          <h2 style={{ fontWeight:700, fontSize:"0.95rem", marginBottom:"0.875rem" }}>Items Ordered</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:"0.6rem" }}>
            {order.orderItems?.map(item => {
              const optionList = item.options?.map(o => o.name).join(", ")
              return (
                <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.5rem" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"baseline", gap:"0.4rem" }}>
                      <span style={{ fontWeight:600, fontSize:"0.9rem" }}>{item.name}</span>
                      <span style={{ color:"var(--muted)", fontSize:"0.8rem", flexShrink:0 }}>×{item.quantity}</span>
                    </div>
                    {optionList && (
                      <p style={{ fontSize:"0.73rem", color:"var(--muted)", marginTop:"0.1rem" }}>{optionList}</p>
                    )}
                  </div>
                  <span style={{ fontWeight:700, fontSize:"0.9rem", flexShrink:0 }}>₹{(item.finalPrice * item.quantity).toFixed(0)}</span>
                </div>
              )
            })}
          </div>
          <div style={{ borderTop:"1.5px solid var(--border)", marginTop:"1rem", paddingTop:"0.875rem",
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontWeight:700 }}>Total</span>
            <span style={{ fontWeight:800, fontSize:"1.1rem", color:"var(--success)" }}>₹{order.totalAmount.toFixed(0)}</span>
          </div>
          {order.deliveryInstructions && (
            <div style={{ marginTop:"0.75rem", padding:"0.6rem 0.75rem", background:"var(--bg)", borderRadius:8, fontSize:"0.82rem", color:"var(--text-secondary)", display:"flex", alignItems:"flex-start", gap:"0.45rem" }}>
              <StickyNote size={15} strokeWidth={2} style={{ flexShrink:0, marginTop:"0.1rem" }} /> {order.deliveryInstructions}
            </div>
          )}
        </div>

        {/* Need help — restaurant contact */}
        {order.restaurant?.phone && (
          <a href={`tel:${order.restaurant.phone}`} className="card"
            style={{ padding:"0.9rem 1.1rem", display:"flex", alignItems:"center", justifyContent:"space-between", textDecoration:"none" }}>
            <div>
              <p style={{ fontSize:"0.72rem", color:"var(--muted)", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em" }}>Need help with this order?</p>
              <p style={{ fontWeight:700, color:"var(--text)" }}>{order.restaurant.name}</p>
            </div>
            <span style={{ display:"inline-flex", alignItems:"center", gap:"0.4rem", color:"var(--primary)", fontWeight:700, fontSize:"0.9rem" }}>
              <Phone size={15} strokeWidth={2.2} /> {order.restaurant.phone}
            </span>
          </a>
        )}

        {!user && (
          <p style={{ textAlign:"center", color:"var(--muted)", fontSize:"0.75rem" }}>
            Lost this page?{" "}
            <Link to={`/restaurant/${restaurantId}/login`} style={{ color:"var(--primary)", fontWeight:700 }}>
              Sign in
            </Link>{" "}
            to find your orders anytime.
          </p>
        )}

        {!isDone && !isCancelled && (
          <p style={{ textAlign:"center", color:"var(--muted)", fontSize:"0.75rem" }}>
            Refreshes automatically every 2 seconds
          </p>
        )}

      </div>
    </div>
  )
}
