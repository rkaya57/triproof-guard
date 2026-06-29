import { requireAdminUser } from "@/lib/auth/admin"
import { TaskConsole } from "@/components/admin/task-console"

export default async function Page() {
  await requireAdminUser()
  return <TaskConsole />
}
