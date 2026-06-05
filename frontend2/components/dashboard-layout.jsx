"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, ShoppingBag, Menu, FolderOpen, LogOut, ChefHat } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"



export function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = () => {
    router.push("/")
  }

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Orders", href: "/dashboard/orders", icon: ShoppingBag },
    { name: "Menu Items", href: "/dashboard/menu", icon: Menu },
    { name: "Categories", href: "/dashboard/categories", icon: FolderOpen },
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg border-r border-gray-200">
        <div className="flex items-center justify-center h-16 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <ChefHat className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-700">RestaurantHub</span>
          </div>
        </div>

        <nav className="mt-8 px-4">
          <ul className="space-y-2">
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? "bg-blue-50 text-blue-700 border-r-2 border-blue-600"
                        : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full justify-start text-gray-700 border-gray-300 hover:bg-gray-50 bg-transparent"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-700">Restaurant Management Hub</h1>
            <p className="text-gray-600 mt-1">Effortlessly manage your restaurant's operations</p>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
