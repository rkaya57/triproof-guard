import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { isAdminEmail } from "@/lib/auth/admin"
import { requirePageUser } from "@/lib/auth/page"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser("/dashboard")
  return <DashboardShell isAdmin={isAdminEmail(user.email)}>{children}</DashboardShell>
}
