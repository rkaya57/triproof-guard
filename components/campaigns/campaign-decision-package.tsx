import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileJson2,
  FileSpreadsheet,
  Network,
  ShieldCheck,
  ShieldQuestion,
  Users,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  CampaignDecisionPackage,
  CampaignExecutionAction,
} from "@/lib/campaign-decision-package"
import { clusterReviewDispositionLabel } from "@/lib/cluster-investigation/review"
import { formatNumber } from "@/lib/format"

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortAddress(address: string) {
  if (address.length <= 18) return address
  return `${address.slice(0, 9)}…${address.slice(-7)}`
}

function actionClass(action: CampaignExecutionAction | string) {
  if (action === "exclude" || action === "reject" || action === "rejected") {
    return "border-red-400/35 bg-red-400/10 text-red-200"
  }
  if (action === "review" || action === "manual_review") {
    return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  }
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

function readinessClass(status: CampaignDecisionPackage["readiness"]["status"]) {
  if (status === "ready") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (status === "review_required") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-red-400/35 bg-red-400/10 text-red-200"
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <Card className="glass-panel premium-card">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  )
}

export function CampaignDecisionPackageView({ pkg }: { pkg: CampaignDecisionPackage }) {
  const apiPath = `/api/campaigns/${pkg.campaignId}/decisions`
  const walletPreview = pkg.wallets.slice(0, 100)
  const clusterPreview = pkg.clusters.slice(0, 50)

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="secondary" className="border-primary/30 text-primary">
                Campaign Decision Package v1
              </Badge>
              <Badge variant="outline" className={readinessClass(pkg.readiness.status)}>
                {title(pkg.readiness.status)}
              </Badge>
              <Badge variant="outline">Analysis {pkg.analysisId.slice(0, 10)}</Badge>
            </div>
            <h1 className="text-gradient text-3xl font-semibold sm:text-4xl">{pkg.campaignName}</h1>
            <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              Read-only campaign execution plan. Stored wallet decisions, human overrides, policy recommendations,
              cluster-review context, and operational readiness remain separate and auditable.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/campaigns/${pkg.campaignId}`} className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft data-icon="inline-start" /> Campaign
            </Link>
            <a href={`${apiPath}?format=csv`} className={buttonVariants()}>
              <Download data-icon="inline-start" /> Download CSV
            </a>
            <a href={apiPath} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              <FileJson2 data-icon="inline-start" /> JSON
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Allow" value={formatNumber(pkg.summary.allowCount)} note="Policy execution recommendation" />
        <Metric label="Review" value={formatNumber(pkg.summary.reviewCount)} note="Human wallet decision required" />
        <Metric label="Exclude" value={formatNumber(pkg.summary.excludeCount)} note="Policy execution recommendation" />
        <Metric label="Human preserved" value={formatNumber(pkg.summary.humanDecisionsPreserved)} note="Stored wallet overrides retained" />
        <Metric label="Policy changes" value={formatNumber(pkg.summary.policyChangesStoredDecision)} note="Recommendation differs from stored state" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {pkg.readiness.status === "ready" ? <CheckCircle2 className="size-5 text-green-300" /> : <AlertTriangle className="size-5 text-amber-300" />}
              Execution readiness
            </CardTitle>
            <CardDescription>Blockers must be resolved before treating the package as final campaign execution input.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pkg.readiness.blockers.length === 0 ? (
              <div className="rounded-xl border border-green-400/25 bg-green-400/5 p-4 text-sm text-green-100">
                No package-level blocker remains. Human precedence and stored decision boundaries still apply.
              </div>
            ) : pkg.readiness.blockers.map((blocker) => (
              <div key={blocker.code} className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-amber-100">{title(blocker.code)}</p>
                  <Badge variant="outline">{formatNumber(blocker.count)}</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{blocker.description}</p>
              </div>
            ))}
            {pkg.readiness.warnings.map((warning) => (
              <div key={warning.code} className="rounded-xl border border-border bg-background/45 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{title(warning.code)}</p>
                  <Badge variant="outline">{formatNumber(warning.count)}</Badge>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{warning.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Policy context</CardTitle>
            <CardDescription>Policy recommendations are accepted only for this exact analysis run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={pkg.policy.status === "available" ? "border-green-400/35 bg-green-400/10 text-green-200" : "border-red-400/35 bg-red-400/10 text-red-200"}>
                {title(pkg.policy.status)}
              </Badge>
              {pkg.policy.preset && <Badge variant="secondary">{title(pkg.policy.preset)} preset</Badge>}
            </div>
            {pkg.policy.thresholds ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/45 p-4">
                  <p className="text-xs text-muted-foreground">Corroborated reject score</p>
                  <p className="mt-2 text-xl font-semibold">{pkg.policy.thresholds.corroboratedRejectScore}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/45 p-4">
                  <p className="text-xs text-muted-foreground">Independent risk families</p>
                  <p className="mt-2 text-xl font-semibold">{pkg.policy.thresholds.corroboratedFamilyCount}</p>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-muted-foreground">
                No matching policy execution list is available for this analysis run.
              </p>
            )}
            {pkg.policy.coverage && (
              <div className="rounded-xl border border-border bg-background/45 p-4 text-xs text-muted-foreground">
                {formatNumber(pkg.policy.coverage.walletsEvaluated)} wallets evaluated · {formatNumber(pkg.policy.coverage.campaignsConsidered)} campaigns considered · risk memory {pkg.policy.coverage.riskMemoryPartial ? "partial" : "complete for loaded scope"}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Network className="size-5 text-primary" /> Cluster execution context</CardTitle>
          <CardDescription>Cluster review informs readiness; it never rewrites per-wallet actions.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border border-border">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Cluster</TableHead>
                  <TableHead>Wallets</TableHead>
                  <TableHead>Average risk</TableHead>
                  <TableHead>Grouping families</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Allow</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Exclude</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clusterPreview.map((cluster) => (
                  <TableRow key={cluster.clusterLabel}>
                    <TableCell>
                      <Link href={`/dashboard/analysis/${pkg.analysisId}/clusters/${encodeURIComponent(cluster.clusterLabel)}`} className="font-mono text-xs text-primary hover:underline">
                        {cluster.clusterLabel}
                      </Link>
                    </TableCell>
                    <TableCell>{formatNumber(cluster.walletCount)}</TableCell>
                    <TableCell>{cluster.averageRiskScore}</TableCell>
                    <TableCell className="max-w-[260px] text-xs text-muted-foreground">{cluster.groupingFamilies.join(", ") || "—"}</TableCell>
                    <TableCell>{cluster.latestReviewDisposition ? <Badge variant="outline">{clusterReviewDispositionLabel(cluster.latestReviewDisposition)}</Badge> : <span className="text-xs text-muted-foreground">Not reviewed</span>}</TableCell>
                    <TableCell className="text-green-200">{formatNumber(cluster.executionCounts.allow)}</TableCell>
                    <TableCell className="text-amber-200">{formatNumber(cluster.executionCounts.review)}</TableCell>
                    <TableCell className="text-red-200">{formatNumber(cluster.executionCounts.exclude)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {pkg.clusters.length > clusterPreview.length && (
            <p className="mt-3 text-xs text-muted-foreground">Showing the first {clusterPreview.length} of {pkg.clusters.length} clusters.</p>
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Wallet execution preview</CardTitle>
          <CardDescription>Stored state and execution recommendation remain separate columns.</CardDescription>
        </CardHeader>
        <CardContent>
          {walletPreview.length ? (
            <div className="overflow-auto rounded-xl border border-border">
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Stored</TableHead>
                    <TableHead>Execution</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Human decision</TableHead>
                    <TableHead>Cluster</TableHead>
                    <TableHead>Policy rules</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {walletPreview.map((wallet) => (
                    <TableRow key={`${wallet.chain}:${wallet.walletAddress}`}>
                      <TableCell><p className="font-mono text-xs">{shortAddress(wallet.walletAddress)}</p><p className="mt-1 text-[11px] text-muted-foreground">{wallet.chain}</p></TableCell>
                      <TableCell><Badge variant="outline" className={actionClass(wallet.storedStatus)}>{title(wallet.storedStatus)}</Badge></TableCell>
                      <TableCell><div className="flex items-center gap-2"><Badge variant="outline" className={actionClass(wallet.executionAction)}>{title(wallet.executionAction)}</Badge>{wallet.changesStoredDecision && <Badge variant="secondary" className="text-[10px]">Differs</Badge>}</div></TableCell>
                      <TableCell className="capitalize">{wallet.confidence}</TableCell>
                      <TableCell>{wallet.finalHumanDecision ? <Badge variant="outline" className={actionClass(wallet.finalHumanDecision)}>{title(wallet.finalHumanDecision)}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="font-mono text-xs">{wallet.clusterId ?? "—"}</TableCell>
                      <TableCell className="max-w-[300px] text-xs text-muted-foreground">{wallet.matchedRuleCodes.join(", ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              Wallet execution rows are withheld until a matching policy report is available for this exact analysis run.
            </div>
          )}
          {pkg.wallets.length > walletPreview.length && (
            <p className="mt-3 text-xs text-muted-foreground">Showing the first {walletPreview.length} of {formatNumber(pkg.wallets.length)} wallet recommendations. Download CSV for the full bounded package.</p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="size-5 text-primary" /> Operator handoff</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Resolve all Review rows or documented package blockers.</p>
            <p>2. Export the bounded CSV and preserve the analysis ID with downstream reward tooling.</p>
            <p>3. Re-run the package after any wallet-level human decision or new analysis.</p>
            <p>4. Do not convert cluster-review disposition into a wallet exclusion outside policy.</p>
          </CardContent>
        </Card>

        <Card className="border-amber-400/20 bg-amber-400/5">
          <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><ShieldQuestion className="size-5" /> Decision boundaries</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pkg.safeguards.map((safeguard) => <p key={safeguard} className="text-xs leading-relaxed text-muted-foreground">• {safeguard}</p>)}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
