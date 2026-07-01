import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { isAdminEmail } from "@/lib/auth/admin"
import { getCurrentUser } from "@/lib/auth/session"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  return <DashboardShell isAdmin={isAdminEmail(user?.email)}>{children}</DashboardShell>
}
