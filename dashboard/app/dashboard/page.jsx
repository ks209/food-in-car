import { DashboardOverview } from "@/components/dashboard-overview"
import { DashboardLayout } from "@/components/dashboard-layout"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export default async function DashboardPage() {

   const cookieStore = await cookies();
   console.log(cookieStore);
  const token = cookieStore.get('token')?.value;

  if (!token) {
    redirect("/")
  }
  return (
    <DashboardLayout>
      <DashboardOverview />
    </DashboardLayout>
  )
}
