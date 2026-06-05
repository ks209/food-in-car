import { CategoryManagement } from "@/components/category-management.jsx"
import { DashboardLayout } from "@/components/dashboard-layout.jsx"

export default function CategoriesPage() {
  return (
    <DashboardLayout>
      <CategoryManagement />
    </DashboardLayout>
  )
}