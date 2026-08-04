import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Package } from "lucide-react"
import { orderApi } from "../api"
import { getActiveOrder, clearActiveOrder } from "../lib/activeOrder"

const DONE_STATUSES = ["COMPLETED", "CANCELLED", "NOT_FULFILLED"]

// Floating reminder, opposite AccountMenu (top-left vs top-right) — if this
// device placed an order that isn't finished yet, it's easy to lose track of
// after backing out to browse the menu again. Tapping it jumps straight back
// to that order's status page, regardless of which restaurant's menu is
// currently open.
export default function ActiveOrderBanner() {
  const navigate = useNavigate()
  const [active, setActive] = useState(null)

  useEffect(() => {
    const pointer = getActiveOrder()
    if (!pointer) return
    orderApi.get(pointer.orderId, pointer.code)
      .then((r) => {
        if (DONE_STATUSES.includes(r.data.status)) {
          clearActiveOrder()
          return
        }
        setActive(pointer)
      })
      .catch(() => clearActiveOrder()) // gone/invalid — stop reminding about it
  }, [])

  if (!active) return null

  return (
    <button
      onClick={() => navigate(`/restaurant/${active.restaurantId}/order/${active.orderId}?code=${active.code}`)}
      style={{
        position: "absolute", left: "1rem", top: "0.9rem",
        display: "inline-flex", alignItems: "center", gap: "0.4rem",
        background: "rgba(8,10,15,0.55)", color: "#fff", borderRadius: 999,
        padding: "0.5rem 0.95rem", fontWeight: 700, fontSize: "0.82rem",
        border: "1px solid rgba(255,255,255,0.22)",
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
      }}>
      <Package size={15} strokeWidth={2.2} /> Order in progress
    </button>
  )
}
