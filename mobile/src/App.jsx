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

            {/* Original numeric URLs. Kept working alongside the vanity ones so
                already-printed QR codes, bookmarks and shared order links don't
                break. */}
            <Route path="/restaurant/:restaurantId" element={<MenuPage />} />
            <Route path="/restaurant/:restaurantId/login" element={<LoginPage />} />
            <Route path="/restaurant/:restaurantId/orders" element={<OrdersPage />} />
            <Route path="/restaurant/:restaurantId/order/:orderId" element={<OrderStatusPage />} />

            {/* Vanity URLs — /spice-garden resolves to exactly the same pages.
                The param still holds "id or slug"; the API accepts either.
                These live at the root, so any unmatched single-segment path
                falls through to MenuPage, which sends a 404 home. Routes above
                are more specific and still win (React Router ranks by
                specificity, not declaration order). */}
            <Route path="/:restaurantId" element={<MenuPage />} />
            <Route path="/:restaurantId/login" element={<LoginPage />} />
            <Route path="/:restaurantId/orders" element={<OrdersPage />} />
            <Route path="/:restaurantId/order/:orderId" element={<OrderStatusPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
