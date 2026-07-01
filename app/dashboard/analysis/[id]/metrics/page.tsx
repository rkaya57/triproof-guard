import Link from "next/link"
import { ArrowLeft, BarChart3, Gauge, Target, TrendingUp } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { buildAccuracyMetrics } from "@/lib/metrics/accuracy"

function metricValue(value: number | null) {
  return value === null ? "N/A" : `${value}%`
}

export default async function MetricsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl">
          <CardHeader><CardTitle>Login required</CardTitle><CardDescription>Metrics are available to authenticated dashboard users.</CardDescription></CardHeader>
          <CardContent><Link href="/login" className={buttonVariants()}>Login</Link></CardContent>
        </Card>
      </main>
    )
  }

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      include: { project: true, teamReviews: true, feedbackEvents: true },
    })

    if (!analysis) {
      return (
        <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
          <Card className="glass-panel mx-auto max-w-xl">
            <CardHeader><CardTitle>Analysis not found</CardTitle><CardDescription>The requested metrics report could not be loaded.</CardDescription></CardHeader>
            <CardContent><Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link></CardContent>
          </Card>
        </main>
      )
    }

    const metrics = buildAccuracyMetrics({
      totalWallets: analysis.totalWallets,
      teamReviews: analysis.teamReviews,
      feedbackEvents: analysis.feedbackEvents,
    })

    return (
      <main className="premium-page min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div>
            <Link href={`/dashboard/analysis/${id}`} className={`${buttonVariants({ variant: "outline" })} mb-4`}><ArrowLeft data-icon="inline-start" /> Back to analysis</Link>
            <div className="mb-3 flex flex-wrap gap-2"><Badge variant="secondary">V2.2 Accuracy Metrics</Badge><Badge variant="outline">{analysis.project.chain}</Badge></div>
            <h1 className="text-gradient text-3xl font-semibold">Benchmark & calibration report</h1>
            <p className="mt-2 text-muted-foreground">Metrics are calculated from saved team review and feedback labels.</p>
          </div>

          <div className="grid gap-5 md:grid-cols-4">
            <Card className="glass-panel"><CardHeader><Gauge className="text-primary" /><CardTitle>{metricValue(metrics.qualityMetrics.reviewedAccuracy)}</CardTitle><CardDescription>Reviewed accuracy</CardDescription></CardHeader></Card>
            <Card className="glass-panel"><CardHeader><Target className="text-primary" /><CardTitle>{metricValue(metrics.qualityMetrics.rejectionPrecision)}</CardTitle><CardDescription>Rejection precision</CardDescription></CardHeader></Card>
            <Card className="glass-panel"><CardHeader><TrendingUp className="text-primary" /><CardTitle>{metricValue(metrics.qualityMetrics.approvalPrecision)}</CardTitle><CardDescription>Approval precision</CardDescription></CardHeader></Card>
            <Card className="glass-panel"><CardHeader><BarChart3 className="text-primary" /><CardTitle>{metrics.sampleSize.coverageRate}%</CardTitle><CardDescription>Review coverage</CardDescription></CardHeader></Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="glass-panel">
              <CardHeader><CardTitle>Feedback counts</CardTitle><CardDescription>Labels collected from V2.0 feedback loop.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {Object.entries(metrics.feedbackCounts).map(([key, value]) => <div key={key} className="flex justify-between rounded-lg border border-border p-3"><span>{key}</span><strong>{value}</strong></div>)}
              </CardContent>
            </Card>
            <Card className="glass-panel">
              <CardHeader><CardTitle>Calibration advice</CardTitle><CardDescription>Policy-level recommendations based on current feedback.</CardDescription></CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                {metrics.calibrationAdvice.map((advice) => <div key={advice} className="rounded-lg border border-primary/20 bg-primary/5 p-3">{advice}</div>)}
              </CardContent>
            </Card>
          </div>

          <Card className="glass-panel">
            <CardHeader><CardTitle>Risk score buckets</CardTitle><CardDescription>Feedback distribution by risk score band.</CardDescription></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              {metrics.scoreBuckets.map((bucket) => (
                <div key={bucket.label} className="rounded-lg border border-border p-4">
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
      </main>
    )
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl"><CardHeader><CardTitle>Database required</CardTitle><CardDescription>Accuracy metrics require the production database.</CardDescription></CardHeader><CardContent><Link href={`/dashboard/analysis/${id}`} className={buttonVariants({ variant: "outline" })}>Back to analysis</Link></CardContent></Card>
      </main>
    )
  }
}
