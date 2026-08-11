import Link from "next/link"

import { StakingPilotConsole } from "@/components/admin/staking-pilot-console"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-xl border-rose-400/30">
      <CardHeader>
        <CardTitle className="text-rose-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">The TRI Devnet staking pilot is restricted to approved Tri-Proof admins.</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>
      </CardContent>
    </Card>
  )
}

export default async function StakingPilotPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />
  return <StakingPilotConsole />
}
