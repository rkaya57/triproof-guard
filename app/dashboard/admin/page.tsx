import Link from "next/link"
import { Activity, Bug, CreditCard, FileText, ShieldCheck, Wrench } from "lucide-react"

import { getAdminMetrics, getRecentAnalyses } from "@/lib/admin/health"
import { getAdminUser } from "@/lib/auth/admin"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function toneClass(tone: string) {
  if (tone === "good") return "text-green-300"
  if (tone === "warn") return "text-yellow-300"
  if (tone === "bad") return "text-red-300"
  return "text-primary"
}

function AccessDenied() {
  return (
    <Card className="glass-panel mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Admin access required</CardTitle>
        <CardDescription>This page is only available for Tri-Proof admin emails.</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Link href="/login" className={buttonVariants()}>Login</Link>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to Dashboard</Link>
      </CardContent>
    </Card>
  )
}

export default async function Page() {
  const admin = await getAdminUser()
  if (!admin) return <AccessDenied />

  const metrics = await getAdminMetrics()
  const analyses = await getRecentAnalyses()
  const health = metrics.find((metric) => metric.label === "System Health")

  return (
    <div className="flex flex-col gap-6">
      <div className="dashboard-hero relative overflow-hidden rounded-2xl p-6">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">Admin Command Center</Badge>
            <h2 className="text-gradient text-3xl font-semibold">Tri-Proof operasyon merkezi</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Admin: {admin.email}. Sistem sağlığı, analiz kuyruğu, ödeme akışı, blog ve issue takibi buradan yönetilir.
            </p>
          </div>
          <div className="rounded-2xl border border-primary/25 bg-primary/10 p-5 text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current status</p>
            <p className={`mt-1 text-3xl font-semibold ${toneClass(health?.tone ?? "neutral")}`}>{String(health?.value ?? "Unknown")}</p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="glass-panel premium-card hover-lift">
            <CardHeader className="pb-2">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className={toneClass(metric.tone)}>{metric.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          [ShieldCheck, "System Health", "Database, API keys, treasury wallets and worker queue.", "/dashboard/admin/health"],
          [Bug, "Issue Tracker", "Track bugs, broken flows, visual issues and Codex tasks.", "/dashboard/admin/bugs"],
          [Activity, "Analysis Ops", "Review recent wallet analyses and failed jobs.", "/dashboard/admin/analyses"],
          [CreditCard, "Payments", "USDC checkout configuration and manual payment notes.", "/dashboard/admin/payments"],
          [FileText, "Blog Studio", "Create SEO-ready Web3 security articles with cover images.", "/dashboard/admin/blog"],
          [Wrench, "Maintenance", "Run health checks and operational follow-up tasks.", "/dashboard/admin/health"],
        ].map(([Icon, title, text, href]) => (
          <Card key={title as string} className="glass-panel premium-card hover-lift">
            <CardHeader>
              <Icon className="text-primary" />
              <CardTitle>{title as string}</CardTitle>
              <CardDescription>{text as string}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={href as string} className={buttonVariants({ variant: "outline" })}>Open</Link>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>Recent analyses</CardTitle>
          <CardDescription>Latest analysis jobs from production.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr><th className="py-2">Project</th><th>Status</th><th>Chain</th><th>Wallets</th></tr>
            </thead>
            <tbody>
              {analyses.map((item) => {
                const row = item as Record<string, unknown>
                return (
                  <tr key={String(row.id)} className="border-t border-border">
                    <td className="py-2">{String(row.projectName ?? "-")}</td>
                    <td>{String(row.status ?? "-")}</td>
                    <td>{String(row.chain ?? "-")}</td>
                    <td>{String(row.totalWallets ?? 0)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
