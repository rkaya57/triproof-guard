import Link from "next/link"

import { ScamGuardIntelConsole } from "@/components/admin/scamguard-intel-console"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-2xl border-red-400/30">
      <CardHeader>
        <CardTitle className="text-red-200">Admin access required</CardTitle>
        <CardDescription className="text-slate-300">ScamGuard intelligence is only visible to approved Tri-Proof admin emails.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Link href="/login" className={buttonVariants()}>Login</Link>
        <Link href="/dashboard/admin" className={buttonVariants({ variant: "outline" })}>Back to Admin</Link>
      </CardContent>
    </Card>
  )
}

export default async function ScamGuardAdminPage() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  return (
    <div className="grid gap-7">
      <section className="dashboard-hero rounded-3xl border border-primary/30 bg-primary/5 p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-primary">ScamGuard intelligence</p>
        <h1 className="text-gradient mt-3 text-3xl font-semibold sm:text-5xl">Domain, spender and contract control desk</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Add reviewed trusted, suspicious, or known-bad intelligence. These entries feed URL scans, EVM spender checks, token scans, and transaction source scoring.
        </p>
      </section>
      <ScamGuardIntelConsole />
    </div>
  )
}
