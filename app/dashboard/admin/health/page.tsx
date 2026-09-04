import Link from "next/link"
import { CheckCircle2, HeartPulse, TriangleAlert } from "lucide-react"

import { AdminWorkspaceHeader } from "@/components/admin/admin-workspace-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminHealthChecks } from "@/lib/admin/health"
import { getAdminUser } from "@/lib/auth/admin"

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) {
    return (
      <Card className="glass-panel mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Admin login required</CardTitle>
          <CardDescription>Log in with a Tri-Proof admin email.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants()}>Login</Link>
        </CardContent>
      </Card>
    )
  }

  const checks = await getAdminHealthChecks()
  const healthyCount = checks.filter((check) => check.ok).length
  const issueCount = checks.length - healthyCount

  return (
    <div className="grid gap-6">
      <AdminWorkspaceHeader
        icon={HeartPulse}
        eyebrow="System health"
        title="Runtime configuration overview"
        description="Quick operator view of database, API keys, treasury wallets and worker configuration. Use Diagnostics for deeper production-readiness checks."
        tone={issueCount ? "amber" : "emerald"}
        meta={
          <>
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/12 bg-emerald-300/[0.025] px-3 py-2 text-xs text-emerald-200"><CheckCircle2 className="size-3.5" /> {healthyCount} healthy</span>
            {issueCount ? <span className="inline-flex items-center gap-2 rounded-xl border border-amber-300/12 bg-amber-300/[0.025] px-3 py-2 text-xs text-amber-200"><TriangleAlert className="size-3.5" /> {issueCount} need attention</span> : null}
          </>
        }
        actions={<Link href="/dashboard/admin/diagnostics" className={buttonVariants({ variant: "outline", size: "sm" })}>Open diagnostics</Link>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <Card key={check.name} className="glass-panel premium-card">
            <CardHeader>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]">
                  {check.ok ? <CheckCircle2 className="size-4 text-emerald-300" /> : <TriangleAlert className="size-4 text-amber-300" />}
                </span>
                <Badge variant="outline" className={check.ok ? "border-emerald-300/18 bg-emerald-300/[0.035] text-emerald-200" : "border-amber-300/18 bg-amber-300/[0.035] text-amber-200"}>{check.ok ? "Healthy" : "Needs action"}</Badge>
              </div>
              <CardTitle className="text-base">{check.name}</CardTitle>
              <CardDescription className="leading-6">{check.detail}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </div>
  )
}
