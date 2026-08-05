import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./context/AuthContext"
import { CartProvider } from "./context/CartContext"
import HomePage from "./pages/HomePage"
import MenuPage from "./pages/MenuPage"
import LoginPage from "./pages/LoginPage"
import OrderStatusPage from "./pages/OrderStatusPage"
import OrdersPage from "./pages/OrdersPage"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
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
