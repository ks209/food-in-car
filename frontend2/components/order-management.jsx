"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, Clock, CheckCircle, XCircle, Eye } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"


export function OrderManagement() {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedOrder, setSelectedOrder] = useState(null)

  const [orders, setOrders] = useState([
    {
      id: "#001",
      customer: "John Doe",
      phone: "+1 234-567-8901",
      items: [
        { name: "Classic Burger", quantity: 1, price: 15.99 },
        { name: "French Fries", quantity: 1, price: 6.99 },
        { name: "Coca Cola", quantity: 1, price: 2.99 },
      ],
      total: 25.97,
      status: "preparing",
      orderTime: "10:30 AM",
      tableNumber: "Table 5",
      notes: "No onions on burger",
    },
    {
      id: "#002",
      customer: "Jane Smith",
      phone: "+1 234-567-8902",
      items: [{ name: "Pizza Margherita", quantity: 1, price: 18.5 }],
      total: 18.5,
      status: "ready",
      orderTime: "10:25 AM",
      tableNumber: "Table 2",
    },
    {
      id: "#003",
      customer: "Mike Johnson",
      phone: "+1 234-567-8903",
      items: [
        { name: "Pasta Carbonara", quantity: 1, price: 16.99 },
        { name: "Caesar Salad", quantity: 1, price: 8.99 },
        { name: "Garlic Bread", quantity: 2, price: 4.99 },
      ],
      total: 35.96,
      status: "delivered",
      orderTime: "10:15 AM",
      notes: "Extra parmesan cheese",
    },
    {
      id: "#004",
      customer: "Sarah Wilson",
      phone: "+1 234-567-8904",
      items: [
        { name: "Grilled Chicken Sandwich", quantity: 1, price: 12.99 },
        { name: "Iced Tea", quantity: 1, price: 2.99 },
      ],
      total: 15.98,
      status: "pending",
      orderTime: "10:35 AM",
      tableNumber: "Table 8",
    },
    {
      id: "#005",
      customer: "David Brown",
      phone: "+1 234-567-8905",
      items: [
        { name: "Fish & Chips", quantity: 1, price: 19.99 },
        { name: "Coleslaw", quantity: 1, price: 4.99 },
      ],
      total: 24.98,
      status: "preparing",
      orderTime: "10:40 AM",
      tableNumber: "Table 12",
    },
  ])

  const getStatusColor = (status) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
      case "preparing":
        return "bg-orange-100 text-orange-800 hover:bg-orange-200"
      case "ready":
        return "bg-green-100 text-green-800 hover:bg-green-200"
      case "delivered":
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
      case "cancelled":
        return "bg-red-100 text-red-800 hover:bg-red-200"
      default:
        return "bg-blue-100 text-blue-800 hover:bg-blue-200"
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" />
      case "preparing":
        return <Clock className="h-4 w-4" />
      case "ready":
        return <CheckCircle className="h-4 w-4" />
      case "delivered":
        return <CheckCircle className="h-4 w-4" />
      case "cancelled":
        return <XCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const updateOrderStatus = (orderId, newStatus) => {
    setOrders(orders.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)))
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusCounts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-700">Order Management</h1>
        <p className="text-gray-600 mt-2">Track and manage all restaurant orders in real-time</p>
      </div>

      {/* Status Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Object.entries(statusCounts).map(([status, count]) => (
          <Card
            key={status}
            className={`cursor-pointer transition-all hover:shadow-md ${
              statusFilter === status ? "ring-2 ring-blue-500 bg-blue-50" : ""
            }`}
            onClick={() => setStatusFilter(status)}
          >
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{count}</div>
              <div className="text-sm text-gray-600 capitalize">{status}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by customer name or order ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48 border-gray-300 focus:border-blue-500 focus:ring-blue-500">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders List */}
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-gray-700">Orders ({filteredOrders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-4">
                    <div>
                      <h3 className="font-bold text-gray-900">{order.id}</h3>
                      <p className="text-sm text-gray-600">{order.customer}</p>
                      {order.tableNumber && <p className="text-sm text-gray-500">{order.tableNumber}</p>}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <p className="font-bold text-gray-900">${order.total.toFixed(2)}</p>
                      <p className="text-sm text-gray-600">{order.orderTime}</p>
                    </div>
                    <Badge className={`${getStatusColor(order.status)} border-0`}>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(order.status)}
                        <span className="capitalize">{order.status}</span>
                      </div>
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">
                      {order.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
                    </p>
                    {order.notes && <p className="text-sm text-gray-500 mt-1">Note: {order.notes}</p>}
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrder(order)}
                          className="border-gray-300 hover:bg-gray-50"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Order Details - {selectedOrder?.id}</DialogTitle>
                        </DialogHeader>
                        {selectedOrder && (
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium text-gray-900">Customer Information</h4>
                              <p className="text-sm text-gray-600">{selectedOrder.customer}</p>
                              <p className="text-sm text-gray-600">{selectedOrder.phone}</p>
                              {selectedOrder.tableNumber && (
                                <p className="text-sm text-gray-600">{selectedOrder.tableNumber}</p>
                              )}
                            </div>

                            <div>
                              <h4 className="font-medium text-gray-900">Order Items</h4>
                              <div className="space-y-2">
                                {selectedOrder.items.map((item, index) => (
                                  <div key={index} className="flex justify-between text-sm">
                                    <span>
                                      {item.quantity}x {item.name}
                                    </span>
                                    <span>${(item.quantity * item.price).toFixed(2)}</span>
                                  </div>
                                ))}
                                <div className="border-t pt-2 flex justify-between font-medium">
                                  <span>Total</span>
                                  <span>${selectedOrder.total.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>

                            {selectedOrder.notes && (
                              <div>
                                <h4 className="font-medium text-gray-900">Special Notes</h4>
                                <p className="text-sm text-gray-600">{selectedOrder.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>

                    {order.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => updateOrderStatus(order.id, "preparing")}
                        className="bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        Start Preparing
                      </Button>
                    )}

                    {order.status === "preparing" && (
                      <Button
                        size="sm"
                        onClick={() => updateOrderStatus(order.id, "ready")}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Mark Ready
                      </Button>
                    )}

                    {order.status === "ready" && (
                      <Button
                        size="sm"
                        onClick={() => updateOrderStatus(order.id, "delivered")}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Mark Delivered
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
