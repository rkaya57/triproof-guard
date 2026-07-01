import Link from "next/link"
import { AlertTriangle, CheckCircle2, Database, ExternalLink, HeartPulse, ServerCog, ShieldAlert, Webhook, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getAdminUser } from "@/lib/auth/admin"
import { buildProductionHealthReport, type HealthCheck, type HealthStatus } from "@/lib/health/production"

function statusClass(status: HealthStatus) {
  if (status === "ok") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "warning") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  return "border-red-400/30 bg-red-400/10 text-red-200"
}

function statusIcon(status: HealthStatus) {
  if (status === "ok") return <CheckCircle2 className="size-5 text-green-300" />
  if (status === "warning") return <AlertTriangle className="size-5 text-yellow-300" />
  return <XCircle className="size-5 text-red-300" />
}

function checkIcon(key: string) {
  if (key === "database" || key === "schema") return <Database className="text-primary" />
  if (key === "queue") return <ServerCog className="text-primary" />
  if (key === "webhooks") return <Webhook className="text-primary" />
  if (key === "provider") return <HeartPulse className="text-primary" />
  return <ShieldAlert className="text-primary" />
}

function CheckCard({ check }: { check: HealthCheck }) {
  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <div className="mb-3 flex items-center justify-between gap-3">
          {checkIcon(check.key)}
          <Badge variant="outline" className={statusClass(check.status)}>{check.status.toUpperCase()}</Badge>
        </div>
        <CardTitle className="text-white">{check.label}</CardTitle>
        <CardDescription className="text-slate-300">{check.message}</CardDescription>
      </CardHeader>
      {check.details && (
        <CardContent>
          <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-black/30 p-3 text-xs text-slate-300">
            {JSON.stringify(check.details, null, 2)}
          </pre>
        </CardContent>
      )}
    </Card>
  )
}

export default async function DiagnosticsPage() {
  const admin = await getAdminUser()

  if (!admin) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl border-red-400/30">
          <CardHeader>
            <CardTitle className="text-red-200">Admin access required</CardTitle>
            <CardDescription className="text-slate-300">
              Production diagnostics are only available to approved Tri-Proof admin email accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const report = await buildProductionHealthReport()

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <section className="security-grid border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">V2.5 Production Hardening</Badge>
            <Badge variant="outline" className={statusClass(report.status)}>{report.status.toUpperCase()}</Badge>
          </div>
          <h1 className="text-gradient max-w-4xl text-4xl font-semibold sm:text-6xl">Admin diagnostics</h1>
          <p className="mt-5 max-w-2xl text-slate-300">
            Check database readiness, migrations, providers, analysis queue, webhooks and critical environment variables before customers hit broken flows.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/api/health" className={`${buttonVariants()} glow-primary`}>Open health API <ExternalLink data-icon="inline-end" /></Link>
            <Link href="/dashboard/admin/diagnostics" className={`${buttonVariants({ variant: "outline" })} text-white`}>Dashboard admin panel</Link>
            <Link href="/docs/queue" className={`${buttonVariants({ variant: "outline" })} text-white`}>Queue docs</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-10 sm:px-8 md:grid-cols-2 xl:grid-cols-3">
        {report.checks.map((check) => (
          <CheckCard key={check.key} check={check} />
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              {statusIcon(report.status)} Recommended actions
            </CardTitle>
            <CardDescription className="text-slate-300">Operational checklist for the current deployment.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            {report.actions.map((action) => (
              <div key={action} className="rounded-lg border border-primary/20 bg-primary/5 p-3">{action}</div>
            ))}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}
