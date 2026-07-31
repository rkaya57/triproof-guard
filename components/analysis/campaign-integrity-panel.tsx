import { Activity, AlertTriangle, CircleDot, GitBranch, ShieldCheck, UsersRound } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buildCampaignIntegritySnapshot, type CampaignIntegrityHealth } from "@/lib/campaign-integrity"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { ClusterResult, WalletGraphSummary } from "@/types"

const healthStyles: Record<CampaignIntegrityHealth, string> = {
  strong: "border-green-400/30 bg-green-400/10 text-green-200",
  review: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  at_risk: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
  unavailable: "border-border bg-background/55 text-muted-foreground",
}

const scoreStyles: Record<CampaignIntegrityHealth, string> = {
  strong: "border-green-400/35 text-green-200",
  review: "border-amber-400/35 text-amber-200",
  at_risk: "border-orange-400/35 text-orange-200",
  critical: "border-red-400/35 text-red-200",
  unavailable: "border-border text-muted-foreground",
}

function styleForSeverity(severity: "info" | "caution" | "high" | "critical") {
  if (severity === "info") return healthStyles.strong
  if (severity === "caution") return healthStyles.review
  if (severity === "high") return healthStyles.at_risk
  return healthStyles.critical
}

export function CampaignIntegrityPanel({ graph, totalWallets, clusters }: { graph: WalletGraphSummary | null | undefined; totalWallets: number; clusters: ClusterResult[] }) {
  const snapshot = buildCampaignIntegritySnapshot(graph, totalWallets, clusters)

  return <Card className="glass-panel premium-card overflow-hidden">
    <CardHeader className="border-b border-border/70 bg-primary/[0.035]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary"><ShieldCheck className="size-4" /> Campaign Integrity</div>
          <CardTitle>Campaign Integrity Intelligence</CardTitle>
          <CardDescription className="mt-2 max-w-3xl leading-6">Review referral, task-timing, privacy-preserving participant, funding, and wallet evidence together. A single signal is never abuse on its own.</CardDescription>
        </div>
        <Badge variant="outline" className={cn("w-fit", healthStyles[snapshot.health])}>{snapshot.label}</Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-5 p-5">
      {!snapshot.available ? <div className="grid gap-4 rounded-lg border border-dashed border-border bg-background/40 p-5 lg:grid-cols-[auto_1fr] lg:items-center"><div className="grid size-14 place-items-center rounded-full border border-border bg-background/70"><GitBranch className="size-6 text-muted-foreground" /></div><div><p className="font-medium">Add referral context to activate this view</p><p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{snapshot.summary}</p><p className="mt-3 font-mono text-xs text-primary">referrer_address · referral_code · referral_timestamp</p></div></div> : <>
        <div className="grid gap-4 xl:grid-cols-[190px_1fr]">
          <div className={cn("grid aspect-square max-w-[190px] place-items-center rounded-full border-8 bg-background/55", scoreStyles[snapshot.health])}><div className="text-center"><p className="text-5xl font-semibold tabular-nums">{snapshot.score}</p><p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">Integrity score</p></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><Metric icon={GitBranch} label="Referral links" value={formatNumber(snapshot.referralLinks)} description="Campaign-supplied links" /><Metric icon={AlertTriangle} label="Affected wallets" value={formatNumber(snapshot.affectedWalletCount)} description="High-priority evidence only" /><Metric icon={UsersRound} label="Priority cohorts" value={formatNumber(snapshot.priorityCohorts.length)} description="Referrer-led graph components" /><div className="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:col-span-3"><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-primary"><Activity className="size-3.5" /> Evidence summary</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{snapshot.summary}</p></div></div>
        </div>
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section aria-labelledby="referral-cohorts-title"><div className="mb-3 flex items-center justify-between gap-3"><h3 id="referral-cohorts-title" className="font-medium">Priority referral cohorts</h3><span className="text-xs text-muted-foreground">Highest graph risk first</span></div><div className="space-y-3">{snapshot.priorityCohorts.map((cohort) => <div key={cohort.componentId} className="rounded-lg border border-border bg-background/45 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-primary">{cohort.componentId}</p><p className="mt-1 text-sm font-medium">{cohort.dominantReferrer}</p></div><Badge variant="outline" className={styleForSeverity(cohort.severity)}>{cohort.riskScore}/100</Badge></div><p className="mt-3 text-sm text-muted-foreground">{formatNumber(cohort.walletAddresses.length)} linked wallet{cohort.walletAddresses.length === 1 ? "" : "s"} · {cohort.reasons.slice(0, 2).join(" · ") || "Graph evidence available"}</p></div>)}{!snapshot.priorityCohorts.length && <EmptyState text="No referrer-led cohort was recorded in this campaign graph." />}</div></section>
          <section aria-labelledby="referral-signals-title"><div className="mb-3 flex items-center justify-between gap-3"><h3 id="referral-signals-title" className="font-medium">Referral evidence</h3><span className="text-xs text-muted-foreground">Explainable, not automatic exclusion</span></div><div className="space-y-3">{snapshot.signals.map((signal) => <div key={`${signal.code}:${signal.nodeKey}`} className="rounded-lg border border-border bg-background/45 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{signal.title}</p><p className="mt-1 font-mono text-[11px] text-primary">{signal.code}</p></div><Badge variant="outline" className={styleForSeverity(signal.severity)}>{signal.severity}</Badge></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{signal.description}</p><p className="mt-2 text-xs text-muted-foreground">{formatNumber(signal.affectedWalletCount)} linked wallet{signal.affectedWalletCount === 1 ? "" : "s"} · {formatNumber(signal.evidenceCount)} evidence observation{signal.evidenceCount === 1 ? "" : "s"}</p></div>)}{!snapshot.signals.length && <EmptyState text="Referral links were recorded, but no referral pattern needs special review yet." />}</div></section>
        </div>
        {snapshot.campaignEvidenceCohorts.length > 0 && <section aria-labelledby="campaign-cohorts-title"><div className="mb-3 flex items-center justify-between gap-3"><h3 id="campaign-cohorts-title" className="font-medium">Corroborated campaign cohorts</h3><span className="text-xs text-muted-foreground">Two independent signal families required</span></div><div className="grid gap-3 lg:grid-cols-2">{snapshot.campaignEvidenceCohorts.map((cohort) => <div key={cohort.clusterLabel} className="rounded-lg border border-border bg-background/45 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-primary">{cohort.clusterLabel}</p><p className="mt-1 text-sm font-medium">{formatNumber(cohort.walletCount)} linked wallets</p></div><Badge variant="outline" className={cohort.behaviorSimilarityScore >= 80 ? healthStyles.at_risk : healthStyles.review}>{cohort.behaviorSimilarityScore}% similarity</Badge></div><p className="mt-3 text-sm text-muted-foreground">{cohort.reasons.slice(0, 2).join(" / ")}</p></div>)}</div></section>}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Recommended review path</p><ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">{snapshot.recommendations.map((recommendation) => <li key={recommendation} className="flex gap-2"><CircleDot className="mt-1 size-3.5 shrink-0 text-primary" />{recommendation}</li>)}</ul></div>
      </>}
    </CardContent>
  </Card>
}

function Metric({ icon: Icon, label, value, description }: { icon: typeof GitBranch; label: string; value: string; description: string }) {
  return <div className="rounded-lg border border-border bg-background/45 p-4"><Icon className="size-4 text-primary" /><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p><p className="text-xs font-medium text-foreground">{label}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-border bg-background/35 p-4 text-sm leading-6 text-muted-foreground">{text}</div>
}
