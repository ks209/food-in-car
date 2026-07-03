import { useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { CartProvider } from "./context/CartContext"
import MenuPage from "./pages/MenuPage"
import LoginPage from "./pages/LoginPage"
import OrderStatusPage from "./pages/OrderStatusPage"
import OrdersPage from "./pages/OrdersPage"
import { applyTheme, DEFAULT_HEX } from "./lib/theme"

function Landing() {
  useEffect(() => { applyTheme(DEFAULT_HEX) }, [])
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, marginBottom: "1.25rem", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--primary)", boxShadow: "0 8px 24px rgba(var(--primary-rgb),0.4)" }}>
        <img src="/carkhanaalogo.png" alt="Carkhanaa" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "0.5rem" }}>Carkhanaa</h1>
      <p style={{ color: "var(--muted)", marginBottom: "2rem" }}>Order delicious food right from your car</p>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Visit <code style={{ background: "var(--surface-2)", color: "var(--text-secondary)", padding: "0.2rem 0.4rem", borderRadius: 4 }}>/restaurant/:id</code> to browse a restaurant menu
      </p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/restaurant/:restaurantId" element={<MenuPage />} />
            <Route path="/restaurant/:restaurantId/login" element={<LoginPage />} />
            <Route path="/restaurant/:restaurantId/orders" element={<OrdersPage />} />
            <Route path="/restaurant/:restaurantId/order/:orderId" element={<OrderStatusPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
