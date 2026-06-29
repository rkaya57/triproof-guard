import { requireAdminUser } from "@/lib/auth/admin"
import { BugConsole } from "@/components/admin/bug-console"

export default async function Page() {
  await requireAdminUser()
  return <BugConsole />
}
