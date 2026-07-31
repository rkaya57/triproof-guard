"use client"

import Link from "next/link"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Gauge,
  KeyRound,
  Landmark,
  Layers3,
  LockKeyhole,
  Mail,
  RotateCcw,
  Search,
  Share2,
  ShieldX,
  SlidersHorizontal,
  Users,
  WalletCards,
  Webhook,
  X,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MetricCard } from "@/components/dashboard/metric-card"
import { WalletGraphIntelligencePanel } from "@/components/analysis/wallet-graph-intelligence"
import { CampaignIntegrityPanel } from "@/components/analysis/campaign-integrity-panel"
import { AiDecisionBriefPanel } from "@/components/analysis/ai-decision-brief"
import { useToast } from "@/components/ui/toast"
import {
  getCampaignPolicy,
  getDecisionIntelligence,
  getWalletReasonCodes,
} from "@/lib/campaign-decision"
import { actionLabel, decisionExplanation, decisionLabel } from "@/lib/decision-labels"
import { formatDateTimeUTC, formatDateUTC, formatNumber } from "@/lib/format"
import type {
  AnalysisDetail as AnalysisDetailType,
  EntityType,
  RiskLevel,
  WalletRiskResult,
  WalletStatus,
} from "@/types"
import { cn } from "@/lib/utils"

type AnalysisDetailProps = {
  analysisId?: string
  initialAnalysis?: AnalysisDetailType
  exportBasePath?: string
}

const filterOptions = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "manual_review", label: "Gray Zone" },
  { value: "rejected", label: "Rejected / Not Eligible" },
  { value: "low", label: "Low Risk" },
  { value: "medium", label: "Medium Risk" },
  { value: "high", label: "High Risk" },
  { value: "critical", label: "Critical Risk" },
  { value: "cluster_members", label: "Suspicious Cluster Members" },
  { value: "known_entities", label: "Known Entities" },
  { value: "shared_funding", label: "Shared Funding Source" },
] as const

type WalletFilter = (typeof filterOptions)[number]["value"]

type SortKey = "wallet" | "risk" | "status" | "cluster"

const statusSortOrder: Record<WalletStatus, number> = {
  rejected: 3,
  manual_review: 2,
  approved: 1,
}

const pageSizeOptions = [25, 50, 100, 200]

const riskColors: Record<RiskLevel, string> = {
  low: "var(--guard-green)",
  medium: "var(--guard-yellow)",
  high: "var(--guard-orange)",
  critical: "var(--guard-red)",
}

const entityReviewTypes = new Set<EntityType>([
  "exchange",
  "service",
  "protocol",
  "bridge",
])

function displayStatus(status: WalletStatus) {
  return decisionLabel(status)
}

function displayAction(action: WalletRiskResult["recommendedAction"]) {
  return actionLabel(action)
}

function displayEntityType(entityType: EntityType | null | undefined) {
  const value = entityType ?? "user"
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

function shortAddress(address: string) {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-3)}`
}

function isEntityReviewWallet(wallet: Pick<WalletRiskResult, "entityLabel" | "entityType">) {
  return Boolean(wallet.entityLabel && entityReviewTypes.has(wallet.entityType))
}

function hasSharedFundingSignal(wallet: Pick<WalletRiskResult, "reasons">) {
  return wallet.reasons.some((reason) => reason.startsWith("Shared funding source"))
}

function policyStatusForScore(score: number, policy: "conservative" | "balanced" | "strict"): WalletStatus {
  if (policy === "conservative") {
    if (score <= 35) return "approved"
    if (score <= 74) return "manual_review"
    return "rejected"
  }
  if (policy === "strict") {
    if (score <= 25) return "approved"
    if (score <= 49) return "manual_review"
    return "rejected"
  }
  if (score <= 35) return "approved"
  if (score <= 59) return "manual_review"
  return "rejected"
}

function getPolicyScenario(wallets: WalletRiskResult[], policy: "conservative" | "balanced" | "strict") {
  const counts = wallets.reduce(
    (summary, wallet) => {
      const status = policyStatusForScore(wallet.riskScore, policy)
      summary[status] += 1
      return summary
    },
    { approved: 0, manual_review: 0, rejected: 0 } satisfies Record<WalletStatus, number>
  )
  return {
    policy,
    label: `${policy[0].toUpperCase()}${policy.slice(1)}`,
    ...counts,
  }
}

function getClusterGraph(analysis: AnalysisDetailType) {
  const topClusters = analysis.clusters.slice(0, 4)
  return topClusters.map((cluster, index) => {
    const wallets = analysis.wallets
      .filter((wallet) => wallet.clusterId === cluster.clusterLabel)
      .slice(0, 5)
    return {
      cluster,
      wallets,
      x: 28 + (index % 2) * 44,
      y: 30 + Math.floor(index / 2) * 38,
    }
  })
}

function buildMailto(subject: string, body: string) {
  return `mailto:info@triproofprotocol.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function svgPoint(value: number) {
  return Math.round(value * 100) / 100
}

function rowToneClass(status: WalletStatus) {
  if (status === "approved") return "border-l-2 border-l-green-400/60"
  if (status === "manual_review") return "border-l-2 border-l-amber-400/60"
  return "border-l-2 border-l-red-400/60"
}

function riskClass(level: RiskLevel) {
  return {
    low: "risk-low",
    medium: "risk-medium",
    high: "risk-high",
    critical: "risk-critical",
  }[level]
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <Badge variant="secondary" className={cn("capitalize", riskClass(level))}>
      {level}
    </Badge>
  )
}

function StatusBadge({ status }: { status: WalletStatus }) {
  const className =
    status === "approved"
      ? "border-green-400/40 bg-green-400/10 text-green-300"
      : status === "manual_review"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
        : "border-red-400/40 bg-red-400/10 text-red-300"

  return (
    <Badge variant="outline" className={className} title={decisionExplanation(status)}>
      {displayStatus(status)}
    </Badge>
  )
}

function ActionBadge({ action }: { action: WalletRiskResult["recommendedAction"] }) {
  const className =
    action === "approve"
      ? "border-green-400/40 bg-green-400/10 text-green-300"
      : action === "manual_review"
        ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
        : "border-red-400/40 bg-red-400/10 text-red-300"

  return (
    <Badge variant="outline" className={className} title={actionLabel(action)}>
      {displayAction(action)}
    </Badge>
  )
}

function EntityBadges({ wallet }: { wallet: WalletRiskResult }) {
  if (!wallet.entityLabel) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className="border-cyan-400/35 bg-cyan-400/10 text-cyan-200">
        {wallet.entityLabel}
      </Badge>
      <Badge variant="outline" className="border-sky-400/35 bg-sky-400/10 text-sky-200">
        {displayEntityType(wallet.entityType)}
      </Badge>
      {isEntityReviewWallet(wallet) && (
        <Badge variant="outline" className="border-violet-400/35 bg-violet-400/10 text-violet-200">
          Entity Review
        </Badge>
      )}
    </div>
  )
}

