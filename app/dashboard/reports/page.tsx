import Link from "next/link"
import { BarChart3, FileDown, FileText, Plus, ShieldCheck } from "lucide-react"

import { requirePageUser } from "@/lib/auth/page"
import { db } from "@/lib/db/prisma"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

function reportStatusClass(status: string) {
  if (status === "completed") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "failed") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
}

function statusLabel(status: string) {
  return status ? `${status.slice(0, 1).toUpperCase()}${status.slice(1)}` : "Pending"
}

export default async function ReportsPage() {
  const user = await requirePageUser("/dashboard/reports")
  let analyses: Array<{
    id: string
    status: string
    totalWallets: number
    approvedCount: number
    manualReviewCount: number
    rejectedCount: number
    createdAt: Date
    completedAt: Date | null
    project: { name: string; campaignType: string; chain: string }
  }> = []
  let loadError = false

  try {
    analyses = await db.analysis.findMany({
      where: { project: { userId: user.id } },
      select: {
        id: true,
        status: true,
        totalWallets: true,
        approvedCount: true,
        manualReviewCount: true,
        rejectedCount: true,
        createdAt: true,
        completedAt: true,
        project: { select: { name: true, campaignType: true, chain: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    loadError = true
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up flex flex-col gap-5 rounded-2xl p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div>
          <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary"><FileText className="size-3.5" /> Analysis archive</Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">Reports and exports</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">Open completed campaign decisions, inspect in-progress work, and download the PDF report when it is ready.</p>
        </div>
        <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary hover-lift`}><Plus data-icon="inline-start" /> New Analysis</Link>
      </section>

      {loadError && (
        <Card className="glass-panel border-yellow-400/30 bg-yellow-400/5">
          <CardHeader><CardTitle>Reports are temporarily unavailable</CardTitle><CardDescription>The workspace database could not be reached. Your existing analyses are unchanged; refresh once the connection is restored.</CardDescription></CardHeader>
        </Card>
      )}

      {!loadError && analyses.length === 0 && (
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle>No reports yet</CardTitle><CardDescription>Run your first wallet analysis to create a decision report, exportable CSV lists, and a PDF summary.</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/dashboard/new-analysis" className={`${buttonVariants()} glow-primary`}><Plus data-icon="inline-start" /> Start analysis</Link>
            <Link href="/dashboard/demo" className={buttonVariants({ variant: "outline" })}><BarChart3 data-icon="inline-start" /> View demo report</Link>
          </CardContent>
        </Card>
      )}

      {!loadError && analyses.map((analysis) => {
        const status = String(analysis.status)
        const canExport = status === "completed"
        return (
          <Card key={analysis.id} className="glass-panel premium-card hover-lift">
            <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <CardTitle>{analysis.project.name}</CardTitle>
                  <Badge variant="outline" className={reportStatusClass(status)}>{statusLabel(status)}</Badge>
                </div>
                <CardDescription className="mt-2">{analysis.project.campaignType} on {analysis.project.chain} · Created {analysis.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</CardDescription>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs sm:min-w-[360px]">
                {[
                  ["Wallets", analysis.totalWallets],
                  ["Approved", analysis.approvedCount],
                  ["Review", analysis.manualReviewCount],
                  ["Rejected", analysis.rejectedCount],
                ].map(([label, value]) => <div key={label as string} className="rounded-lg border border-border bg-background/45 p-2"><p className="text-muted-foreground">{label as string}</p><p className="mt-1 text-base font-semibold">{Number(value).toLocaleString("en-US")}</p></div>)}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Link href={`/dashboard/analysis/${analysis.id}`} className={buttonVariants()}><ShieldCheck data-icon="inline-start" /> Open report</Link>
              <Link href={`/dashboard/analysis/${analysis.id}/metrics`} className={buttonVariants({ variant: "outline" })}><BarChart3 data-icon="inline-start" /> Metrics</Link>
              {canExport ? (
                <a href={`/api/analysis/${analysis.id}/export?type=pdf`} className={buttonVariants({ variant: "outline" })}><FileDown data-icon="inline-start" /> Download PDF</a>
              ) : (
                <span className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground">PDF available after completion</span>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
