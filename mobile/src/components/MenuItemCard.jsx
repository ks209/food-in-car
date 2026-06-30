import { useState } from "react"
import { Plus, Minus, Star } from "lucide-react"
import { useCart } from "../context/CartContext"

function VegMark({ isVeg }) {
  if (isVeg === null || isVeg === undefined) return null
  const c = isVeg ? "var(--veg)" : "var(--nonveg)"
  return (
    <div className="item-veg" style={{ border: `1.5px solid ${c}` }} title={isVeg ? "Vegetarian" : "Non-Vegetarian"}>
      <span style={{ background: c }} />
    </div>
  )
}

export default function MenuItemCard({ item }) {
  const { addItem, cart, decrementItem } = useCart()
  const [showOptions, setShowOptions] = useState(false)
  const [selections, setSelections] = useState({})

  const hasOptions = item.optionGroups?.length > 0
  const cartEntry = cart.find(i => i.id === item.id && !i.optionLabel)
  const cartQty = cartEntry?.quantity || 0

  const toggleOption = (group, option) => {
    setSelections(prev => {
      const cur = prev[group.id] || []
      if (group.multiple) {
        const exists = cur.find(o => o.id === option.id)
        return { ...prev, [group.id]: exists ? cur.filter(o => o.id !== option.id) : [...cur, option] }
      }
      return { ...prev, [group.id]: [option] }
    })
  }

  const selectedDelta = Object.values(selections).flat().reduce((s, o) => s + (o.priceDelta || 0), 0)
  const finalPrice = item.price + selectedDelta
  const hasRequiredMissing = item.optionGroups?.some(g => g.required && !(selections[g.id]?.length > 0))

  const doAdd = () => {
    const optionLabel = Object.values(selections).flat().map(o => o.name).join(", ")
    const cartKey = `${item.id}-${optionLabel || "base"}`
    addItem({ cartKey, id: item.id, name: item.name, price: finalPrice, optionLabel: optionLabel || null, selectedOptions: Object.values(selections).flat() })
    setShowOptions(false)
    setSelections({})
  }

  const handleAddClick = () => {
    if (hasOptions) { setShowOptions(true); return }
    addItem({ cartKey: `${item.id}-base`, id: item.id, name: item.name, price: item.price, optionLabel: null, selectedOptions: [] })
  }

  return (
    <div className="item-card">
      {/* Name + veg + rating */}
      <div className="item-head">
        <VegMark isVeg={item.isVeg} />
        <h3 style={{ flex: 1, minWidth: 0, fontSize: "1.04rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>
          {item.name}
        </h3>
        {item.rating != null && (
          <span className="item-rating" style={{ marginTop: "2px" }}>
            <Star size={12} fill="var(--star)" strokeWidth={0} /> {item.rating}
          </span>
        )}
      </div>

      {item.description && (
        <p style={{
          fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.5,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {item.description}
        </p>
      )}

      {/* Price + action */}
      <div className="item-foot">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "1.18rem", color: "var(--text)" }}>
              ₹{item.price.toFixed(0)}
            </span>
            {selectedDelta > 0 && showOptions && (
              <span style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: 700 }}>+₹{selectedDelta}</span>
            )}
          </div>
          {hasOptions && (
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600 }}>Customisable</span>
          )}
        </div>

        {!hasOptions && cartQty > 0 ? (
          <div className="qty-stepper anim-pop">
            <button onClick={() => decrementItem(`${item.id}-base`)} aria-label="Remove one"><Minus size={16} strokeWidth={3} /></button>
            <span>{cartQty}</span>
            <button onClick={handleAddClick} aria-label="Add one"><Plus size={16} strokeWidth={3} /></button>
          </div>
        ) : (
          <button className="add-btn" onClick={() => hasOptions ? setShowOptions(s => !s) : handleAddClick()}>
            {showOptions ? "CLOSE" : "ADD"}
            {!showOptions && <Plus size={14} strokeWidth={3} />}
          </button>
        )}
      </div>

      {/* ── Options panel ── */}
      {showOptions && hasOptions && (
        <div className="anim-fade-up" style={{ marginTop: "0.55rem", paddingTop: "0.9rem", borderTop: "1px solid var(--border)" }}>
          {item.optionGroups.map(group => (
            <div key={group.id} style={{ marginBottom: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.55rem" }}>
                <p style={{ fontWeight: 700, fontSize: "0.85rem" }}>{group.title}</p>
                <span style={{
                  fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.04em",
                  color: group.required ? "var(--error)" : "var(--muted)",
                  background: group.required ? "rgba(248,113,113,0.16)" : "var(--surface)",
                  padding: "0.18rem 0.5rem", borderRadius: 999,
                }}>
                  {group.required ? "REQUIRED" : group.multiple ? "PICK ANY" : "PICK ONE"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {group.options.map(opt => {
                  const selected = (selections[group.id] || []).some(o => o.id === opt.id)
                  return (
                    <button key={opt.id} onClick={() => toggleOption(group, opt)}
                      style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "0.65rem 0.8rem", borderRadius: 12, textAlign: "left",
                        border: `1.5px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                        background: selected ? "var(--primary-light)" : "var(--surface)",
                        transition: "all 0.12s",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: group.multiple ? 5 : "50%",
                          border: `2px solid ${selected ? "var(--primary)" : "var(--border-strong)"}`,
                          background: selected ? "var(--primary)" : "transparent",
                          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {selected && <span style={{ color: "#06281d", fontSize: "0.55rem", lineHeight: 1, fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: "0.88rem", fontWeight: 500 }}>{opt.name}</span>
                      </div>
                      {opt.priceDelta !== 0 && (
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: opt.priceDelta > 0 ? "var(--success)" : "var(--error)" }}>
                          {opt.priceDelta > 0 ? `+₹${opt.priceDelta}` : `-₹${Math.abs(opt.priceDelta)}`}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button className="btn btn-outline" style={{ flex: 1, borderRadius: 12, padding: "0.7rem" }}
              onClick={() => { setShowOptions(false); setSelections({}) }}>
              Cancel
            </button>
            <button onClick={doAdd} disabled={hasRequiredMissing}
              className="btn btn-primary" style={{ flex: 2, borderRadius: 12, padding: "0.7rem" }}>
              Add · ₹{finalPrice.toFixed(0)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
