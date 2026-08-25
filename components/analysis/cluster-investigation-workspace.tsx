"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  GitBranch,
  Network,
  Search,
  ShieldAlert,
  Users,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  ClusterInvestigationReport,
  ClusterInvestigationTimelineItem,
} from "@/lib/cluster-investigation/builder"
import { formatDateTimeUTC, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { WalletStatus } from "@/types"

type MemberFilter = "all" | WalletStatus
type TimelineFilter = "all" | ClusterInvestigationTimelineItem["source"]

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function shortAddress(address: string) {
  if (address.length <= 18) return address
  return `${address.slice(0, 9)}…${address.slice(-7)}`
}

function actionClass(action: string) {
  if (action === "reject" || action === "rejected") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (action === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

function sourceClass(source: ClusterInvestigationTimelineItem["source"]) {
  if (source === "funding_provenance") return "border-violet-400/35 bg-violet-400/10 text-violet-200"
  if (source === "graph") return "border-cyan-400/35 bg-cyan-400/10 text-cyan-200"
  if (source === "onchain_event") return "border-blue-400/35 bg-blue-400/10 text-blue-200"
  return "border-border text-muted-foreground"
}

function Metric({ label, value, description }: { label: string; value: string | number; description: string }) {
  return (
    <Card className="glass-panel premium-card">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export function ClusterInvestigationWorkspace({ report }: { report: ClusterInvestigationReport }) {
  const [memberQuery, setMemberQuery] = useState("")
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all")
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all")

  const filteredMembers = useMemo(() => {
    const normalized = memberQuery.trim().toLowerCase()
    return report.members.filter((member) => {
      const statusMatch = memberFilter === "all" || member.status === memberFilter
      const queryMatch =
        !normalized ||
        member.walletAddress.toLowerCase().includes(normalized) ||
        member.reasons.some((reason) => reason.toLowerCase().includes(normalized)) ||
        member.decisionEvidenceCodes.some((code) => code.toLowerCase().includes(normalized))
      return statusMatch && queryMatch
    })
  }, [memberFilter, memberQuery, report.members])

  const timeline = useMemo(
    () => report.timeline.items.filter((item) => timelineFilter === "all" || item.source === timelineFilter),
    [report.timeline.items, timelineFilter],
  )

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-2 border-primary/30 text-primary">
                <Network className="size-3.5" /> Cluster Investigation v1
              </Badge>
              <Badge variant="outline">{report.cluster.clusterLabel}</Badge>
              <Badge variant="outline" className={actionClass(report.cluster.suggestedAction)}>
                {title(report.cluster.suggestedAction)}
              </Badge>
            </div>
            <h1 className="text-gradient text-3xl font-semibold sm:text-4xl">Why were these wallets grouped?</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">{report.grouping.explanation}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/analysis/${report.analysisId}/clusters`} className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft data-icon="inline-start" /> All clusters
            </Link>
            <Link href={`/dashboard/analysis/${report.analysisId}`} className={buttonVariants({ variant: "outline" })}>
              Analysis
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Members" value={formatNumber(report.cluster.walletCount)} description="Stored cluster members" />
        <Metric label="Independent families" value={report.grouping.observedIndependentFamilies} description="Stored grouping basis" />
        <Metric label="Average risk" value={report.cluster.averageRiskScore} description="Existing wallet scores" />
        <Metric label="Funding provenance" value={formatNumber(report.provenance.funding.relationshipCount)} description="Canonical relationships" />
        <Metric label="Risk graph edges" value={formatNumber(report.provenance.graph.riskBearingEdgeCount)} description="Supplemental graph context" />
      </section>

      <Card className={cn("glass-panel premium-card", report.grouping.qualifiesByStoredRule ? "border-primary/25" : "border-amber-400/30")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {report.grouping.qualifiesByStoredRule ? (
              <CheckCircle2 className="size-5 text-green-300" />
            ) : (
              <AlertTriangle className="size-5 text-amber-300" />
            )}
            Stored grouping basis
          </CardTitle>
          <CardDescription>{report.grouping.headline}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Membership threshold</p>
              <p className="mt-2 font-semibold">
                {report.grouping.observedWallets} observed / {report.grouping.minimumWallets}+ required
              </p>
            </div>
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Independent relationship families</p>
              <p className="mt-2 font-semibold">
                {report.grouping.observedIndependentFamilies} observed / {report.grouping.minimumIndependentFamilies}+ required
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.grouping.families.map((family) => (
              <div key={family.family} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <Badge variant="outline" className="border-primary/30 text-primary">{family.label}</Badge>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{family.storedReason}</p>
              </div>
            ))}
            {!report.grouping.families.length && (
              <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                The stored record does not expose family-level reasons. The workspace does not infer replacements.
              </div>
            )}
          </div>

          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="font-medium text-amber-100">Interpretation boundary</p>
            <div className="mt-2 space-y-1.5">
              {report.grouping.caveats.map((caveat) => (
                <p key={caveat} className="text-xs leading-relaxed text-muted-foreground">• {caveat}</p>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-5 xl:grid-cols-2">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><GitBranch className="size-5 text-primary" /> Canonical funding provenance</CardTitle>
            <CardDescription>
              {report.provenance.funding.riskBearingCount} risk-bearing · {report.provenance.funding.neutralizedCount} neutralized
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.provenance.funding.relationships.slice(0, 20).map((relationship) => (
              <div key={relationship.relationshipKey} className="rounded-xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{relationship.kind}</Badge>
                  <Badge variant="secondary">{relationship.confidence}% confidence</Badge>
                  <Badge variant="outline" className={relationship.riskBearing ? "border-red-400/35 text-red-200" : "border-green-400/35 text-green-200"}>
                    {relationship.riskBearing ? "Risk-bearing" : relationship.suppressionReason ? "Neutralized" : "Context"}
                  </Badge>
                </div>
                <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
                  {shortAddress(relationship.sourceAddress)} → {shortAddress(relationship.targetAddress)}
                  {relationship.viaAddress ? ` via ${shortAddress(relationship.viaAddress)}` : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cohort {relationship.cohortSize} · hop {relationship.hopCount}
                  {relationship.suppressionReason ? ` · suppression ${relationship.suppressionReason}` : ""}
                </p>
              </div>
            ))}
            {!report.provenance.funding.relationships.length && (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No canonical funding relationship is attached to this cluster in the current evidence projection.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Network className="size-5 text-primary" /> Graph context</CardTitle>
            <CardDescription>
              {report.provenance.graph.nodeCount} nodes · {report.provenance.graph.edgeCount} edges · {report.provenance.graph.componentIds.length} components
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {report.provenance.graph.componentIds.map((componentId) => (
                <Badge key={componentId} variant="outline">{componentId}</Badge>
              ))}
            </div>
            {report.provenance.graph.edges.slice(0, 20).map((edge) => (
              <div key={edge.edgeKey} className="rounded-xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{title(edge.kind)}</Badge>
                  <Badge variant="secondary">{edge.confidence}%</Badge>
                  {edge.riskBearing && <Badge variant="outline" className="border-red-400/35 text-red-200">Risk-bearing</Badge>}
                </div>
                <p className="mt-3 break-all font-mono text-[11px] text-muted-foreground">{edge.sourceKey} → {edge.targetKey}</p>
                {edge.evidence.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{edge.evidence.slice(0, 3).join(" · ")}</p>}
              </div>
            ))}
            {!report.provenance.graph.edges.length && (
              <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No graph edge is available for these members. This does not invalidate non-graph grouping families.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WalletCards className="size-5 text-primary" /> Cluster members</CardTitle>
          <CardDescription>Wallet-level decisions remain separate from the cluster explanation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search wallet, reason, or evidence code..." className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "approved", "manual_review", "rejected"] as MemberFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setMemberFilter(filter)}
                  className={buttonVariants({ variant: memberFilter === filter ? "default" : "outline", size: "sm" })}
                >
                  {title(filter)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-auto rounded-xl border border-border">
            <Table className="min-w-[980px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead>Decision Evidence</TableHead>
                  <TableHead>Team review</TableHead>
                  <TableHead>Graph</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => (
                  <TableRow key={`${member.chain}:${member.walletAddress}`}>
                    <TableCell>
                      <p className="font-mono text-xs">{shortAddress(member.walletAddress)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{member.chain}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold">{member.riskScore}</p>
                      <p className="text-xs capitalize text-muted-foreground">{member.riskLevel}</p>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={actionClass(member.status)}>{title(member.status)}</Badge></TableCell>
                    <TableCell>
                      <div className="flex max-w-[320px] flex-wrap gap-1.5">
                        {member.decisionEvidenceFamilies.slice(0, 4).map((family) => <Badge key={family} variant="secondary" className="text-[10px]">{title(family)}</Badge>)}
                        {member.decisionEvidenceCodes.slice(0, 3).map((code) => <Badge key={code} variant="outline" className="font-mono text-[10px]">{code}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {member.teamReview ? (
                        <div>
                          <Badge variant="outline" className={actionClass(member.teamReview.finalStatus)}>{title(member.teamReview.finalStatus)}</Badge>
                          {member.teamReview.feedbackLabel && <p className="mt-1 text-[11px] text-muted-foreground">{title(member.teamReview.feedbackLabel)}</p>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Not reviewed</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{member.graphComponentId ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock3 className="size-5 text-primary" /> Evidence timeline</CardTitle>
          <CardDescription>
            Chronological reconstruction from wallet activity, normalized on-chain events, canonical funding provenance, and timestamped graph edges.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "wallet_activity", "onchain_event", "funding_provenance", "graph"] as TimelineFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setTimelineFilter(filter)}
                className={buttonVariants({ variant: timelineFilter === filter ? "default" : "outline", size: "sm" })}
              >
                {title(filter)}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {timeline.map((item) => (
              <div key={item.id} className={cn("rounded-xl border p-4", item.riskBearing ? "border-red-400/25 bg-red-400/5" : "border-border bg-background/45")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={sourceClass(item.source)}>{title(item.source)}</Badge>
                      <Badge variant="outline">{title(item.kind)}</Badge>
                      {item.riskBearing && <Badge variant="outline" className="border-red-400/35 text-red-200">Risk-bearing</Badge>}
                    </div>
                    <p className="mt-3 font-medium">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                    {item.walletAddresses.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.walletAddresses.slice(0, 4).map((address) => <Badge key={address} variant="secondary" className="font-mono text-[10px]">{shortAddress(address)}</Badge>)}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p>{item.observedAt ? formatDateTimeUTC(item.observedAt) : "Timestamp unavailable"}</p>
                    {item.confidence !== null && <p className="mt-1">{item.confidence}% confidence</p>}
                  </div>
                </div>
              </div>
            ))}
            {!timeline.length && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No timeline items match this filter.
              </div>
            )}
          </div>

          {report.timeline.truncated && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
              Timeline is bounded for review performance: showing {report.timeline.items.length} of {report.timeline.totalCandidates} candidates.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-green-400/20 bg-green-400/5">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <Users className="mt-0.5 size-5 text-green-300" />
            <p>The workspace is explanatory: it surfaces the stored grouping basis and supplemental evidence without changing cluster membership.</p>
          </CardContent>
        </Card>
        <Card className="border-amber-400/20 bg-amber-400/5">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-5 text-amber-300" />
            <p>A cluster is an investigation unit, not a claim that every member is malicious or controlled by the same actor.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
