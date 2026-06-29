import Link from "next/link"

import { getAdminUser } from "@/lib/auth/admin"
import { TaskConsole } from "@/components/admin/task-console"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) return <Card className="glass-panel"><CardHeader><CardTitle>Admin login required</CardTitle></CardHeader><CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent></Card>
  return <TaskConsole />
}
