import { TriProofNetConsole } from "@/components/net/tri-proof-net-console"
import { requirePageUser } from "@/lib/auth/page"

export default async function Page() {
  const user = await requirePageUser("/dashboard/net")
  return <TriProofNetConsole currentUser={user} />
}
