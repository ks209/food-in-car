import { createContext, useContext, useReducer } from "react"

const CartContext = createContext(null)

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

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, [])

  const addItem = (item) => dispatch({ type: "ADD", item })
  const removeItem = (cartKey) => dispatch({ type: "REMOVE", cartKey })
  const decrementItem = (cartKey) => dispatch({ type: "DECREMENT", cartKey })
  const clearCart = () => dispatch({ type: "CLEAR" })

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ cart, addItem, removeItem, decrementItem, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
