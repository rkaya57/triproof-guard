import { TriProofNetConsole } from "@/components/net/tri-proof-net-console"
import { getAdminUser } from "@/lib/auth/admin"
import { redirect } from "next/navigation"

export default async function Page() {
  const user = await getAdminUser()
  if (!user) redirect("/dashboard")
  return <TriProofNetConsole currentUser={user} />
}
