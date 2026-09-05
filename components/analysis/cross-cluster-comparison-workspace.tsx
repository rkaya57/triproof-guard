"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  GitCompareArrows,
  Network,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type {
  ClusterComparisonItem,
  CrossClusterComparisonReport,
} from "@/lib/cluster-investigation/comparison"
import { MAX_COMPARED_CLUSTERS } from "@/lib/cluster-investigation/comparison"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { AnalysisDetail } from "@/types"

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function actionClass(action: string) {
  if (action === "reject") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (action === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

function ClusterSummaryCard({ cluster }: { cluster: ClusterComparisonItem }) {
  return (
    <Card className="glass-panel premium-card min-w-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{cluster.clusterLabel}</CardTitle>
            <CardDescription className="mt-1">{cluster.walletCount} stored members</CardDescription>
          </div>
          <Badge variant="outline" className={actionClass(cluster.suggestedAction)}>{title(cluster.suggestedAction)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg risk</p>
            <p className="mt-1 text-xl font-semibold">{cluster.averageRiskScore}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/45 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Behavior similarity</p>
            <p className="mt-1 text-xl font-semibold">{cluster.behaviorSimilarityScore}%</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium">Stored grouping families</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cluster.groupingFamilies.map((family) => <Badge key={family} variant="secondary" className="text-[10px]">{title(family)}</Badge>)}
            {!cluster.groupingFamilies.length && <span className="text-xs text-muted-foreground">Not exposed in stored reasons</span>}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium">Wallet decisions</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-green-400/30 text-green-200">Approve {cluster.statusCounts.approved}</Badge>
            <Badge variant="outline" className="border-amber-400/30 text-amber-200">Review {cluster.statusCounts.manual_review}</Badge>
            <Badge variant="outline" className="border-red-400/30 text-red-200">Reject {cluster.statusCounts.rejected}</Badge>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-muted-foreground">
          <p>Funding sources in context: {cluster.fundingSources.length}</p>
          <p>Graph components: {cluster.graphComponentIds.length}</p>
          <p>Team-reviewed members: {cluster.teamReviewedCount}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function CrossClusterComparisonWorkspace({ analysisId }: { analysisId: string }) {
  return <CrossClusterComparisonContent key={analysisId} analysisId={analysisId} />
}

function CrossClusterComparisonContent({ analysisId }: { analysisId: string }) {
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [report, setReport] = useState<CrossClusterComparisonReport | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    async function load() {
      setLoadingAnalysis(true)
      try {
        const response = await fetch(`/api/analysis/${analysisId}`, { cache: "no-store" })
        const body = (await response.json().catch(() => ({}))) as { analysis?: AnalysisDetail; error?: string }
        if (!response.ok || !body.analysis) throw new Error(body.error ?? "Analysis could not be loaded")
        if (!active) return
        setAnalysis(body.analysis)
        setSelected(body.analysis.clusters.slice(0, 2).map((cluster) => cluster.clusterLabel))
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Analysis could not be loaded")
      } finally {
        if (active) setLoadingAnalysis(false)
      }
    }
    void load()
    return () => { active = false }
  }, [analysisId])

  useEffect(() => {
    if (selected.length < 2) return
    let active = true
    async function compare() {
      setComparing(true)
      setError("")
      try {
        const params = new URLSearchParams()
        selected.forEach((cluster) => params.append("cluster", cluster))
        const response = await fetch(`/api/analysis/${analysisId}/clusters/compare?${params.toString()}`, { cache: "no-store" })
        const body = (await response.json().catch(() => ({}))) as { report?: CrossClusterComparisonReport; error?: string }
        if (!response.ok || !body.report) throw new Error(body.error ?? "Clusters could not be compared")
        if (active) setReport(body.report)
      } catch (compareError) {
        if (active) {
          setReport(null)
          setError(compareError instanceof Error ? compareError.message : "Clusters could not be compared")
        }
      } finally {
        if (active) setComparing(false)
      }
    }
    void compare()
    return () => { active = false }
  }, [analysisId, selected])

  const visibleClusters = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (analysis?.clusters ?? []).filter((cluster) =>
      !normalized ||
      cluster.clusterLabel.toLowerCase().includes(normalized) ||
      cluster.reasons.some((reason) => reason.toLowerCase().includes(normalized)),
    )
  }, [analysis?.clusters, query])

  function toggleCluster(clusterLabel: string) {
    if (!selected.includes(clusterLabel) && selected.length >= MAX_COMPARED_CLUSTERS) return
    setReport(null)
    setComparing(false)
    setError("")
    setSelected(selected.includes(clusterLabel)
      ? selected.filter((label) => label !== clusterLabel)
      : [...selected, clusterLabel])
  }

  if (loadingAnalysis) {
    return (
      <Card className="glass-panel premium-card">
        <CardContent className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
          <RotateCcw className="size-4 animate-spin" /> Loading clusters…
        </CardContent>
      </Card>
    )
  }

  if (!analysis) {
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardContent className="p-8 text-sm text-muted-foreground">{error || "Analysis could not be loaded."}</CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary">
              <GitCompareArrows className="size-3.5" /> Cross-Cluster Comparison v1
            </Badge>
            <h1 className="text-gradient text-3xl font-semibold sm:text-4xl">Compare investigation context</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Compare up to {MAX_COMPARED_CLUSTERS} stored clusters without merging or rescoring them. Shared context is descriptive, not proof of a common controller.
            </p>
          </div>
          <Link href={`/dashboard/analysis/${analysisId}/clusters`} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft data-icon="inline-start" /> Cluster investigations
          </Link>
        </div>
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" /> Select clusters</CardTitle>
          <CardDescription>Select 2–{MAX_COMPARED_CLUSTERS} stored clusters. Changes refresh the comparison automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cluster or stored grouping reason..." className="pl-9" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleClusters.map((cluster) => {
              const checked = selected.includes(cluster.clusterLabel)
              const disabled = !checked && selected.length >= MAX_COMPARED_CLUSTERS
              return (
                <button
                  key={cluster.clusterLabel}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleCluster(cluster.clusterLabel)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    checked ? "border-primary bg-primary/10" : "border-border bg-background/45 hover:border-primary/40",
                    disabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{cluster.clusterLabel}</span>
                    <Badge variant="outline">{cluster.walletCount}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Avg risk {cluster.averageRiskScore} · similarity {cluster.behaviorSimilarityScore}%</p>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{selected.length} selected</span>
            {selected.map((label) => <Badge key={label} variant="secondary">{label}</Badge>)}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" /> {error}
        </div>
      )}

      {comparing && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background/45 p-4 text-sm text-muted-foreground">
          <RotateCcw className="size-4 animate-spin" /> Recomputing the read-only comparison…
        </div>
      )}

      {report && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {report.clusters.map((cluster) => <ClusterSummaryCard key={cluster.clusterLabel} cluster={cluster} />)}
          </section>

          <Card className="glass-panel premium-card border-violet-400/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Network className="size-5 text-violet-300" /> Common context across every selected cluster</CardTitle>
              <CardDescription>Only intersections present in all selected stored clusters are shown here.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium">Grouping families</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.common.groupingFamilies.map((family) => <Badge key={family} variant="secondary">{title(family)}</Badge>)}
                  {!report.common.groupingFamilies.length && <span className="text-xs text-muted-foreground">No family common to all</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium">Funding sources</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.common.fundingSources.slice(0, 8).map((source) => <Badge key={source} variant="outline" className="max-w-full truncate font-mono text-[10px]">{source}</Badge>)}
                  {!report.common.fundingSources.length && <span className="text-xs text-muted-foreground">No source common to all</span>}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium">Graph components</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.common.graphComponentIds.map((component) => <Badge key={component} variant="outline">{component}</Badge>)}
                  {!report.common.graphComponentIds.length && <span className="text-xs text-muted-foreground">No component common to all</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle>Pairwise deltas</CardTitle>
              <CardDescription>Pair-level overlap and metric distance; no synthetic relationship is created.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {report.pairwise.map((pair) => (
                <div key={`${pair.leftClusterLabel}:${pair.rightClusterLabel}`} className="rounded-xl border border-border bg-background/45 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{pair.leftClusterLabel}</Badge>
                    <span className="text-xs text-muted-foreground">vs</span>
                    <Badge variant="outline">{pair.rightClusterLabel}</Badge>
                    {pair.sameSuggestedAction && <Badge variant="secondary">Same action</Badge>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Avg risk delta</p><p className="mt-1 font-semibold">{pair.averageRiskScoreDelta}</p></div>
                    <div><p className="text-xs text-muted-foreground">Similarity delta</p><p className="mt-1 font-semibold">{pair.behaviorSimilarityDelta} pts</p></div>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <p>Shared grouping families: {pair.sharedGroupingFamilies.length ? pair.sharedGroupingFamilies.map(title).join(", ") : "none"}</p>
                    <p>Shared funding sources: {formatNumber(pair.sharedFundingSources.length)}</p>
                    <p>Shared graph components: {pair.sharedGraphComponentIds.length ? pair.sharedGraphComponentIds.join(", ") : "none"}</p>
                    <p>Shared members: {formatNumber(pair.sharedMemberWallets.length)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-amber-400/20 bg-amber-400/5">
            <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <div className="space-y-1.5">
                {report.caveats.map((caveat) => <p key={caveat}>• {caveat}</p>)}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!report && selected.length < 2 && (
        <Card className="glass-panel premium-card">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Select at least two clusters to compare.</CardContent>
        </Card>
      )}
    </div>
  )
}
