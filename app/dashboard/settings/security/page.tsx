import { redirect } from "next/navigation"

import { AccountSecurity } from "@/components/auth/account-security"
import { getCurrentUser } from "@/lib/auth/session"

export default async function Page() {
  const user = await getCurrentUser()
  if (!user) redirect("/login?next=%2Fdashboard%2Fsettings%2Fsecurity")
  return <AccountSecurity />
}
