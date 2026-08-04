"use client"

import React, { useEffect, useState } from "react"
import { LayoutDashboard, ShoppingBag, Menu, LogOut, ScanLine, Users, Contact, Settings, BarChart3, Bell, BellOff, PanelLeft, X, Paintbrush, ChefHat, Receipt, WifiOff, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import axios from "axios"
import { RestaurantProvider, useRestaurant } from "@/lib/restaurant-context"
import { OrdersProvider, useOrders } from "@/lib/orders-context"
import { BillingProvider, useBilling } from "@/lib/billing-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { API } from "@/lib/api"

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
  { name: "Billing", href: "/dashboard/billing", icon: Receipt },
  { name: "Kitchen", href: "/dashboard/kitchen", icon: ChefHat },
  { name: "Delivery", href: "/dashboard/delivery", icon: ScanLine },
  { name: "Waiters", href: "/dashboard/waiters", icon: Users },
  { name: "Customers", href: "/dashboard/customers", icon: Contact },
  { name: "Menu", href: "/dashboard/menu", icon: Menu },
  { name: "Customize", href: "/dashboard/customize", icon: Paintbrush },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

function Sidebar({ open, onClose }) {
  const router = useRouter()
  const pathname = usePathname()
  const restaurant = useRestaurant()

  const displayName = restaurant?.name || restaurant?.username || "Dashboard"
  const initial = displayName[0].toUpperCase()

  const handleLogout = async () => {
    await axios.post(`${API}/api/restaurant/logout`, {}, { withCredentials: true }).catch(() => {})
    router.push("/")
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <div className={`fixed inset-y-0 left-0 w-60 sidebar-gradient border-r sidebar-border flex flex-col z-50 transition-transform duration-200 ${
        open ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0`}>
        {/* Brand */}
        <div className="flex items-center gap-3 h-16 px-5 border-b sidebar-border">
          {restaurant?.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt={displayName}
              className="h-8 w-8 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0 brand-bg"
            >
              {initial}
            </div>
          )}
          <span className="text-white font-semibold text-sm truncate">{displayName}</span>
          <button onClick={onClose} className="ml-auto sidebar-link lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/[0.06] text-white"
                    : "sidebar-link hover:bg-white/[0.04]"
                }`}
              >
                {isActive && <span className="absolute -left-3 top-1.5 bottom-1.5 w-0.5 rounded-r-full brand-bg" />}
                <item.icon className={`h-4 w-4 flex-shrink-0 ${isActive ? "brand-text" : ""}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-5 border-t sidebar-border pt-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium sidebar-link hover:bg-white/[0.04] transition-colors"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  )
}

function BillingSyncBadge() {
  const billing = useBilling()
  if (!billing) return null
  const { online, pendingCount, failedCount } = billing
  if (online && pendingCount === 0 && failedCount === 0) return null
  return (
    <Link
      href="/dashboard/billing"
      className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
        !online ? "bg-slate-100 text-slate-500" : failedCount > 0 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
      }`}
      title={!online ? "You're offline — bills are being saved locally" : "Bills waiting to sync"}
    >
      {!online ? <WifiOff className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {!online ? "Offline" : failedCount > 0 ? `${failedCount} sync failed` : `${pendingCount} pending sync`}
    </Link>
  )
}

function AlertToggle() {
  const { muted, toggleMuted } = useOrders()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleMuted}
      className="h-8 text-slate-500 hover:text-slate-800"
      title={muted ? "New-order sound is off" : "New-order sound is on"}
    >
      {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
    </Button>
  )
}

export function DashboardLayout({ children }) {
  const pathname = usePathname()
  const pageTitle = navigation.find((n) => n.href === pathname)?.name ?? "Dashboard"
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close the mobile drawer whenever the route changes
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  return (
    <RestaurantProvider>
      <OrdersProvider>
        <BillingProvider>
          <div className="min-h-screen bg-slate-50">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="lg:ml-60">
              {/* Header */}
              <header className="bg-background border-b border-border h-16 flex items-center px-4 sm:px-8 sticky top-0 z-30 gap-2">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="text-slate-500 hover:text-slate-800 lg:hidden flex-shrink-0"
                  aria-label="Open menu"
                >
                  <PanelLeft className="h-5 w-5" />
                </button>
                <h1 className="text-base font-semibold text-foreground tracking-tight truncate">{pageTitle}</h1>
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <BillingSyncBadge />
                  <AlertToggle />
                  <ThemeToggle />
                </div>
              </header>

              <main key={pathname} className="p-4 sm:p-8 anim-fade-up overflow-x-hidden">{children}</main>
            </div>
          </div>
        </BillingProvider>
      </OrdersProvider>
    </RestaurantProvider>
  )
}
