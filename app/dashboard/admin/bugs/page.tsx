import Link from "next/link"
import { Bug } from "lucide-react"

import { AdminWorkspaceHeader } from "@/components/admin/admin-workspace-header"
import { TaskConsole } from "@/components/admin/task-console"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) return <Card className="glass-panel"><CardHeader><CardTitle>Admin login required</CardTitle></CardHeader><CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent></Card>

  return (
    <div className="grid gap-6">
      <AdminWorkspaceHeader
        icon={Bug}
        eyebrow="Product operations"
        title="Issue and feedback console"
        description="Triage product issues, internal follow-ups and user-reported problems from one admin-restricted queue."
        tone="amber"
      />
      <TaskConsole />
    </div>
  )
}
