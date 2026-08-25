import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson2,
  FileText,
  Network,
  ShieldCheck,
  Users,
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
import type { InvestigationCaseBrief } from "@/lib/cluster-investigation/case-brief"
import { clusterReviewDispositionLabel } from "@/lib/cluster-investigation/review"
import { formatDateTimeUTC } from "@/lib/format"

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortAddress(address: string) {
  if (address.length <= 18) return address
  return `${address.slice(0, 9)}…${address.slice(-7)}`
}

function actionClass(value: string) {
  if (value === "reject" || value === "rejected") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (value === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

function policyStatusClass(status: InvestigationCaseBrief["policy"]["status"]) {
  if (status === "available") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (status === "analysis_mismatch") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-border text-muted-foreground"
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

export function InvestigationCaseBriefView({ brief }: { brief: InvestigationCaseBrief }) {
  const encodedLabel = encodeURIComponent(brief.clusterLabel)
  const base = `/dashboard/analysis/${brief.analysisId}/clusters/${encodedLabel}`
  const apiBase = `/api/analysis/${brief.analysisId}/clusters/${encodedLabel}/brief`

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary">
                <FileText className="size-3.5" /> Investigation Case Brief v1
              </Badge>
              <Badge variant="outline">{brief.clusterLabel}</Badge>
              <Badge variant="outline" className={actionClass(brief.storedState.suggestedAction)}>
                Stored: {title(brief.storedState.suggestedAction)}
              </Badge>
            </div>
            <h1 className="text-gradient max-w-4xl text-3xl font-semibold sm:text-4xl">{brief.headline}</h1>
            <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">{brief.executiveSummary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={base} className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft data-icon="inline-start" /> Investigation
            </Link>
            <a href={`${apiBase}?format=markdown`} className={buttonVariants({ variant: "default" })}>
              <Download data-icon="inline-start" /> Download brief
            </a>
            <a href={apiBase} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
              <FileJson2 data-icon="inline-start" /> JSON
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Members" value={brief.storedState.walletCount} note="Stored cluster membership" />
        <Metric label="Grouping families" value={brief.storedState.groupingFamilies.length} note="Stored independent families" />
        <Metric label="Average risk" value={brief.storedState.averageRiskScore} note="Stored wallet-score average" />
        <Metric label="Policy review" value={brief.policy.recommendationCounts.manual_review} note="Matching policy recommendations" />
        <Metric label="Risk graph" value={brief.evidenceSummary.graphRiskBearingEdges} note="Risk-bearing graph edges" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" /> Human cluster review</CardTitle>
            <CardDescription>Cluster-level investigation judgment; never a wallet status override.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {brief.reviewer.latest ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{clusterReviewDispositionLabel(brief.reviewer.latest.disposition)}</Badge>
                  <span className="text-xs text-muted-foreground">{brief.reviewer.latest.reviewerName} · {formatDateTimeUTC(brief.reviewer.latest.createdAt)}</span>
                </div>
                {brief.reviewer.latest.notes && (
                  <p className="rounded-xl border border-border bg-background/45 p-4 text-sm leading-relaxed text-muted-foreground">
                    {brief.reviewer.latest.notes}
                  </p>
                )}
              </>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" /> No cluster-level reviewer disposition is recorded.
              </div>
            )}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary">Operational use</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{brief.reviewer.operationalUse}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Matching campaign policy</CardTitle>
            <CardDescription>Policy is shown only when it belongs to this exact analysis run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={policyStatusClass(brief.policy.status)}>{title(brief.policy.status)}</Badge>
              {brief.policy.preset && <Badge variant="secondary">{title(brief.policy.preset)} preset</Badge>}
            </div>
            {brief.policy.status === "available" ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-3 text-center"><p className="text-xl font-semibold">{brief.policy.recommendationCounts.approve}</p><p className="text-[11px] text-muted-foreground">Approve</p></div>
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-center"><p className="text-xl font-semibold">{brief.policy.recommendationCounts.manual_review}</p><p className="text-[11px] text-muted-foreground">Review</p></div>
                <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-center"><p className="text-xl font-semibold">{brief.policy.recommendationCounts.reject}</p><p className="text-[11px] text-muted-foreground">Reject</p></div>
              </div>
            ) : (
              <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-relaxed text-muted-foreground">{brief.policy.reason}</p>
            )}
            {brief.policy.status === "available" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/45 p-3"><p className="text-xs text-muted-foreground">Policy changes vs stored</p><p className="mt-1 text-lg font-semibold">{brief.policy.recommendationsChangingStoredDecision}</p></div>
                <div className="rounded-xl border border-border bg-background/45 p-3"><p className="text-xs text-muted-foreground">Human decisions preserved</p><p className="mt-1 text-lg font-semibold">{brief.policy.humanDecisionsPreserved}</p></div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Member decision preview</CardTitle>
          <CardDescription>Stored decisions stay distinct from policy recommendations and team-review context.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border border-border">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Stored decision</TableHead>
                  <TableHead>Policy</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead>Team review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brief.memberPreview.map((member) => (
                  <TableRow key={`${member.chain}:${member.walletAddress}`}>
                    <TableCell><p className="font-mono text-xs">{shortAddress(member.walletAddress)}</p><p className="mt-1 text-[11px] text-muted-foreground">{member.chain}</p></TableCell>
                    <TableCell className="font-semibold">{member.riskScore}</TableCell>
                    <TableCell><Badge variant="outline" className={actionClass(member.storedStatus)}>{title(member.storedStatus)}</Badge></TableCell>
                    <TableCell>
                      {member.policyAction ? (
                        <div className="flex items-center gap-2"><Badge variant="outline" className={actionClass(member.policyAction)}>{title(member.policyAction)}</Badge>{member.policyChangesStoredDecision && <Badge variant="secondary" className="text-[10px]">Differs</Badge>}</div>
                      ) : <span className="text-xs text-muted-foreground">Withheld / unavailable</span>}
                    </TableCell>
                    <TableCell className="text-xs capitalize text-muted-foreground">{member.evidenceConfidence ?? "unknown"}</TableCell>
                    <TableCell>{member.teamReviewStatus ? <Badge variant="outline" className={actionClass(member.teamReviewStatus)}>{title(member.teamReviewStatus)}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><Network className="size-5 text-primary" /> Evidence readout</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/45 p-4"><p className="text-xs text-muted-foreground">Funding provenance</p><p className="mt-2 font-semibold">{brief.evidenceSummary.fundingRelationships} relationships</p><p className="mt-1 text-xs text-muted-foreground">{brief.evidenceSummary.fundingRiskBearing} risk-bearing · {brief.evidenceSummary.fundingNeutralized} neutralized</p></div>
            <div className="rounded-xl border border-border bg-background/45 p-4"><p className="text-xs text-muted-foreground">Graph context</p><p className="mt-2 font-semibold">{brief.evidenceSummary.graphComponents} components</p><p className="mt-1 text-xs text-muted-foreground">{brief.evidenceSummary.graphRiskBearingEdges} risk-bearing edges</p></div>
            <div className="rounded-xl border border-border bg-background/45 p-4 sm:col-span-2"><p className="text-xs text-muted-foreground">Timeline coverage</p><p className="mt-2 font-semibold">{brief.evidenceSummary.timelineItems} / {brief.evidenceSummary.timelineCandidates} items in brief source</p>{brief.evidenceSummary.timelineTruncated && <p className="mt-1 text-xs text-amber-200">Timeline is truncated; inspect canonical sources before closing the case.</p>}</div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="flex items-center gap-2"><CheckCircle2 className="size-5 text-primary" /> Next actions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {brief.nextActions.map((action) => <p key={action} className="rounded-xl border border-border bg-background/45 p-4 text-sm leading-relaxed text-muted-foreground">• {action}</p>)}
          </CardContent>
        </Card>
      </section>

      <Card className="border-amber-400/20 bg-amber-400/5">
        <CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><AlertTriangle className="size-5" /> Decision boundaries</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {brief.limitations.map((limitation) => <p key={limitation} className="text-xs leading-relaxed text-muted-foreground">• {limitation}</p>)}
        </CardContent>
      </Card>
    </div>
  )
}
