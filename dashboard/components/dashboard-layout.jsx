"use client"

import React from "react"
import { LayoutDashboard, ShoppingBag, Menu, LogOut, ScanLine, Users, Settings, BarChart3, Bell, BellOff } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import axios from "axios"
import { RestaurantProvider, useRestaurant } from "@/lib/restaurant-context"
import { OrdersProvider, useOrders } from "@/lib/orders-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { API } from "@/lib/api"

const navigation = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
  { name: "Delivery", href: "/dashboard/delivery", icon: ScanLine },
  { name: "Waiters", href: "/dashboard/waiters", icon: Users },
  { name: "Menu", href: "/dashboard/menu", icon: Menu },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

function Sidebar() {
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
    <div className="fixed inset-y-0 left-0 w-60 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 h-16 px-5 border-b border-slate-800">
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
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/[0.06] text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
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
      <div className="px-3 pb-5 border-t border-slate-800 pt-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
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

  return (
    <RestaurantProvider>
      <OrdersProvider>
        <div className="min-h-screen bg-slate-50">
          <Sidebar />

          <div className="ml-60">
            {/* Header */}
            <header className="bg-background border-b border-border h-16 flex items-center px-8 sticky top-0 z-10">
              <h1 className="text-base font-semibold text-foreground tracking-tight">{pageTitle}</h1>
              <div className="ml-auto flex items-center gap-1">
                <AlertToggle />
                <ThemeToggle />
              </div>
            </header>

            <main key={pathname} className="p-8 anim-fade-up">{children}</main>
          </div>
        </div>
      </OrdersProvider>
    </RestaurantProvider>
  )
}
