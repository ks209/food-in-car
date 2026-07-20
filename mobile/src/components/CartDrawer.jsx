import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Car, ShoppingCart, X } from "lucide-react"
import { useCart } from "../context/CartContext"
import { useAuth } from "../context/AuthContext"
import { getDeviceKey } from "../lib/device"
import api, { orderApi } from "../api"

export default function CartDrawer({ open, onClose, restaurant, restaurantId }) {
  const { cart, addItem, decrementItem, clearCart, total, itemCount } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState("")
  const [vehicle, setVehicle] = useState("")
  const [phone, setPhone] = useState("")
  const [orderType, setOrderType] = useState("car") // "car" (deliver to vehicle) | "pickup"
  const [instructions, setInstructions] = useState("")
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState("")

  // Prefill from the signed-in account (still editable for guest tweaks)
  useEffect(() => {
    if (!user) return
    setName(n => n || user.customerName || "")
    setVehicle(v => v || user.vehicles?.[0] || "")
    setPhone(p => p || user.phoneNumber || "")
  }, [user])

  const isPhonePe = restaurant?.paymentGateway?.toUpperCase() === "PHONEPE"
  const phoneValid = /^\d{10}$/.test(phone.trim())
  // Pickup is only an option if the restaurant enabled it; otherwise vehicle is mandatory.
  const pickupAllowed = !!restaurant?.pickupEnabled
  const needsVehicle = !pickupAllowed || orderType === "car"
  const canOrder = name.trim() && phoneValid && cart.length > 0 && (!needsVehicle || vehicle.trim())

  const orderPayload = () => ({
    restaurantId: parseInt(restaurantId),
    items: cart.map(i => ({
      id: i.id, name: i.name, price: i.price, quantity: i.quantity,
      selectedOptions: i.selectedOptions || [],
    })),
    totalAmount: total,
    deliveryInstructions: instructions,
    guestName: name.trim(),
    // Vehicle only for in-car delivery; empty means "pickup" (backend treats absent as pickup)
    guestVehicle: needsVehicle ? vehicle.trim().toUpperCase() : "",
    mobileNumber: phone.trim(),
    deviceKey: getDeviceKey(),
  })

  // ── COD flow ─────────────────────────────────────────────────────────────────
  const handleCOD = async () => {
    if (!canOrder) return
    setPlacing(true); setError("")
    try {
      const res = await orderApi.create(orderPayload())
      clearCart(); onClose()
      navigate(`/restaurant/${restaurantId}/order/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't place order. Try again.")
    } finally { setPlacing(false) }
  }

  // ── PhonePe flow ─────────────────────────────────────────────────────────────
  const handlePhonePe = async () => {
    if (!canOrder) return
    setPlacing(true); setError("")
    try {
      const res = await api.post("/api/payment/initiate", orderPayload())
      clearCart(); onClose()
      if (res.data.redirectUrl) {
        // Real PhonePe: leave the React app and go to PhonePe payment page
        window.location.href = res.data.redirectUrl
      } else {
        // Dev mode or no credentials — order is placed, go straight to status page
        navigate(`/restaurant/${restaurantId}/order/${res.data.orderId}`)
      }
    } catch (err) {
      setError(err.response?.data?.error || "Payment initiation failed. Try again.")
      setPlacing(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose}
        style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:200, backdropFilter:"blur(3px)" }} />

      {/* Sheet */}
      <div className="anim-fade-up cart-sheet" style={{
        position:"fixed", bottom:0, left:0, right:0, margin:"0 auto",
        width:"min(100%, 480px)", background:"var(--card)",
        borderRadius:"24px 24px 0 0", zIndex:201,
        border:"1px solid var(--border)", borderBottom:"none",
        maxHeight:"90dvh", display:"flex", flexDirection:"column",
        boxShadow:"0 -12px 40px rgba(0,0,0,0.5)",
      }}>
        {/* Handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"0.85rem 0 0.4rem" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:"var(--border)" }} />
        </div>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0.5rem 1.25rem 1rem" }}>
          <h2 style={{ fontWeight:800, fontSize:"1.2rem" }}>Your Order</h2>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:"50%", background:"var(--bg)",
            display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-secondary)" }}>
            <X size={16} strokeWidth={2.25} />
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY:"auto", flex:1, padding:"0 1.25rem" }}>

          {/* Cart Items */}
          {cart.length === 0 ? (
            <div style={{ textAlign:"center", padding:"3rem 0", color:"var(--muted)", display:"flex", flexDirection:"column", alignItems:"center", gap:"0.5rem" }}>
              <ShoppingCart size={38} strokeWidth={1.5} />
              <p style={{ fontWeight:600 }}>Your cart is empty</p>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:"0.6rem", marginBottom:"1.25rem" }}>
              {cart.map(item => (
                <div key={item.cartKey} style={{
                  display:"flex", alignItems:"center", gap:"0.75rem",
                  padding:"0.75rem", background:"var(--bg)", borderRadius:12,
                }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:600, fontSize:"0.92rem", color:"var(--text)" }}>{item.name}</p>
                    {item.optionLabel && (
                      <p style={{ fontSize:"0.74rem", color:"var(--muted)", marginTop:"0.15rem" }}>
                        {item.optionLabel}
                      </p>
                    )}
                    <p style={{ fontWeight:700, color:"var(--success)", fontSize:"0.88rem", marginTop:"0.2rem" }}>
                      ₹{(item.price * item.quantity).toFixed(0)}
                    </p>
                  </div>
                  <div className="qty-ctrl">
                    <button className="qty-btn" onClick={() => decrementItem(item.cartKey)}>−</button>
                    <span className="qty-num">{item.quantity}</span>
                    <button className="qty-btn" onClick={() => addItem(item)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <>
              {/* Guest details */}
              <div style={{ marginBottom:"1rem", padding:"1rem", background:"var(--bg)", borderRadius:14, border:"1px solid var(--border)" }}>
                <p style={{ fontWeight:700, fontSize:"0.85rem", color:"var(--primary)", marginBottom:"0.75rem", display:"flex", alignItems:"center", gap:"0.45rem" }}>
                  <Car size={15} strokeWidth={2.2} /> Your Details
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:"0.65rem" }}>
                  {/* Order type: only shown if the restaurant allows pickup */}
                  {pickupAllowed && (
                    <div className="field">
                      <label>How would you like it?</label>
                      <div style={{ display:"flex", gap:"0.5rem" }}>
                        {[
                          { key:"car", label:"Deliver in Car" },
                          { key:"pickup", label:"Pickup" },
                        ].map(opt => {
                          const active = orderType === opt.key
                          return (
                            <button key={opt.key} type="button" onClick={() => setOrderType(opt.key)}
                              style={{
                                flex:1, padding:"0.7rem", borderRadius:12, fontWeight:700, fontSize:"0.88rem",
                                border:`1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                                background: active ? "var(--primary-light)" : "var(--surface)",
                                color: active ? "var(--primary)" : "var(--text-secondary)",
                                transition:"all 0.12s",
                              }}>
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div className="field">
                    <label>Your Name</label>
                    <input className="input" placeholder="e.g. Rahul Sharma" value={name}
                      onChange={e => setName(e.target.value)} style={{ background:"var(--surface-2)" }} />
                  </div>
                  <div className="field">
                    <label>Mobile Number</label>
                    <input className="input" type="tel" inputMode="numeric" placeholder="10-digit mobile number" value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} maxLength={10} />
                    {phone.trim() && !phoneValid && (
                      <span style={{ fontSize:"0.72rem", color:"var(--error)" }}>Enter a valid 10-digit number</span>
                    )}
                  </div>
                  {needsVehicle && (
                    <div className="field">
                      <label>Vehicle Number</label>
                      <input className="input" placeholder="e.g. DL 4C AB 1234" value={vehicle}
                        onChange={e => setVehicle(e.target.value)}
                        style={{ background:"var(--surface-2)", textTransform:"uppercase", letterSpacing:"0.05em" }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div className="field" style={{ marginBottom:"1.25rem" }}>
                <label>Special Instructions <span style={{ color:"var(--muted)", fontWeight:400 }}>(optional)</span></label>
                <textarea className="input" rows={2} value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="No spice, extra sauce, call on arrival…"
                  style={{ resize:"none" }} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div style={{ padding:"1rem 1.25rem 1.5rem", borderTop:"1px solid var(--border)" }}>
            {error && (
              <div style={{ background:"rgba(248,113,113,0.15)", color:"var(--error)", padding:"0.6rem 0.75rem",
                borderRadius:10, fontSize:"0.85rem", marginBottom:"0.75rem", border:"1px solid rgba(248,113,113,0.25)" }}>
                {error}
              </div>
            )}

            {/* Total */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.875rem" }}>
              <div>
                <p style={{ fontSize:"0.8rem", color:"var(--muted)", fontWeight:500 }}>{itemCount} items</p>
                <p style={{ fontWeight:800, fontSize:"1.25rem", color:"var(--text)" }}>₹{total.toFixed(0)}</p>
              </div>

              {isPhonePe ? (
                <button onClick={handlePhonePe} disabled={placing || !canOrder}
                  style={{
                    display:"flex", alignItems:"center", gap:"0.5rem",
                    background: canOrder ? "#5f259f" : "var(--border)",
                    color:"white", border:"none", borderRadius:14,
                    padding:"0.85rem 1.25rem", fontWeight:700, fontSize:"0.9rem",
                    cursor: canOrder ? "pointer" : "not-allowed",
                    transition:"all 0.15s", opacity: placing ? 0.7 : 1,
                  }}>
                  {placing ? (
                    "Redirecting…"
                  ) : (
                    <>
                      <PhonePeIcon />
                      Pay with PhonePe
                    </>
                  )}
                </button>
              ) : (
                <button onClick={handleCOD} disabled={placing || !canOrder}
                  className="btn btn-primary"
                  style={{ borderRadius:14, padding:"0.85rem 1.75rem", fontSize:"1rem",
                    opacity: (!canOrder && !placing) ? 0.5 : 1 }}>
                  {placing ? "Placing…" : "Place Order →"}
                </button>
              )}
            </div>

            {!canOrder && cart.length > 0 && (
              <p style={{ textAlign:"center", fontSize:"0.78rem", color:"var(--muted)" }}>
                {needsVehicle
                  ? "Enter your name, mobile number and vehicle to continue"
                  : "Enter your name and mobile number to continue"}
              </p>
            )}

            {isPhonePe && canOrder && (
              <p style={{ textAlign:"center", fontSize:"0.75rem", color:"var(--muted)" }}>
                Secured by PhonePe · You'll be redirected to pay
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function PhonePeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="5" fill="#5f259f"/>
      <path d="M16.5 6H13L8 13h3.5l-1 5 7-8h-3.5L16.5 6z" fill="white"/>
    </svg>
  )
}
