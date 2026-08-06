import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  ShieldCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  CampaignBenchmarkComparison,
  CampaignBenchmarkReport,
  CampaignBenchmarkUnit,
} from "@/lib/campaign-benchmark/types"

function formatMetric(value: number | null, unit: CampaignBenchmarkUnit | "count") {
  if (value === null) return "Not available"
  if (unit === "percent") return `${value.toFixed(value % 1 ? 2 : 0)}%`
  if (unit === "seconds") {
    if (value < 60) return `${Math.round(value)} sec`
    const minutes = Math.floor(value / 60)
    const seconds = Math.round(value % 60)
    return seconds ? `${minutes}m ${seconds}s` : `${minutes} min`
  }
  if (unit === "score") return `${value.toFixed(2)}/100`
  if (unit === "per_1000") return `${value.toFixed(2)} / 1k`
  return new Intl.NumberFormat().format(value)
}

function deltaLabel(item: CampaignBenchmarkComparison) {
  if (item.workspaceMedian === null || item.deltaFromMedian === null) {
    return "No workspace median"
  }
  const sign = item.deltaFromMedian > 0 ? "+" : ""
  const suffix = item.unit === "percent" ? " pp" : ""
  return `${sign}${item.deltaFromMedian.toFixed(2)}${suffix} vs median`
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <Card className="glass-panel premium-card">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export function CampaignBenchmarkDashboard({
  report,
}: {
  report: CampaignBenchmarkReport
}) {
  const summary = report.summary
  const partial =
    report.coverage.workspaceCampaignsTruncated || report.coverage.riskMemoryPartial

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
              <Activity className="size-3.5" /> Campaign Benchmark & Outcome Metrics v1
            </Badge>
            <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">
              {report.campaignName}
            </h2>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Read-only operational measurements for the latest analysis, human review,
              explainability, policy recommendations and exact cross-campaign context.
            </p>
          </div>
          <Link
            href={`/dashboard/campaigns/${report.campaignId}`}
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowLeft data-icon="inline-start" /> Campaign details
          </Link>
        </div>
      </section>

      <Card className="glass-panel premium-card border-amber-400/25">
        <CardContent className="flex gap-3 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
          <p>
            Workspace medians describe operational context only. They are not proof of fraud-detection
            accuracy, customer impact or causal improvement. Reward exposure remains unconfigured.
          </p>
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Wallets analyzed"
          value={formatMetric(summary.totalWallets, "count")}
          description="Participants included in the latest stored analysis."
        />
        <SummaryCard
          label="Decision distribution"
          value={`${summary.approvalRate}% / ${summary.manualReviewRate}% / ${summary.rejectionRate}%`}
          description="Approved / Gray Zone / Not Eligible."
        />
        <SummaryCard
          label="Analysis duration"
          value={formatMetric(summary.analysisDurationSeconds, "seconds")}
          description="Creation-to-completion elapsed time when timestamps are available."
        />
        <SummaryCard
          label="Reward exposure"
          value="Not configured"
          description="Campaign budget and allocation policy are not stored, so no monetary claim is generated."
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Decision quality coverage
            </CardTitle>
            <CardDescription>Coverage and reviewer outcomes, not a full accuracy score.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryCard
              label="Explainable decisions"
              value={`${summary.explainableDecisionCoverageRate}%`}
              description="Wallets with the versioned Decision Evidence contract."
            />
            <SummaryCard
              label="High-confidence decisions"
              value={`${summary.highConfidenceDecisionRate}%`}
              description="Decisions classified as high confidence by the explanation layer."
            />
            <SummaryCard
              label="Multi-family evidence"
              value={`${summary.multiFamilyEvidenceRate}%`}
              description="Wallets supported by at least two independent risk families."
            />
            <SummaryCard
              label="Data limitations"
              value={`${summary.dataLimitationRate}%`}
              description="Wallets with provider, history or review limitations."
            />
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" /> Human outcome signals
            </CardTitle>
            <CardDescription>Measured only where team review or feedback exists.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryCard
              label="Review completion"
              value={formatMetric(summary.reviewCompletionRate, "percent")}
              description={`${summary.reviewedWallets} reviewed across a queue of ${summary.reviewQueueSize}.`}
            />
            <SummaryCard
              label="Decision change rate"
              value={formatMetric(summary.humanDecisionChangeRate, "percent")}
              description="Reviewed wallets whose final human status differs from the stored automated status."
            />
            <SummaryCard
              label="Feedback coverage"
              value={`${summary.feedbackCoverageRate}%`}
              description="Wallets represented by submitted feedback events."
            />
            <SummaryCard
              label="FP / FN labels"
              value={`${summary.falsePositiveFeedbackCount} / ${summary.falseNegativeFeedbackCount}`}
              description="Submitted false-positive and false-negative labels; not complete ground truth."
            />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>Policy and intelligence outcomes</CardTitle>
            <CardDescription>Read-only recommendations and exact corroboration.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <SummaryCard
              label="Policy escalation"
              value={formatMetric(summary.policyEscalationRate, "percent")}
              description="Recommendations that differ from the stored automated decision."
            />
            <SummaryCard
              label="Policy review / reject"
              value={`${formatMetric(summary.policyReviewRecommendationRate, "percent")} / ${formatMetric(summary.policyRejectRecommendationRate, "percent")}`}
              description="Recommended Gray Zone and exclusion shares."
            />
            <SummaryCard
              label="Repeated participants"
              value={formatMetric(summary.repeatedParticipantRate, "percent")}
              description="Exact participant identities observed in at least one other campaign."
            />
            <SummaryCard
              label="Telegram corroboration"
              value={formatMetric(summary.telegramCorroborationRate, "percent")}
              description="Policy recommendations with exact Telegram-to-onchain corroboration."
            />
          </CardContent>
        </Card>

        <Card className={`glass-panel premium-card ${partial ? "border-amber-400/30" : ""}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5 text-primary" /> Measurement coverage
            </CardTitle>
            <CardDescription>
              {partial
                ? "One or more configured safety limits were reached."
                : "All data inside the configured v1 limits was evaluated."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              {report.coverage.workspaceCampaignsConsidered} workspace campaigns
            </Badge>
            <Badge variant="outline">
              {report.coverage.workspaceAnalysesConsidered} latest analyses
            </Badge>
            <Badge variant="outline">
              Risk Memory {report.coverage.riskMemoryAvailable ? "available" : "unavailable"}
            </Badge>
            <Badge variant="outline">
              Policy {report.coverage.policyAvailable ? "available" : "unavailable"}
            </Badge>
            <Badge variant="outline">Ground truth unavailable</Badge>
            <Badge variant="outline">Reward exposure unconfigured</Badge>
          </CardContent>
        </Card>
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>Workspace benchmark context</CardTitle>
          <CardDescription>
            Latest-analysis medians across campaigns owned by this workspace user.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {report.comparisons.map((item) => (
            <div key={item.key} className="rounded-xl border border-border bg-background/45 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                </div>
                <Badge variant="outline">n={item.sampleSize}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Current</p>
                  <p className="mt-1 font-semibold">
                    {formatMetric(item.currentValue, item.unit)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Workspace median</p>
                  <p className="mt-1 font-semibold">
                    {formatMetric(item.workspaceMedian, item.unit)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{deltaLabel(item)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="size-5 text-primary" /> Campaign analysis history
          </CardTitle>
          <CardDescription>Up to 25 stored analyses for this campaign.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.history.map((point) => (
            <div
              key={point.analysisId}
              className="grid gap-3 rounded-xl border border-border bg-background/45 p-4 md:grid-cols-[1.2fr_repeat(5,minmax(0,1fr))]"
            >
              <div>
                <p className="font-medium">{new Date(point.createdAt).toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">{point.analysisId}</p>
              </div>
              <div><p className="text-xs text-muted-foreground">Wallets</p><p>{point.totalWallets}</p></div>
              <div><p className="text-xs text-muted-foreground">Approved</p><p>{point.approvalRate}%</p></div>
              <div><p className="text-xs text-muted-foreground">Gray Zone</p><p>{point.manualReviewRate}%</p></div>
              <div><p className="text-xs text-muted-foreground">Rejected</p><p>{point.rejectionRate}%</p></div>
              <div><p className="text-xs text-muted-foreground">Duration</p><p>{formatMetric(point.analysisDurationSeconds, "seconds")}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card border-amber-400/20">
        <CardHeader>
          <CardTitle>Measurement gaps</CardTitle>
          <CardDescription>Constraints that must remain visible in pilot reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.measurementGaps.map((gap) => (
            <p key={gap} className="rounded-lg border border-border bg-background/45 p-3 text-sm text-muted-foreground">
              {gap}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
