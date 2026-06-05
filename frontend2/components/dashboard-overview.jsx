"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag, DollarSign, Clock, ChefHat } from "lucide-react"

export function DashboardOverview() {
  const stats = [
    {
      title: "Total Orders Today",
      value: "24",
      change: "+12%",
      icon: ShoppingBag,
      color: "text-blue-600",
    },
    {
      title: "Revenue Today",
      value: "$1,240",
      change: "+8%",
      icon: DollarSign,
      color: "text-green-600",
    },
    {
      title: "Pending Orders",
      value: "6",
      change: "-2",
      icon: Clock,
      color: "text-orange-600",
    },
    {
      title: "Menu Items",
      value: "48",
      change: "+3",
      icon: ChefHat,
      color: "text-purple-600",
    },
  ]

  const recentOrders = [
    {
      id: "#001",
      customer: "John Doe",
      items: "Burger, Fries",
      total: "$24.99",
      status: "Preparing",
      time: "10:30 AM",
    },
    {
      id: "#002",
      customer: "Jane Smith",
      items: "Pizza Margherita",
      total: "$18.50",
      status: "Ready",
      time: "10:25 AM",
    },
    {
      id: "#003",
      customer: "Mike Johnson",
      items: "Pasta, Salad",
      total: "$32.00",
      status: "Delivered",
      time: "10:15 AM",
    },
    {
      id: "#004",
      customer: "Sarah Wilson",
      items: "Sandwich, Drink",
      total: "$15.75",
      status: "Preparing",
      time: "10:10 AM",
    },
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case "Preparing":
        return "bg-orange-100 text-orange-800"
      case "Ready":
        return "bg-green-100 text-green-800"
      case "Delivered":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-blue-100 text-blue-800"
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{stat.change} from yesterday</p>
                </div>
                <div className={`p-3 rounded-full bg-gray-50 ${stat.color}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-700">Recent Orders</CardTitle>
          <p className="text-gray-600">Stay on top of your service</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Order ID</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Customer</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Items</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Total</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-700">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-medium text-gray-900">{order.id}</td>
                    <td className="py-3 px-4 text-gray-700">{order.customer}</td>
                    <td className="py-3 px-4 text-gray-700">{order.items}</td>
                    <td className="py-3 px-4 font-medium text-gray-900">{order.total}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{order.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
