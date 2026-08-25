import Link from "next/link"
import { notFound } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Network,
  ShieldCheck,
  ShieldQuestion,
  Users,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { loadCampaignDetail } from "@/lib/campaigns/load-campaign-detail"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { formatDateTimeUTC, formatNumber } from "@/lib/format"

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

function statusClass(status: string) {
  if (status === "completed") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "failed") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-primary/30 bg-primary/10 text-primary"
}

function label(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <Card className="glass-panel premium-card">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-2 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageUser(`/dashboard/campaigns/${id}`)

  let detail
  try {
    detail = await loadCampaignDetail(id, user.id)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <Card className="glass-panel border-amber-400/30 bg-amber-400/5">
        <CardHeader>
          <CardTitle>Campaign detail is temporarily unavailable</CardTitle>
          <CardDescription>
            The database could not be reached. Existing campaign data and reports were not changed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/campaigns" className={buttonVariants({ variant: "outline" })}>
            Back to campaigns
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (!detail) notFound()

  const { campaign, latestAnalysis } = detail

  if (!latestAnalysis) {
    return (
      <div className="flex flex-col gap-6">
        <section className="dashboard-hero rounded-2xl p-6 sm:p-8">
          <Badge variant="secondary" className="mb-4 border-primary/30 text-primary">
            Campaign Security Console
          </Badge>
          <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">{campaign.name}</h2>
          <p className="mt-3 text-muted-foreground">{campaign.campaignType} on {campaign.chain}</p>
        </section>
        <Card className="glass-panel premium-card border-dashed">
          <CardHeader>
            <CardTitle>No analysis yet</CardTitle>
            <CardDescription>
              This campaign remains unchanged. Start an analysis when the participant wallet list is ready.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/dashboard/new-analysis" className={buttonVariants()}>
              <FilePlus2 data-icon="inline-start" /> Start analysis
            </Link>
            <Link href="/dashboard/campaigns" className={buttonVariants({ variant: "outline" })}>
              Back to campaigns
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const wallets = latestAnalysis.wallets
  const total = latestAnalysis.totalWallets || wallets.length
  const evidenceCovered = wallets.filter((wallet) => {
    const evidence = wallet.decisionEvidence
    return Boolean(evidence && (evidence.evidence.length > 0 || evidence.limitations.length > 0))
  }).length
  const highConfidence = wallets.filter(
    (wallet) => wallet.decisionEvidence?.evidenceConfidence === "high"
  ).length
  const corroborated = wallets.filter(
    (wallet) => (wallet.decisionEvidence?.independentRiskFamilyCount ?? 0) >= 2
  ).length
  const limited = wallets.filter(
    (wallet) => (wallet.decisionEvidence?.limitations.length ?? 0) > 0
  ).length
  const pendingHumanDecisions = latestAnalysis.teamReviewSummary?.pendingReview ?? 0

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero reveal-up flex flex-col gap-5 rounded-2xl p-6 lg:flex-row lg:items-end lg:justify-between sm:p-8">
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 text-primary">
              Campaign Security Console
            </Badge>
            <Badge variant="outline" className={statusClass(latestAnalysis.status)}>
              {label(latestAnalysis.status)}
            </Badge>
          </div>
          <h2 className="text-gradient text-3xl font-semibold sm:text-4xl">{campaign.name}</h2>
          <p className="mt-3 text-muted-foreground">
            {campaign.campaignType} on {campaign.chain} · Updated {formatDateTimeUTC(campaign.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/campaigns/${campaign.id}/decisions`} className={buttonVariants()}>
            <ClipboardCheck data-icon="inline-start" /> Decision package
          </Link>
          <Link href={`/dashboard/analysis/${latestAnalysis.id}`} className={buttonVariants({ variant: "outline" })}>
            <FileText data-icon="inline-start" /> Open report
          </Link>
          <Link
            href={`/dashboard/analysis/${latestAnalysis.id}/evidence`}
            className={buttonVariants({ variant: "outline" })}
          >
            <ShieldCheck data-icon="inline-start" /> Decision evidence
          </Link>
          {latestAnalysis.manualReviewCount > 0 && (
            <Link
              href={`/dashboard/analysis/${latestAnalysis.id}/review`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Users data-icon="inline-start" /> Review queue
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          title="Gray Zone rate"
          value={`${percent(latestAnalysis.manualReviewCount, total)}%`}
          note={`${formatNumber(latestAnalysis.manualReviewCount)} wallets need review`}
        />
        <Metric
          title="Not eligible rate"
          value={`${percent(latestAnalysis.rejectedCount, total)}%`}
          note={`${formatNumber(latestAnalysis.rejectedCount)} wallets excluded`}
        />
        <Metric
          title="Evidence coverage"
          value={`${percent(evidenceCovered, total)}%`}
          note={`${formatNumber(evidenceCovered)} decisions explained`}
        />
        <Metric
          title="High confidence"
          value={`${percent(highConfidence, total)}%`}
          note={`${formatNumber(highConfidence)} high-confidence decisions`}
        />
        <Metric
          title="Reward exposure"
          value="Not configured"
          note="No monetary estimate is invented without a stored reward amount."
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>Latest decision distribution</CardTitle>
            <CardDescription>Eligibility outcomes from the latest analysis.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-green-400/25 bg-green-400/5 p-4">
              <CheckCircle2 className="size-5 text-green-300" />
              <p className="mt-3 text-2xl font-semibold text-green-200">{formatNumber(latestAnalysis.approvedCount)}</p>
              <p className="text-sm text-muted-foreground">Approved</p>
            </div>
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
              <ShieldQuestion className="size-5 text-amber-300" />
              <p className="mt-3 text-2xl font-semibold text-amber-200">{formatNumber(latestAnalysis.manualReviewCount)}</p>
              <p className="text-sm text-muted-foreground">Gray Zone</p>
            </div>
            <div className="rounded-xl border border-red-400/25 bg-red-400/5 p-4">
              <XCircle className="size-5 text-red-300" />
              <p className="mt-3 text-2xl font-semibold text-red-200">{formatNumber(latestAnalysis.rejectedCount)}</p>
              <p className="text-sm text-muted-foreground">Not eligible</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network className="size-5 text-primary" /> Evidence posture</CardTitle>
            <CardDescription>Corroboration and unresolved limitations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              ["Two or more risk families", corroborated],
              ["Evidence limitations", limited],
              ["Pending human decisions", pendingHumanDecisions],
              ["Suspicious clusters", latestAnalysis.suspiciousClustersCount],
            ].map(([name, value]) => (
              <div key={String(name)} className="flex justify-between rounded-lg border border-border bg-background/45 p-3">
                <span className="text-muted-foreground">{String(name)}</span>
                <strong>{formatNumber(Number(value))}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {limited > 0 && (
        <Card className="glass-panel border-amber-400/30 bg-amber-400/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5" /> Coverage limitations remain</CardTitle>
            <CardDescription>
              {formatNumber(limited)} wallet decisions contain provider, history or account-state limitations.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>Analysis history</CardTitle>
          <CardDescription>Previous reports remain available and unchanged.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {campaign.analyses.map((analysis, index) => (
            <div key={analysis.id} className="flex flex-col gap-3 rounded-xl border border-border bg-background/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={statusClass(analysis.status)}>{label(analysis.status)}</Badge>
                  {index === 0 && <Badge variant="secondary">Latest</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatDateTimeUTC(analysis.createdAt)} · {formatNumber(analysis.totalWallets)} wallets · {analysis.averageRiskScore.toFixed(1)} average risk
                </p>
              </div>
              <Link href={`/dashboard/analysis/${analysis.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Report
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="glass-panel border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <CircleDollarSign className="size-5 shrink-0 text-primary" />
            <p>Reward exposure stays unavailable until reward amount and allocation policy are explicitly stored.</p>
          </div>
          <Link href="/dashboard/campaigns" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to campaigns
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
