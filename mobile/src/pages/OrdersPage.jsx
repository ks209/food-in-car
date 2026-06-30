import { useEffect, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Lock, ReceiptText } from "lucide-react"
import { orderApi } from "../api"
import { useAuth } from "../context/AuthContext"
import { useRestaurantTheme } from "../lib/theme"

const PILL = {
  PENDING:    { bg:"rgba(245,158,11,0.16)", color:"#fbbf24", label:"Placed" },
  PAID:       { bg:"rgba(59,130,246,0.16)", color:"#60a5fa", label:"Paid" },
  PROCESSING: { bg:"rgba(249,115,22,0.16)", color:"#fb923c", label:"Preparing" },
  PREPARING:  { bg:"rgba(249,115,22,0.16)", color:"#fb923c", label:"Preparing" },
  READY:      { bg:"rgba(14,165,233,0.16)", color:"#38bdf8", label:"Ready" },
  DELIVERED:  { bg:"rgba(34,197,94,0.16)", color:"#4ade80", label:"Completed" },
  COMPLETED:  { bg:"rgba(34,197,94,0.16)", color:"#4ade80", label:"Completed" },
  CANCELLED:  { bg:"rgba(239,68,68,0.16)", color:"#f87171", label:"Cancelled" },
}

function StatusPill({ status }) {
  const p = PILL[status] || { bg:"var(--bg)", color:"var(--muted)", label:status }
  return (
    <span style={{ background:p.bg, color:p.color, borderRadius:999, padding:"0.2rem 0.6rem",
      fontSize:"0.72rem", fontWeight:700, letterSpacing:"0.02em" }}>{p.label}</span>
  )
}

export default function OrdersPage() {
  const { restaurantId } = useParams()
  useRestaurantTheme(restaurantId)
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }
    orderApi.mine()
      .then(r => setOrders(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [user, authLoading])

  return (
    <div className="page" style={{ background:"var(--bg)" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg, var(--primary), var(--primary-dark))", padding:"1.5rem 1.25rem 1.75rem", color:"white" }}>
        <Link to={`/restaurant/${restaurantId}`} style={{ color:"rgba(255,255,255,0.85)", fontSize:"0.85rem" }}>← Back to Menu</Link>
        <h1 style={{ fontSize:"1.6rem", fontWeight:800, marginTop:"0.6rem" }}>My Orders</h1>
        {user && <p style={{ opacity:0.85, fontSize:"0.88rem" }}>Welcome back, {user.customerName}</p>}
      </div>

      <div style={{ padding:"1rem", display:"flex", flexDirection:"column", gap:"0.75rem" }}>
        {authLoading || loading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:"3rem" }}><div className="spinner" /></div>
        ) : !user ? (
          <div className="card" style={{ padding:"2.5rem 1.5rem", textAlign:"center" }}>
            <Lock size={36} strokeWidth={1.5} color="var(--muted)" style={{ margin:"0 auto 0.75rem" }} />
            <p style={{ fontWeight:700, marginBottom:"0.35rem" }}>Sign in to see your orders</p>
            <p style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:"1.25rem" }}>
              Your order history and payments live behind your account.
            </p>
            <button className="btn btn-primary" style={{ borderRadius:12 }}
              onClick={() => navigate(`/restaurant/${restaurantId}/login`)}>
              Sign in or Register
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="card" style={{ padding:"2.5rem 1.5rem", textAlign:"center" }}>
            <ReceiptText size={36} strokeWidth={1.5} color="var(--muted)" style={{ margin:"0 auto 0.75rem" }} />
            <p style={{ fontWeight:700, marginBottom:"0.35rem" }}>No orders yet</p>
            <p style={{ color:"var(--muted)", fontSize:"0.85rem", marginBottom:"1.25rem" }}>Your past orders will show up here.</p>
            <Link to={`/restaurant/${restaurantId}`} className="btn btn-primary" style={{ borderRadius:12 }}>Browse Menu</Link>
          </div>
        ) : (
          orders.map((o, i) => (
            <Link key={o.id} to={`/restaurant/${restaurantId}/order/${o.id}`}
              className="card anim-fade-up" style={{ padding:"1rem 1.1rem", display:"block", animationDelay: `${Math.min(i, 8) * 45}ms` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.5rem" }}>
                <span style={{ fontWeight:700, fontSize:"0.92rem" }}>Order #{o.id}</span>
                <StatusPill status={o.status} />
              </div>
              <p style={{ fontSize:"0.8rem", color:"var(--muted)", marginBottom:"0.5rem",
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {o.orderItems?.map(i => `${i.quantity}× ${i.name}`).join(", ") || "—"}
              </p>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:"0.75rem", color:"var(--muted)" }}>
                  {new Date(o.createdAt).toLocaleString([], { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}
                </span>
                <span style={{ fontWeight:800, color:"var(--success)" }}>₹{o.totalAmount.toFixed(0)}</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
