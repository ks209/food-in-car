import { OrderManagement } from "@/components/order-management"
import { DashboardLayout } from "@/components/dashboard-layout"

export default function OrdersPage() {
  return (
    <DashboardLayout>
      <OrderManagement />
    </DashboardLayout>
  )
}