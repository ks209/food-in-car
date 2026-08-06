import { useState, useRef, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { User, ReceiptText, LogOut } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { useRestaurantBase } from "../lib/restaurantPath"

// Floating account control for the menu hero. Logged out → "Sign in" pill.
// Logged in → avatar with a small dropdown (My Orders / Sign out).
export default function AccountMenu({ onLight = true }) {
  const { restaurantId } = useParams()
  const base = useRestaurantBase()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  if (!user) {
    return (
      <button
        onClick={() => navigate(`${base}/login`)}
        style={{
          display:"inline-flex", alignItems:"center", gap:"0.4rem",
          background:"rgba(8,10,15,0.55)", color:"#fff", borderRadius:999,
          padding:"0.5rem 0.95rem", fontWeight:700, fontSize:"0.82rem",
          border:"1px solid rgba(255,255,255,0.22)",
          backdropFilter:"blur(10px)", WebkitBackdropFilter:"blur(10px)",
          boxShadow:"0 4px 14px rgba(0,0,0,0.35)",
        }}>
        <User size={15} strokeWidth={2.2} /> Sign in
      </button>
    )
  }

  const initial = (user.customerName || "U")[0].toUpperCase()

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{
          width:40, height:40, borderRadius:"50%",
          background:"var(--primary)", color:"#06281d",
          fontWeight:800, fontSize:"0.98rem",
          display:"flex", alignItems:"center", justifyContent:"center",
          border:"2px solid rgba(255,255,255,0.85)",
          boxShadow:"0 4px 14px rgba(0,0,0,0.4)",
        }}>
        {initial}
      </button>

      {open && (
        <div style={{
          position:"absolute", right:0, top:"calc(100% + 0.5rem)", zIndex:120,
          background:"var(--card)", borderRadius:14, boxShadow:"var(--shadow-lg)",
          minWidth:190, overflow:"hidden", border:"1px solid var(--border)",
        }} className="anim-scale">
          <div style={{ padding:"0.85rem 1rem", borderBottom:"1px solid var(--border)" }}>
            <p style={{ fontWeight:700, fontSize:"0.9rem", color:"var(--text)" }}>{user.customerName}</p>
            {user.vehicles?.[0] && <p style={{ fontSize:"0.75rem", color:"var(--muted)", letterSpacing:"0.04em" }}>{user.vehicles[0]}</p>}
          </div>
          <button onClick={() => { setOpen(false); navigate(`${base}/orders`) }}
            style={menuItemStyle}><ReceiptText size={15} strokeWidth={2} /> My Orders</button>
          <button onClick={async () => { setOpen(false); await logout() }}
            style={{ ...menuItemStyle, color:"var(--error)", borderTop:"1px solid var(--border)" }}><LogOut size={15} strokeWidth={2} /> Sign out</button>
        </div>
      )}
    </div>
  )
}

const menuItemStyle = {
  display:"flex", alignItems:"center", gap:"0.5rem", width:"100%", textAlign:"left",
  padding:"0.75rem 1rem", fontSize:"0.88rem", fontWeight:600,
  color:"var(--text)", background:"transparent",
}
