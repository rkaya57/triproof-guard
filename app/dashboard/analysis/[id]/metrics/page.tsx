import Link from "next/link"
import { BarChart3, Gauge, Target, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { buildAccuracyMetrics } from "@/lib/metrics/accuracy"

function metricValue(value: number | null) {
  return value === null ? "N/A" : `${value}%`
}

async function loadMetricsAnalysis(id: string, userId: string) {
  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId } },
      include: { project: true, teamReviews: true, feedbackEvents: true },
    })
    return { analysis, databaseRequired: false }
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return { analysis: null, databaseRequired: true }
  }
}

function StateCard({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <Card className="glass-panel mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{action}</CardContent>
    </Card>
  )
}

export default async function MetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user) {
    return <StateCard title="Login required" description="Metrics are available to authenticated dashboard users." action={<Link href="/login" className={buttonVariants()}>Login</Link>} />
  }

  const { analysis, databaseRequired } = await loadMetricsAnalysis(id, user.id)

  if (databaseRequired) {
    return <StateCard title="Database required" description="Accuracy metrics require the production database." action={<Link href={`/dashboard/analysis/${id}`} className={buttonVariants({ variant: "outline" })}>Back to analysis</Link>} />
  }

  if (!analysis) {
    return <StateCard title="Analysis not found" description="The requested metrics report could not be loaded." action={<Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>} />
  }

  const metrics = buildAccuracyMetrics({
    totalWallets: analysis.totalWallets,
    teamReviews: analysis.teamReviews,
    feedbackEvents: analysis.feedbackEvents,
  })

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.32),rgba(15,23,42,.86)_58%,rgba(91,33,182,.10))] p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border-primary/30 text-primary">Accuracy & calibration</Badge>
          <Badge variant="outline">{analysis.project.chain}</Badge>
        </div>
        <h2 className="text-gradient mt-4 text-2xl font-semibold sm:text-3xl">Benchmark and calibration report</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Metrics are calculated from saved team-review and feedback labels for this exact analysis.</p>
      </section>

      <div className="grid gap-5 md:grid-cols-4">
        <Card className="glass-panel"><CardHeader><Gauge className="text-primary" /><CardTitle>{metricValue(metrics.qualityMetrics.reviewedAccuracy)}</CardTitle><CardDescription>Reviewed accuracy</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><Target className="text-primary" /><CardTitle>{metricValue(metrics.qualityMetrics.rejectionPrecision)}</CardTitle><CardDescription>Rejection precision</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><TrendingUp className="text-primary" /><CardTitle>{metricValue(metrics.qualityMetrics.approvalPrecision)}</CardTitle><CardDescription>Approval precision</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><BarChart3 className="text-primary" /><CardTitle>{metrics.sampleSize.coverageRate}%</CardTitle><CardDescription>Review coverage</CardDescription></CardHeader></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="glass-panel">
          <CardHeader><CardTitle>Feedback counts</CardTitle><CardDescription>Saved review and feedback labels for this analysis.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {Object.entries(metrics.feedbackCounts).map(([key, value]) => <div key={key} className="flex justify-between rounded-xl border border-border p-3"><span>{key}</span><strong>{value}</strong></div>)}
          </CardContent>
        </Card>
        <Card className="glass-panel">
          <CardHeader><CardTitle>Calibration advice</CardTitle><CardDescription>Policy-level recommendations based on current feedback.</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            {metrics.calibrationAdvice.map((advice) => <div key={advice} className="rounded-xl border border-primary/20 bg-primary/5 p-3">{advice}</div>)}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel">
        <CardHeader><CardTitle>Risk score buckets</CardTitle><CardDescription>Feedback distribution by risk-score band.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {metrics.scoreBuckets.map((bucket) => (
            <div key={bucket.label} className="rounded-xl border border-border p-4">
              <div className="mb-2 text-lg font-semibold">{bucket.label}</div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Total: {bucket.total}</p>
                <p>False positive: {bucket.falsePositive}</p>
                <p>False negative: {bucket.falseNegative}</p>
                <p>Confirmed risk: {bucket.confirmedRisk}</p>
                <p>Trusted user: {bucket.trustedUser}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
