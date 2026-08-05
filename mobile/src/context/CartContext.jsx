import { createContext, useContext, useEffect, useReducer, useState } from "react"

const CartContext = createContext(null)

const CART_KEY = "ck_cart"
// Deliberately short — long enough to survive a quick app-switch or an
// accidental tab close mid-browse, short enough that the backend's own
// checkout-time re-validation (menu availability/pricing) rarely has to
// correct anything by the time the customer actually pays.
const CART_TTL_MS = 15 * 60 * 1000

function cartReducer(state, action) {
  switch (action.type) {
    case "ADD": {
      const key = action.item.cartKey
      const existing = state.find(i => i.cartKey === key)
      if (existing) return state.map(i => i.cartKey === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...state, { ...action.item, quantity: 1 }]
    }
    case "REMOVE":
      return state.filter(i => i.cartKey !== action.cartKey)
    case "DECREMENT": {
      const item = state.find(i => i.cartKey === action.cartKey)
      if (!item || item.quantity <= 1) return state.filter(i => i.cartKey !== action.cartKey)
      return state.map(i => i.cartKey === action.cartKey ? { ...i, quantity: i.quantity - 1 } : i)
    }
    case "CLEAR":
      return []
    default:
      return state
  }
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(CART_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.items) || Date.now() - parsed.savedAt > CART_TTL_MS) {
      localStorage.removeItem(CART_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function CartProvider({ children }) {
  const persisted = loadPersisted()
  const [restaurantId, setRestaurantIdState] = useState(persisted?.restaurantId ?? null)
  const [cart, dispatch] = useReducer(cartReducer, persisted?.items ?? [])

  useEffect(() => {
    try {
      if (cart.length === 0) { localStorage.removeItem(CART_KEY); return }
      localStorage.setItem(CART_KEY, JSON.stringify({ restaurantId, items: cart, savedAt: Date.now() }))
    } catch { /* storage unavailable/full — cart just won't survive a refresh */ }
  }, [cart, restaurantId])

  const addItem = (item) => dispatch({ type: "ADD", item })
  const removeItem = (cartKey) => dispatch({ type: "REMOVE", cartKey })
  const decrementItem = (cartKey) => dispatch({ type: "DECREMENT", cartKey })
  const clearCart = () => dispatch({ type: "CLEAR" })

  // MenuPage calls this on mount with the restaurant it's showing. The cart
  // provider is a single global instance (mounted above the router), so
  // without this, browsing restaurant A then restaurant B — trivial now via
  // the homepage's restaurant list — would silently carry A's items into an
  // order submitted for B. A cart for a different restaurant is just stale
  // here; start fresh rather than let it ride along.
  const setActiveRestaurant = (id) => {
    setRestaurantIdState((prev) => {
      if (prev !== null && prev !== id) dispatch({ type: "CLEAR" })
      return id
    })
  }

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ cart, addItem, removeItem, decrementItem, clearCart, total, itemCount, setActiveRestaurant }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
