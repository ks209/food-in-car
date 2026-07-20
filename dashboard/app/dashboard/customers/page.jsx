import { CustomerManagement } from "@/components/customer-management"
import { DashboardLayout } from "@/components/dashboard-layout"

export default function CustomersPage() {
  return (
    <DashboardLayout>
      <CustomerManagement />
    </DashboardLayout>
  )
}