function RiskCell({ wallet }: { wallet: WalletRiskResult }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="w-8 text-sm font-medium">{wallet.riskScore}</span>
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${wallet.riskScore}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <RiskBadge level={wallet.riskLevel} />
        {isEntityReviewWallet(wallet) && (
          <Badge variant="outline" className="border-violet-400/35 bg-violet-400/10 text-violet-200">
            Entity Review
          </Badge>
        )}
      </div>
    </div>
  )
}

function ClusterCell({ wallet }: { wallet: WalletRiskResult }) {
  if (!wallet.clusterId) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
        {wallet.clusterId}
      </Badge>
      <Badge variant="outline" className="border-amber-400/35 bg-amber-400/10 text-amber-200">
        Cluster Member
      </Badge>
    </div>
  )
}

function ReasonSummary({
  wallet,
  onOpen,
}: {
  wallet: WalletRiskResult
  onOpen: (walletAddress: string) => void
}) {
  const reasonCodes = getWalletReasonCodes(wallet).slice(0, 3)
  const visibleReasons = wallet.reasons.slice(0, 2)
  const hiddenCount = Math.max(0, wallet.reasons.length - visibleReasons.length)

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1" title={wallet.reasons.join("\n")}>
      <div className="mb-1 flex flex-wrap gap-1">
        {reasonCodes.map((code) => (
          <Badge key={code} variant="outline" className="border-primary/25 bg-primary/5 font-mono text-[10px] text-primary">
            {code}
          </Badge>
        ))}
      </div>
      {visibleReasons.map((reason) => (
        <div key={reason} className="truncate text-xs text-muted-foreground">
          {reason}
        </div>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => onOpen(wallet.walletAddress)}
          className="w-fit text-xs font-medium text-primary hover:underline"
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-muted/20 p-3">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  )
}

function ReportReadyExperience({
  analysis,
  exportPath,
  onShare,
}: {
  analysis: AnalysisDetailType
  exportPath: string
  onShare: () => void
}) {
  const decision = getDecisionIntelligence(analysis)
  const completedLabel = analysis.completedAt ? formatDateTimeUTC(analysis.completedAt) : "ready now"

  return (
    <section className="glass-panel premium-card animated-border grid gap-5 rounded-2xl p-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border-green-400/30 bg-green-400/10 text-green-200">
            <CheckCircle2 className="size-3.5" />
            Report ready
          </Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 font-mono text-primary">
            {decision.proofId}
          </Badge>
          <Badge variant="outline">{analysis.riskPolicy ?? "balanced"} policy</Badge>
        </div>
        <div>
          <h2 className="text-gradient text-3xl font-semibold">Clean-list decision package is ready.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Completed {completedLabel}. Export approved wallets, keep gray-zone wallets in review, and retain reason-code evidence for customer or community questions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`${exportPath}?type=approved`} className={`${buttonVariants()} glow-primary`}>
            <ClipboardCheck data-icon="inline-start" />
            Export clean list
          </a>
          <a href={`${exportPath}?type=manual_review`} className={buttonVariants({ variant: "outline" })}>
            <Users data-icon="inline-start" />
            Review queue
          </a>
          <a href={`${exportPath}?type=pdf`} className={buttonVariants({ variant: "outline" })}>
            <FileText data-icon="inline-start" />
            PDF proof
          </a>
          <Button variant="outline" onClick={onShare}>
            <Share2 data-icon="inline-start" />
            Share report link
          </Button>
          <a
            href={buildMailto(
              "Tri-Proof Guard report review",
              `Please review this Tri-Proof Guard report:\n\n${analysis.project.name}\nApproved: ${analysis.approvedCount}\nGray zone: ${analysis.manualReviewCount}\nNot eligible: ${analysis.rejectedCount}\nProof: ${decision.proofId}`
            )}
            className={buttonVariants({ variant: "outline" })}
          >
            <Mail data-icon="inline-start" />
            Request review
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <div className="rounded-lg border border-green-400/25 bg-green-400/10 p-4">
          <p className="text-xs uppercase tracking-wide text-green-200">Approved</p>
          <p className="mt-1 text-3xl font-semibold text-green-100">{formatNumber(analysis.approvedCount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{decision.cleanRate}% of list</p>
        </div>
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-200">Gray zone</p>
          <p className="mt-1 text-3xl font-semibold text-amber-100">{formatNumber(analysis.manualReviewCount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{decision.reviewRate}% needs review</p>
        </div>
        <div className="rounded-lg border border-red-400/25 bg-red-400/10 p-4">
          <p className="text-xs uppercase tracking-wide text-red-200">Not eligible</p>
          <p className="mt-1 text-3xl font-semibold text-red-100">{formatNumber(analysis.rejectedCount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{decision.rejectRate}% excluded</p>
        </div>
      </div>
    </section>
  )
}

function DecisionCenterPanel({ analysis, exportPath }: { analysis: AnalysisDetailType; exportPath: string }) {
  const decision = getDecisionIntelligence(analysis)
  const provider = analysis.enrichment?.provider ?? analysis.wallets.find((wallet) => wallet.enrichmentProvider)?.enrichmentProvider ?? "not recorded"
  const enrichedCount = analysis.enrichment?.enrichedCount ?? analysis.wallets.filter((wallet) => wallet.enrichmentStatus === "completed").length
  const failedCount = analysis.enrichment?.failedCount ?? analysis.wallets.filter((wallet) => wallet.enrichmentStatus === "failed").length
  const coverageRate = analysis.totalWallets ? Math.round((enrichedCount / analysis.totalWallets) * 100) : 0
  const highestRisk = [...analysis.wallets].sort((left, right) => right.riskScore - left.riskScore).slice(0, 3)

  return (
    <Card className="glass-panel premium-card">
      <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="text-primary" />
            Decision Center
          </CardTitle>
          <CardDescription>
            One operational view for final export, Gray Zone review and explainable risk evidence.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`${exportPath}?type=approved`} className={`${buttonVariants()} glow-primary`}>
            <CheckCircle2 data-icon="inline-start" />
            Export clean list
          </a>
          <Link href={`/dashboard/analysis/${analysis.id}/review`} className={buttonVariants({ variant: "outline" })}>
            <Users data-icon="inline-start" />
            Resolve Gray Zone
          </Link>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-green-400/25 bg-green-400/10 p-4">
            <p className="text-xs uppercase tracking-wide text-green-200">Ready to distribute</p>
            <p className="mt-1 text-3xl font-semibold text-green-100">{formatNumber(decision.cleanWallets.length)}</p>
            <p className="mt-2 text-sm text-muted-foreground">{decision.cleanRate}% of wallets can move to the clean export.</p>
          </div>
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
            <p className="text-xs uppercase tracking-wide text-amber-200">Reviewer workload</p>
            <p className="mt-1 text-3xl font-semibold text-amber-100">{formatNumber(decision.reviewWallets.length)}</p>
            <p className="mt-2 text-sm text-muted-foreground">Gray Zone wallets should be decided before payout.</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-background/45 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Provider coverage</p>
            <p className="mt-1 text-2xl font-semibold text-primary">{coverageRate}%</p>
            <p className="mt-2 text-sm text-muted-foreground">{formatNumber(enrichedCount)} enriched, {formatNumber(failedCount)} failed via {provider}.</p>
          </div>
          <div className="rounded-lg border border-red-400/25 bg-red-400/10 p-4">
            <p className="text-xs uppercase tracking-wide text-red-200">Risk contained</p>
            <p className="mt-1 text-2xl font-semibold text-red-100">{formatNumber(decision.rejectedWallets.length)}</p>
            <p className="mt-2 text-sm text-muted-foreground">Excluded wallets stay traceable with reason codes.</p>
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/45 p-4">
            <p className="mb-3 text-sm font-medium">Top reason codes</p>
            <div className="grid gap-2">
              {decision.topReasonCodes.length ? (
                decision.topReasonCodes.map((reason) => (
                  <div key={reason.code} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-primary">{reason.code}</span>
                    <Badge variant="outline">{formatNumber(reason.count)}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No reason-code concentration found.</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-4">
            <p className="mb-3 text-sm font-medium">Highest risk wallets</p>
            <div className="grid gap-2">
              {highestRisk.map((wallet) => (
                <div key={wallet.walletAddress} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm">
                  <span className="truncate font-mono text-xs text-muted-foreground">{wallet.walletAddress}</span>
                  <Badge variant="outline" className="border-red-400/30 text-red-200">{wallet.riskScore}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PolicySimulator({ analysis }: { analysis: AnalysisDetailType }) {
  const scenarios = (["conservative", "balanced", "strict"] as const).map((policy) =>
    getPolicyScenario(analysis.wallets, policy)
  )
  const currentPolicy = analysis.riskPolicy ?? "balanced"

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="text-primary" />
          Campaign Policy Simulator
        </CardTitle>
        <CardDescription>
          Preview how stricter or looser thresholds change the operational decision list before distribution.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {scenarios.map((scenario) => (
          <div
            key={scenario.policy}
            className={cn(
              "rounded-lg border bg-background/45 p-4",
              scenario.policy === currentPolicy ? "border-primary/50 bg-primary/10" : "border-border"
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-medium">{scenario.label}</p>
              {scenario.policy === currentPolicy && <Badge variant="secondary">Current</Badge>}
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between text-green-200">
                <span>Approve</span>
                <span className="font-semibold">{formatNumber(scenario.approved)}</span>
              </div>
              <div className="flex items-center justify-between text-amber-200">
                <span>Gray zone</span>
                <span className="font-semibold">{formatNumber(scenario.manual_review)}</span>
              </div>
              <div className="flex items-center justify-between text-red-200">
                <span>Reject</span>
                <span className="font-semibold">{formatNumber(scenario.rejected)}</span>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ClusterGraphView({ analysis }: { analysis: AnalysisDetailType }) {
  const graph = getClusterGraph(analysis)

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="text-primary" />
          Cluster Graph View
        </CardTitle>
        <CardDescription>
          Visual triage map for shared funding, similar behavior, and high-risk wallet groups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!graph.length ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
            No suspicious clusters detected in this analysis.
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
            <div className="relative min-h-[320px] overflow-hidden rounded-lg border border-primary/20 bg-background/45">
              <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
                <defs>
                  <radialGradient id="clusterGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.08" />
                  </radialGradient>
                </defs>
                {graph.map((item) => (
                  <g key={item.cluster.clusterLabel}>
                    {item.wallets.map((wallet, index) => {
                      const angle = (Math.PI * 2 * index) / Math.max(item.wallets.length, 1)
                      const x = svgPoint(item.x + Math.cos(angle) * 10)
                      const y = svgPoint(item.y + Math.sin(angle) * 10)
                      return (
                        <g key={wallet.walletAddress}>
                          <line x1={item.x} y1={item.y} x2={x} y2={y} stroke="var(--primary)" strokeOpacity="0.35" />
                          <circle cx={x} cy={y} r="2.1" fill={wallet.status === "rejected" ? "var(--guard-red)" : wallet.status === "manual_review" ? "var(--guard-yellow)" : "var(--guard-green)"} />
                        </g>
                      )
                    })}
                    <circle cx={item.x} cy={item.y} r="7" fill="url(#clusterGlow)" stroke="var(--primary)" strokeOpacity="0.75" />
                  </g>
                ))}
              </svg>
            </div>
            <div className="grid gap-3">
              {graph.map((item) => (
                <div key={item.cluster.clusterLabel} className="rounded-lg border border-border bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{item.cluster.clusterLabel}</p>
                    <Badge variant="outline">{formatNumber(item.cluster.walletCount)} wallets</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Avg risk {item.cluster.averageRiskScore}. Shared source:{" "}
                    <span className="break-all font-mono text-xs">{item.cluster.sharedFundingSource ?? "mixed"}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewOpsPanel({ analysis }: { analysis: AnalysisDetailType }) {
  const summary = analysis.teamReviewSummary
  const secondReviewerCandidates = analysis.wallets.filter(
    (wallet) => wallet.status === "manual_review" && (wallet.riskLevel === "high" || wallet.riskLevel === "critical" || Boolean(wallet.clusterId))
  ).length

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="text-primary" />
          Team Review Workflow
        </CardTitle>
        <CardDescription>
          Turn gray-zone wallets into assigned, auditable team decisions before the clean list is finalized.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border bg-background/45 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
          <p className="mt-1 text-2xl font-semibold">{formatNumber(summary?.pendingReview ?? analysis.manualReviewCount)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Wallets still waiting for a team call.</p>
        </div>
        <div className="rounded-lg border border-border bg-background/45 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Reviewed</p>
          <p className="mt-1 text-2xl font-semibold">{formatNumber(summary?.reviewedWallets ?? 0)}</p>
          <p className="mt-2 text-sm text-muted-foreground">Persistent decisions saved.</p>
        </div>
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
          <p className="text-xs uppercase tracking-wide text-amber-200">Second reviewer</p>
          <p className="mt-1 text-2xl font-semibold text-amber-100">{formatNumber(secondReviewerCandidates)}</p>
          <p className="mt-2 text-sm text-muted-foreground">High-risk gray-zone candidates.</p>
        </div>
        <div className="flex flex-col justify-between rounded-lg border border-primary/25 bg-primary/10 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">Next action</p>
            <p className="mt-2 text-sm text-muted-foreground">Assign gray-zone review and save final status.</p>
          </div>
          <Link href={`/dashboard/analysis/${analysis.id}/review`} className={`${buttonVariants({ variant: "outline" })} mt-4`}>
            Open review queue
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

function IntegrationReadinessPanel() {
  const integrations = [
    [Webhook, "Webhook automation", "Receive analysis.completed events and sync decisions into your ops stack.", "/docs/webhooks"],
    [KeyRound, "API access", "Queue analysis jobs and fetch report status from campaign tooling.", "/docs/api"],
    [FileText, "Export formats", "CSV/PDF outputs for Galxe, Zealy, Discord allowlists, token ops and internal review.", "/docs"],
  ] as const

  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="text-primary" />
          Integration Readiness
        </CardTitle>
        <CardDescription>
          Connect Tri-Proof outputs to campaign tools without changing the risk methodology.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        {integrations.map(([Icon, title, text, href]) => (
          <Link key={title} href={href} className="rounded-lg border border-border bg-background/45 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
            <Icon className="mb-3 text-primary" />
            <p className="font-medium">{title}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

function TrustMethodologyPanel() {
  return (
    <Card className="glass-panel premium-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="text-primary" />
          Methodology, Privacy and ScamGuard Signals
        </CardTitle>
        <CardDescription>
          Tri-Proof is risk decision support, not KYC. ScamGuard signals can strengthen campaign safety without exposing raw personal data.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background/45 p-4">
          <p className="font-medium">No global identity claim</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Risk labels are campaign-scoped and evidence-based. They do not claim a wallet owner is definitively malicious.</p>
        </div>
        <div className="rounded-lg border border-border bg-background/45 p-4">
          <p className="font-medium">ScamGuard optional</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Use pre-sign URL, token and transaction intent checks as extra security signals while keeping wallet risk scoring separate.</p>
        </div>
        <Link href="/docs/trust" className="rounded-lg border border-primary/25 bg-primary/10 p-4 transition-colors hover:border-primary/60">
          <p className="font-medium text-primary">Open trust page</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Reason-code dictionary, privacy stance, false-positive handling and evidence boundaries.</p>
        </Link>
      </CardContent>
    </Card>
  )
}

function SortableHead({
  label,
  sortValue,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string
  sortValue: SortKey
  activeKey: SortKey
  direction: "asc" | "desc"
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = activeKey === sortValue
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown
  return (
    <TableHead
      className={className}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortValue)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded transition-colors hover:text-foreground",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </TableHead>
  )
}

function OnChainDataSection({ wallet }: { wallet: WalletRiskResult }) {
  const hasData =
    Boolean(wallet.enrichmentProvider) ||
    wallet.firstSeen != null ||
    wallet.lastSeen != null ||
    wallet.nativeBalance != null ||
    wallet.uniqueCounterparties != null ||
    wallet.isContract != null

  return (
    <DetailRow label="On-Chain Data">
      {!hasData ? (
        <p className="text-sm text-muted-foreground">
          On-chain data not available for this wallet.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailRow label="Provider">{wallet.enrichmentProvider ?? "-"}</DetailRow>
          <DetailRow label="Enrichment status">{wallet.enrichmentStatus ?? "-"}</DetailRow>
          <DetailRow label="First seen">{formatDateUTC(wallet.firstSeen)}</DetailRow>
          <DetailRow label="Last seen">{formatDateUTC(wallet.lastSeen)}</DetailRow>
          <DetailRow label="Wallet age">{wallet.walletAgeDays ?? "-"} days</DetailRow>
          <DetailRow label="Transaction count">{wallet.txCount ?? "-"}</DetailRow>
          <DetailRow label="Funding source">
            <span className="break-all font-mono text-xs">
              {wallet.fundingSource ?? "-"}
            </span>
          </DetailRow>
          <DetailRow label="Native balance">{wallet.nativeBalance ?? "-"}</DetailRow>
          <DetailRow label="Total volume">{wallet.totalVolume ?? "-"}</DetailRow>
          <DetailRow label="Contract interactions">{wallet.contractsCount ?? "-"}</DetailRow>
          <DetailRow label="Unique counterparties">
            {wallet.uniqueCounterparties ?? "-"}
          </DetailRow>
          <DetailRow label="Is contract">
            {wallet.isContract == null ? "-" : wallet.isContract ? "Yes" : "No"}
          </DetailRow>
          <DetailRow label="Known entity">
            {wallet.entityLabel
              ? `${wallet.entityLabel} (${wallet.entityType})`
              : "-"}
          </DetailRow>
        </div>
      )}
    </DetailRow>
  )
}

function ReviewDrawer({
  wallet,
  relatedWallets,
  notes,
  copied,
  onClose,
  onCopy,
  onNotesChange,
  onStatusChange,
}: {
  wallet: WalletRiskResult
  relatedWallets: WalletRiskResult[]
  notes: string
  copied: boolean
  onClose: () => void
  onCopy: (address: string) => void
  onNotesChange: (notes: string) => void
  onStatusChange: (status: WalletStatus) => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-review-heading"
    >
      <button
        type="button"
        aria-label="Close wallet review"
        className="absolute inset-0 animate-in fade-in bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full animate-in duration-300 slide-in-from-bottom flex-col overflow-y-auto border-l border-border bg-background p-5 shadow-2xl sm:max-w-xl sm:slide-in-from-right">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <StatusBadge status={wallet.status} />
              <RiskBadge level={wallet.riskLevel} />
              {isEntityReviewWallet(wallet) && (
                <Badge variant="outline" className="border-violet-400/35 bg-violet-400/10 text-violet-200">
                  Entity Review
                </Badge>
              )}
            </div>
            <h3 id="wallet-review-heading" className="text-xl font-semibold">Wallet review</h3>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {wallet.walletAddress}
            </p>
          </div>
          <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="grid gap-3">
          <DetailRow label="Full wallet address">
            <div className="flex min-w-0 items-center gap-2">
              <span className="break-all font-mono text-xs">{wallet.walletAddress}</span>
              <Button
                variant="outline"
                size="icon-xs"
                onClick={() => onCopy(wallet.walletAddress)}
                aria-label="Copy full wallet address"
                title="Copy full wallet address"
              >
                <Copy />
              </Button>
            </div>
            {copied && <div className="mt-1 text-xs text-green-300">Copied</div>}
          </DetailRow>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Chain">{wallet.chain}</DetailRow>
            <DetailRow label="Entity">
              <EntityBadges wallet={wallet} />
            </DetailRow>
            <DetailRow label="Risk score">{wallet.riskScore}</DetailRow>
            <DetailRow label="Risk level">
              <RiskBadge level={wallet.riskLevel} />
            </DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={wallet.status} />
            </DetailRow>
            <DetailRow label="Recommended action">
              <ActionBadge action={wallet.recommendedAction ?? "manual_review"} />
            </DetailRow>
            <DetailRow label="Funding source">
              <span className="break-all font-mono text-xs">
                {wallet.fundingSource ?? "-"}
              </span>
            </DetailRow>
            <DetailRow label="Cluster ID">
              <ClusterCell wallet={wallet} />
            </DetailRow>
            <DetailRow label="Transaction count">{wallet.txCount ?? "-"}</DetailRow>
            <DetailRow label="Wallet age">{wallet.walletAgeDays ?? "-"} days</DetailRow>
            <DetailRow label="Contract interactions">{wallet.contractsCount ?? "-"}</DetailRow>
            <DetailRow label="Campaign actions">{wallet.campaignActionsCount ?? "-"}</DetailRow>
          </div>

          <OnChainDataSection wallet={wallet} />

          <DetailRow label="Linked wallet evidence">
            <div className="grid gap-2">
              {relatedWallets.length ? (
                relatedWallets.slice(0, 6).map((related) => (
                  <div key={related.walletAddress} className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 px-3 py-2">
                    <span className="break-all font-mono text-xs text-muted-foreground">{shortAddress(related.walletAddress)}</span>
                    <div className="flex flex-wrap justify-end gap-1">
                      {related.clusterId === wallet.clusterId && related.clusterId && (
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">same cluster</Badge>
                      )}
                      {related.fundingSource === wallet.fundingSource && related.fundingSource && (
                        <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-200">same funding</Badge>
                      )}
                      <StatusBadge status={related.status} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No directly linked wallets found in this report.</p>
              )}
            </div>
          </DetailRow>

          <DetailRow label="Why this action?">
            <p className="text-sm text-muted-foreground">
              {wallet.statusExplanation ??
                "Status is based on risk score and contextual wallet signals."}
            </p>
          </DetailRow>

          <DetailRow label="Reason codes">
            <div className="flex flex-wrap gap-2">
              {getWalletReasonCodes(wallet).map((code) => (
                <Badge key={code} variant="outline" className="border-primary/30 bg-primary/10 font-mono text-xs text-primary">
                  {code}
                </Badge>
              ))}
            </div>
          </DetailRow>

          <DetailRow label="All risk reasons">
            <div className="flex flex-col gap-2">
              {wallet.reasons.map((reason) => (
                <div key={reason} className="rounded-md bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                  {reason}
                </div>
              ))}
            </div>
          </DetailRow>

          <DetailRow label="Audit trail">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Original Tri-Proof decision: <span className="text-foreground">{displayStatus(wallet.status)}</span></p>
              <p>Team override: <span className="text-foreground">{wallet.teamReview ? displayStatus(wallet.teamReview.finalStatus) : "not reviewed yet"}</span></p>
              <p>Reviewer: <span className="text-foreground">{wallet.teamReview?.reviewerName ?? "unassigned"}</span></p>
              <p>Updated: <span className="text-foreground">{wallet.teamReview?.updatedAt ? formatDateTimeUTC(wallet.teamReview.updatedAt) : "-"}</span></p>
            </div>
          </DetailRow>

          <DetailRow label="External proof signals">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>ScamGuard: optional Solana pre-sign risk signal, not a replacement for wallet risk scoring.</p>
              <p>External security systems: ready for wallet, token, domain or partner attestations as hashed/derived signals.</p>
            </div>
          </DetailRow>

          <DetailRow label="Notes">
            <Textarea
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Internal review note for this wallet."
              rows={4}
            />
          </DetailRow>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Button
            variant="outline"
            className="border-green-400/40 text-green-300 hover:bg-green-400/10"
            onClick={() => onStatusChange("approved")}
            title={decisionExplanation("approved")}
          >
            Mark Approved
          </Button>
          <Button
            variant="outline"
            className="border-amber-400/40 text-amber-300 hover:bg-amber-400/10"
            onClick={() => onStatusChange("manual_review")}
            title={decisionExplanation("manual_review")}
          >
            Mark Gray Zone
          </Button>
          <Button
            variant="outline"
            className="border-red-400/40 text-red-300 hover:bg-red-400/10"
            onClick={() => onStatusChange("rejected")}
            title={decisionExplanation("rejected")}
          >
            Mark Rejected / Not Eligible
          </Button>
        </div>

        <p className="mt-4 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          Tri-Proof Guard provides probabilistic risk analysis and decision support. A wallet
          being flagged does not prove malicious intent. Known exchange or service wallets are
          flagged for review because they may not represent individual reward participants. Final
          reward decisions should be made by the project team.
        </p>
      </aside>
    </div>
  )
}

export function AnalysisDetail({
  analysisId,
  initialAnalysis,
  exportBasePath,
}: AnalysisDetailProps) {
  const [analysis, setAnalysis] = useState<AnalysisDetailType | null>(
    initialAnalysis ?? null
  )
  const [loading, setLoading] = useState(Boolean(analysisId && !initialAnalysis))
  const [error, setError] = useState("")
  const [filter, setFilter] = useState<WalletFilter>("all")
  const [clusterFilter, setClusterFilter] = useState("all")
  const [entityTypeFilter, setEntityTypeFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("risk")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [copiedAddress, setCopiedAddress] = useState("")
  const { toast } = useToast()
  const handleAiBriefChange = useCallback((aiBrief: NonNullable<AnalysisDetailType["aiBrief"]>) => {
    setAnalysis((current) => (current ? { ...current, aiBrief } : current))
  }, [])

  useEffect(() => {
    if (!analysisId || initialAnalysis) return

    fetch(`/api/analysis/${analysisId}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? "Analysis not found")
        }
        return (await response.json()) as { analysis: AnalysisDetailType }
      })
      .then((body) => setAnalysis(body.analysis))
      .catch((caughtError: Error) => setError(caughtError.message))
      .finally(() => setLoading(false))
  }, [analysisId, initialAnalysis])

  const filteredWallets = useMemo(() => {
    if (!analysis) return []
    const normalizedQuery = query.trim().toLowerCase()

    return analysis.wallets.filter((wallet) => {
      const matchesFilter =
        filter === "all" ||
        wallet.status === filter ||
        wallet.riskLevel === filter ||
        (filter === "cluster_members" && Boolean(wallet.clusterId)) ||
        (filter === "known_entities" && Boolean(wallet.entityLabel)) ||
        (filter === "shared_funding" && hasSharedFundingSignal(wallet))
      const matchesCluster =
        clusterFilter === "all" || wallet.clusterId === clusterFilter
      const matchesEntityType =
        entityTypeFilter === "all" || wallet.entityType === entityTypeFilter
      const matchesQuery =
        !normalizedQuery ||
        wallet.walletAddress.toLowerCase().includes(normalizedQuery) ||
        Boolean(wallet.entityLabel?.toLowerCase().includes(normalizedQuery))
      return matchesFilter && matchesCluster && matchesEntityType && matchesQuery
    })
  }, [analysis, clusterFilter, entityTypeFilter, filter, query])

  const sortedWallets = useMemo(() => {
    const sorted = [...filteredWallets]
    const direction = sortDir === "asc" ? 1 : -1
    sorted.sort((left, right) => {
      switch (sortKey) {
        case "risk":
          return (left.riskScore - right.riskScore) * direction
        case "status":
          return (
            (statusSortOrder[left.status] - statusSortOrder[right.status]) * direction
          )
        case "cluster":
          return (
            (left.clusterId ?? "").localeCompare(right.clusterId ?? "") * direction
          )
        case "wallet":
          return left.walletAddress.localeCompare(right.walletAddress) * direction
        default:
          return 0
      }
    })
    return sorted
  }, [filteredWallets, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedWallets.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedWallets = useMemo(
    () =>
      sortedWallets.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedWallets, currentPage, pageSize]
  )

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "wallet" || key === "cluster" ? "asc" : "desc")
    }
    setPage(1)
  }

  const selectedWallet = useMemo(() => {
    if (!analysis || !selectedWalletAddress) return null
    return (
      analysis.wallets.find(
        (wallet) => wallet.walletAddress === selectedWalletAddress
      ) ?? null
    )
  }, [analysis, selectedWalletAddress])

  const selectedRelatedWallets = useMemo(() => {
    if (!analysis || !selectedWallet) return []
    return analysis.wallets.filter((wallet) => {
      if (wallet.walletAddress === selectedWallet.walletAddress) return false
      return (
        Boolean(selectedWallet.clusterId && wallet.clusterId === selectedWallet.clusterId) ||
        Boolean(selectedWallet.fundingSource && wallet.fundingSource === selectedWallet.fundingSource)
      )
    })
  }, [analysis, selectedWallet])

  function updateSelectedWalletStatus(status: WalletStatus) {
    if (!selectedWalletAddress) return

    setAnalysis((currentAnalysis) => {
      if (!currentAnalysis) return currentAnalysis

      const wallets = currentAnalysis.wallets.map((wallet) =>
        wallet.walletAddress === selectedWalletAddress ? { ...wallet, status } : wallet
      )

      return {
        ...currentAnalysis,
        wallets,
        approvedCount: wallets.filter((wallet) => wallet.status === "approved").length,
        manualReviewCount: wallets.filter((wallet) => wallet.status === "manual_review")
          .length,
        rejectedCount: wallets.filter((wallet) => wallet.status === "rejected").length,
      }
    })
    toast(`Wallet marked ${decisionLabel(status)}`)
  }

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      toast("Wallet address copied")
    } catch {
      setCopiedAddress("")
      toast("Could not copy address", "error")
    }
  }

  async function shareReport() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      toast("Report link copied")
    } catch {
      toast("Could not copy report link", "error")
    }
  }

  function clearFilters() {
    setFilter("all")
    setClusterFilter("all")
    setEntityTypeFilter("all")
    setQuery("")
    setPage(1)
  }

  if (loading) {
    return (
      <div className="flex animate-in fade-in flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="h-7 w-64 animate-pulse rounded-md bg-muted/60" />
          <div className="h-4 w-80 animate-pulse rounded-md bg-muted/40" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="glass-panel h-32 animate-pulse" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="glass-panel h-72 animate-pulse" />
          <Card className="glass-panel h-72 animate-pulse" />
        </div>
        <Card className="glass-panel h-96 animate-pulse" />
      </div>
    )
  }

  if (error || !analysis) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Analysis unavailable</CardTitle>
          <CardDescription>{error || "The requested analysis could not be loaded."}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={buttonVariants()}>
            Login
          </Link>
        </CardContent>
      </Card>
    )
  }

  const riskDistribution = (["low", "medium", "high", "critical"] as RiskLevel[]).map(
    (level) => ({
      level,
      label: `${level[0].toUpperCase()}${level.slice(1)}`,
      value: analysis.wallets.filter((wallet) => wallet.riskLevel === level).length,
      fill: riskColors[level],
    })
  )
  const knownEntitiesCount = analysis.wallets.filter((wallet) => wallet.entityLabel).length
  const exchangeServiceWalletsCount = analysis.wallets.filter(
    (wallet) => wallet.entityType === "exchange" || wallet.entityType === "service"
  ).length
  const clusterOptions = analysis.clusters.map((cluster) => cluster.clusterLabel)
  const entityTypeOptions = Array.from(
    new Set(analysis.wallets.map((wallet) => wallet.entityType).filter(Boolean))
  ).sort()

  const exportPath = exportBasePath ?? `/api/analysis/${analysis.id}/export`
  const campaignPolicy = getCampaignPolicy(analysis)
  const decisionIntelligence = getDecisionIntelligence(analysis)

  return (
    <div className="flex flex-col gap-6">
      <ReportReadyExperience analysis={analysis} exportPath={exportPath} onShare={() => void shareReport()} />
      <DecisionCenterPanel analysis={analysis} exportPath={exportPath} />
      {analysis.id !== "demo" && <AiDecisionBriefPanel
        analysisId={analysis.id}
        initialBrief={analysis.aiBrief}
        onBriefChange={handleAiBriefChange}
      />}

      <div className="sticky top-0 z-20 hidden rounded-lg border border-border bg-background/90 p-3 shadow-lg backdrop-blur md:flex md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">Distribution summary</span>
          <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">{formatNumber(analysis.approvedCount)} approved</Badge>
          <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-200">{formatNumber(analysis.manualReviewCount)} gray zone</Badge>
          <Badge variant="outline" className="border-red-400/30 bg-red-400/10 text-red-200">{formatNumber(analysis.rejectedCount)} not eligible</Badge>
        </div>
        <div className="flex gap-2">
          <a href={`${exportPath}?type=approved`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download data-icon="inline-start" />
            Clean list
          </a>
          <Link href={`/dashboard/analysis/${analysis.id}/review`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Users data-icon="inline-start" />
            Review
          </Link>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{analysis.project.campaignType}</Badge>
            <Badge variant="outline">{analysis.project.chain}</Badge>
            {analysis.project.notes?.includes("Basic CSV used") && (
              <Badge variant="outline">Basic CSV used, limited analysis mode</Badge>
            )}
          </div>
          <h2 className="text-gradient text-3xl font-semibold">{analysis.project.name}</h2>
          <p className="mt-2 text-muted-foreground">
            Created {formatDateTimeUTC(analysis.createdAt)} from {analysis.csvFileName ?? "uploaded CSV"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["approved", "Export Approved CSV"],
            ["manual_review", "Export Gray Zone CSV"],
            ["rejected", "Export Rejected / Not Eligible CSV"],
            ["full", "Export Full Report CSV"],
            ["pdf", "Export PDF Report"],
          ].map(([type, label]) => (
            <a
              key={type}
              href={`${exportPath}?type=${type}`}
              onClick={() =>
                toast(
                  type === "pdf"
                    ? "Generating PDF report…"
                    : `Exporting ${label.replace("Export ", "")}…`,
                  "info"
                )
              }
              className={cn(
                buttonVariants({ variant: type === "pdf" ? "default" : "outline" }),
                type === "pdf" && "glow-primary"
              )}
            >
              {type === "pdf" ? <FileText data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {label}
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total wallets"
          value={formatNumber(analysis.totalWallets)}
          description="Valid rows included in scoring."
          icon={WalletCards}
        />
        <MetricCard
          title="Approved"
          value={formatNumber(analysis.approvedCount)}
          description="Suggested clean reward list."
          icon={CheckCircle2}
        />
        <MetricCard
          title="Gray Zone"
          value={formatNumber(analysis.manualReviewCount)}
          description={decisionExplanation("manual_review")}
          icon={AlertTriangle}
        />
        <MetricCard
          title="Rejected / Not Eligible"
          value={formatNumber(analysis.rejectedCount)}
          description={decisionExplanation("rejected")}
          icon={ShieldX}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <MetricCard
          title="Average risk"
          value={String(analysis.averageRiskScore)}
          description="0 to 100 scoring scale."
          icon={Gauge}
        />
        <MetricCard
          title="Suspicious clusters"
          value={formatNumber(analysis.suspiciousClustersCount)}
          description="Funding and behavior groups."
          icon={Layers3}
        />
        <MetricCard
          title="Known Entities"
          value={formatNumber(knownEntitiesCount)}
          description={`${formatNumber(exchangeServiceWalletsCount)} exchange / service wallets.`}
          icon={Landmark}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle>Campaign Decision Engine</CardTitle>
            <CardDescription>
              {campaignPolicy.label} for {campaignPolicy.scope}. These thresholds turn wallet evidence into approve, Gray Zone and reject lists.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {campaignPolicy.rules.map((rule) => (
              <div key={rule.label} className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{rule.label}</p>
                <p className="mt-1 text-2xl font-semibold text-primary">{rule.value}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{rule.detail}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>Clean List Proof</CardTitle>
            <CardDescription>
              Campaign-scoped proof package. It is not a global identity record and does not require raw personal data.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-green-400/25 bg-green-400/10 p-4">
              <p className="text-xs uppercase tracking-wide text-green-200">Clean list</p>
              <p className="mt-1 text-2xl font-semibold text-green-200">{decisionIntelligence.cleanRate}%</p>
              <p className="mt-2 text-sm text-muted-foreground">{formatNumber(decisionIntelligence.cleanWallets.length)} wallets approved.</p>
            </div>
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-200">Review queue</p>
              <p className="mt-1 text-2xl font-semibold text-amber-200">{decisionIntelligence.reviewRate}%</p>
              <p className="mt-2 text-sm text-muted-foreground">{formatNumber(decisionIntelligence.reviewWallets.length)} wallets need a team call.</p>
            </div>
            <div className="rounded-lg border border-red-400/25 bg-red-400/10 p-4">
              <p className="text-xs uppercase tracking-wide text-red-200">Excluded</p>
              <p className="mt-1 text-2xl font-semibold text-red-200">{decisionIntelligence.rejectRate}%</p>
              <p className="mt-2 text-sm text-muted-foreground">{formatNumber(decisionIntelligence.rejectedWallets.length)} wallets rejected.</p>
            </div>
            <div className="rounded-lg border border-primary/20 bg-background/45 p-4 sm:col-span-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Proof ID</p>
              <p className="mt-1 break-all font-mono text-sm text-primary">{decisionIntelligence.proofId}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {formatNumber(decisionIntelligence.clusteredWallets)} clustered wallets and top reason codes are retained for explainable customer review.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>Explainable Reason Codes</CardTitle>
          <CardDescription>
            Human-readable evidence is normalized into compact codes for API responses, clean-list exports and Gray Zone review.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {decisionIntelligence.topReasonCodes.map((item) => (
            <div key={item.code} className="rounded-lg border border-border bg-background/45 p-4">
              <p className="break-all font-mono text-xs text-primary">{item.code}</p>
              <p className="mt-2 text-2xl font-semibold">{formatNumber(item.count)}</p>
              <p className="text-xs text-muted-foreground">wallets</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <PolicySimulator analysis={analysis} />
        <ClusterGraphView analysis={analysis} />
      </div>

      <CampaignIntegrityPanel graph={analysis.graph} totalWallets={analysis.totalWallets} />

      {analysis.id !== "demo" && <WalletGraphIntelligencePanel analysisId={analysis.id} summary={analysis.graph} />}

      <ReviewOpsPanel analysis={analysis} />

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <IntegrationReadinessPanel />
        <TrustMethodologyPanel />
      </div>

      {analysis.enrichment && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <MetricCard
              title="Enrichment status"
              value={analysis.enrichment.usedMockFallback ? "Mock fallback" : "Completed"}
              description={`Mode: ${analysis.enrichment.mode.replace("_", " ")}.`}
              icon={Layers3}
            />
            <MetricCard
              title="Provider used"
              value={analysis.enrichment.provider}
              description="Primary on-chain data source."
              icon={Landmark}
            />
            <MetricCard
              title="Enriched wallets"
              value={formatNumber(analysis.enrichment.enrichedCount)}
              description="Wallets with on-chain data."
              icon={CheckCircle2}
            />
            <MetricCard
              title="No On-chain Data"
              value={formatNumber(analysis.enrichment.failedCount)}
              description="No reliable on-chain history found."
              icon={AlertTriangle}
            />
            <MetricCard
              title="Cache hits"
              value={formatNumber(analysis.enrichment.cacheHits)}
              description="Reused recent enrichment."
              icon={RotateCcw}
            />
          </div>

          {analysis.enrichment.warnings.length > 0 && (
            <Card className="border-amber-400/30 bg-amber-400/5">
              <CardContent className="flex items-start gap-3 p-4 text-sm text-amber-200/90">
                <AlertTriangle className="mt-0.5 text-amber-300" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-amber-200">Completed with warnings</span>
                  {analysis.enrichment.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card className="border-primary/25 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Gauge className="mt-0.5 text-primary" />
          <p>
            Risk Score is the numeric risk signal. Status is the operational decision
            recommendation and also considers contextual signals such as known entities,
            suspicious clusters and shared funding sources.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Risk Distribution</CardTitle>
            <CardDescription>
              Wallets grouped by risk level based on score and contextual signals.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.totalWallets ? (
              <div className="grid items-center gap-4 md:grid-cols-[1fr_170px]">
                <ChartContainer
                  config={{
                    low: { label: "Low", color: riskColors.low },
                    medium: { label: "Medium", color: riskColors.medium },
                    high: { label: "High", color: riskColors.high },
                    critical: { label: "Critical", color: riskColors.critical },
                  }}
                  className="mx-auto h-[260px]"
                >
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                    <Pie data={riskDistribution} dataKey="value" nameKey="label" innerRadius={58} outerRadius={92}>
                      {riskDistribution.map((entry) => (
                        <Cell key={entry.level} fill={entry.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="grid gap-2 text-sm">
                  {riskDistribution.map((entry) => (
                    <div key={entry.level} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
                        <span>{entry.label}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {entry.value} / {Math.round((entry.value / analysis.totalWallets) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
                No wallet risk levels available yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Cluster severity</CardTitle>
            <CardDescription>Top suspicious clusters by average risk score.</CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.clusters.length ? (
              <ChartContainer
                config={{ averageRiskScore: { label: "Average risk", color: "var(--primary)" } }}
                className="h-[260px]"
              >
                <BarChart data={analysis.clusters.slice(0, 8)} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="clusterLabel" tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="averageRiskScore" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[260px] flex-col justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6">
                <div className="text-base font-medium">
                  No suspicious clusters detected in this analysis.
                </div>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Clusters are created when multiple wallets share funding sources or similar campaign behavior.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {analysis.clusters.length > 0 && (
        <section className="grid gap-4 xl:grid-cols-2">
          {analysis.clusters.map((cluster) => (
            <Card key={cluster.clusterLabel} className="glass-panel transition-colors hover:border-primary/45">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>{cluster.clusterLabel}</CardTitle>
                    <CardDescription>
                      {formatNumber(cluster.walletCount)} linked wallets
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ActionBadge action={cluster.suggestedAction} />
                    <p className="max-w-[200px] text-right text-xs text-muted-foreground">
                      {cluster.suggestedAction === "reject"
                        ? "Severe cluster with high average risk and strong similarity signals."
                        : "Cluster requires project team review due to shared funding or similar behavior."}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Average risk score">{cluster.averageRiskScore}</DetailRow>
                <DetailRow label="Behavior similarity">
                  {cluster.behaviorSimilarityScore >= 80
                    ? "High"
                    : cluster.behaviorSimilarityScore >= 55
                      ? "Medium"
                      : "Low"}{" "}
                  ({cluster.behaviorSimilarityScore}%)
                </DetailRow>
                <DetailRow label="Shared funding source">
                  <span className="break-all font-mono text-xs">
                    {cluster.sharedFundingSource ?? "No single shared source"}
                  </span>
                </DetailRow>
                <DetailRow label="Top reasons">
                  <div className="flex flex-wrap gap-2">
                    {cluster.reasons.slice(0, 3).map((reason) => (
                      <Badge key={reason} variant="outline">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </DetailRow>
                <div className="md:col-span-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilter("all")
                      setClusterFilter(cluster.clusterLabel)
                      setPage(1)
                    }}
                  >
                    View wallets in this cluster
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Wallet table</CardTitle>
          <CardDescription>Search, filter and review scored wallet-level reasons.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[minmax(180px,220px)_1fr_minmax(160px,200px)_minmax(160px,200px)_auto]">
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as WalletFilter)
                setPage(1)
              }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Search wallet address"
                className="pl-10"
              />
            </div>
            <select
              value={clusterFilter}
              onChange={(event) => {
                setClusterFilter(event.target.value)
                setPage(1)
              }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All clusters</option>
              {clusterOptions.map((clusterLabel) => (
                <option key={clusterLabel} value={clusterLabel}>
                  {clusterLabel}
                </option>
              ))}
            </select>
            <select
              value={entityTypeFilter}
              onChange={(event) => {
                setEntityTypeFilter(event.target.value)
                setPage(1)
              }}
              className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="all">All entity types</option>
              {entityTypeOptions.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {displayEntityType(entityType as EntityType)}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={clearFilters}>
              <RotateCcw data-icon="inline-start" />
              Clear
            </Button>
          </div>

          <div className="max-h-[640px] overflow-auto rounded-lg border border-border">
            <Table className="min-w-[760px] table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <TableRow>
                  <SortableHead
                    label="Wallet"
                    sortValue="wallet"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="w-[16%]"
                  />
                  <TableHead className="w-[16%]">Entity</TableHead>
                  <SortableHead
                    label="Risk"
                    sortValue="risk"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="w-[14%]"
                  />
                  <SortableHead
                    label="Status"
                    sortValue="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="w-[14%]"
                  />
                  <TableHead className="w-[20%]">Signals</TableHead>
                  <SortableHead
                    label="Cluster"
                    sortValue="cluster"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="w-[10%]"
                  />
                  <TableHead className="w-[10%] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedWallets.map((wallet) => (
                  <TableRow
                    key={wallet.walletAddress}
                    className={cn(
                      rowToneClass(wallet.status),
                      "animate-in fade-in"
                    )}
                  >
                    <TableCell className="whitespace-normal">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {shortAddress(wallet.walletAddress)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => void copyAddress(wallet.walletAddress)}
                          aria-label="Copy full wallet address"
                          title="Copy full wallet address"
                        >
                          <Copy />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <EntityBadges wallet={wallet} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <RiskCell wallet={wallet} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={wallet.status} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ReasonSummary
                        wallet={wallet}
                        onOpen={(walletAddress) => setSelectedWalletAddress(walletAddress)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ClusterCell wallet={wallet} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedWalletAddress(wallet.walletAddress)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!sortedWallets.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="whitespace-normal py-12 text-center">
                      <div className="flex animate-in fade-in flex-col items-center gap-3 text-muted-foreground">
                        <span className="flex size-12 items-center justify-center rounded-full border border-border bg-muted/40">
                          <Search className="size-5" aria-hidden />
                        </span>
                        <div>
                          <p className="font-medium text-foreground">No wallets match the current filters</p>
                          <p className="text-sm">Try clearing filters or adjusting your search.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          <RotateCcw data-icon="inline-start" />
                          Clear filters
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {sortedWallets.length === 0
                ? "No matching wallets."
                : `Showing ${formatNumber(
                    (currentPage - 1) * pageSize +
                    1
                  )}-${formatNumber(Math.min(
                    currentPage * pageSize,
                    sortedWallets.length
                  ))} of ${formatNumber(sortedWallets.length)} matching wallets.`}
            </p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setPage(1)
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label="Rows per page"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-[88px] text-center text-xs text-muted-foreground tabular-nums">
                  Page {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-muted/25">
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <Users className="mt-0.5 text-primary" />
          <p>
            Tri-Proof Guard provides risk analysis and decision support. It does not guarantee
            that a wallet is definitively a bot or a human. Final reward decisions should be
            made by the project team. Known public exchange/service wallet detected. This address
            is not necessarily malicious, but it is not a typical individual reward campaign
            participant and should be manually reviewed.
          </p>
        </CardContent>
      </Card>

      {selectedWallet && (
        <ReviewDrawer
          wallet={selectedWallet}
          relatedWallets={selectedRelatedWallets}
          notes={reviewNotes[selectedWallet.walletAddress] ?? ""}
          copied={copiedAddress === selectedWallet.walletAddress}
          onClose={() => setSelectedWalletAddress(null)}
          onCopy={(address) => void copyAddress(address)}
          onNotesChange={(notes) =>
            setReviewNotes((currentNotes) => ({
              ...currentNotes,
              [selectedWallet.walletAddress]: notes,
            }))
          }
          onStatusChange={updateSelectedWalletStatus}
        />
      )}
    </div>
  )
}
