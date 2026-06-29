import Link from "next/link"

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
        <CardDescription>
          This page is only available for Tri-Proof admin emails. Log in with an admin account.
        </CardDescription>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="dashboard-hero rounded-2xl p-6">
        <Badge variant="secondary" className="mb-4 w-fit border-primary/30 text-primary">
          Admin Console
        </Badge>
        <h2 className="text-gradient text-3xl font-semibold">Tri-Proof operasyon merkezi</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Admin: {admin.email}. Sistem sağlığı, analiz kuyruğu ve hata takibi buradan izlenir.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="glass-panel premium-card">
            <CardHeader className="pb-2">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className={toneClass(metric.tone)}>{metric.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Health", "/dashboard/admin/health"],
          ["Bugs", "/dashboard/admin/bugs"],
          ["Analyses", "/dashboard/admin/analyses"],
          ["Blog", "/dashboard/admin/blog"],
        ].map(([label, href]) => (
          <Link key={label} href={href} className={`${buttonVariants({ variant: "outline" })} justify-center`}>
            {label}
          </Link>
        ))}
      </section>

      <Card className="glass-panel">
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
