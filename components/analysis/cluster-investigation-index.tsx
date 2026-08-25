"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { AlertTriangle, ArrowLeft, GitBranch, GitCompareArrows, Network, RotateCcw, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber } from "@/lib/format"
import type { AnalysisDetail } from "@/types"

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function actionClass(action: string) {
  if (action === "reject") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (action === "manual_review") return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  return "border-green-400/35 bg-green-400/10 text-green-200"
}

export function ClusterInvestigationIndex({ analysisId }: { analysisId: string }) {
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/analysis/${analysisId}`, { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as { analysis?: AnalysisDetail; error?: string }
      if (!response.ok || !body.analysis) throw new Error(body.error ?? "Analysis could not be loaded")
      setAnalysis(body.analysis)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Analysis could not be loaded")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [analysisId])

  if (loading) {
    return (
      <Card className="glass-panel premium-card">
        <CardContent className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
          <RotateCcw className="size-4 animate-spin" /> Loading cluster investigations…
        </CardContent>
      </Card>
    )
  }

  if (error || !analysis) {
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader><CardTitle>Cluster investigations unavailable</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{error || "Analysis could not be loaded."}</p>
          <Button variant="outline" onClick={() => void load()}><RotateCcw data-icon="inline-start" /> Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8">
      <section className="dashboard-hero reveal-up rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 gap-2 border-primary/30 text-primary"><Network className="size-3.5" /> Cluster Investigation</Badge>
            <h1 className="text-gradient text-3xl font-semibold sm:text-4xl">{analysis.project.name}</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Open a stored cluster to inspect the original grouping basis, member decisions, canonical funding provenance, graph relationships, and timeline.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {analysis.clusters.length >= 2 && (
              <Link href={`/dashboard/analysis/${analysis.id}/clusters/compare`} className={buttonVariants({ variant: "default" })}>
                <GitCompareArrows data-icon="inline-start" /> Compare clusters
              </Link>
            )}
            <Link href={`/dashboard/analysis/${analysis.id}`} className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft data-icon="inline-start" /> Back to analysis
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="glass-panel premium-card"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Clusters</p><p className="mt-2 text-2xl font-semibold">{formatNumber(analysis.clusters.length)}</p></CardContent></Card>
        <Card className="glass-panel premium-card"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Cluster members</p><p className="mt-2 text-2xl font-semibold">{formatNumber(analysis.wallets.filter((wallet) => wallet.clusterId).length)}</p></CardContent></Card>
        <Card className="glass-panel premium-card"><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Risk policy</p><p className="mt-2 text-2xl font-semibold">{title(analysis.riskPolicy ?? "balanced")}</p></CardContent></Card>
      </section>

      {analysis.clusters.length > 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {analysis.clusters.map((cluster) => {
            const members = analysis.wallets.filter((wallet) => wallet.clusterId === cluster.clusterLabel)
            const familyReasons = cluster.reasons.filter((reason) => /^(Funding|Temporal|Behavior|Referral|Campaign) evidence:/.test(reason))
            return (
              <Card key={cluster.clusterLabel} className="glass-panel premium-card transition hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2"><GitBranch className="size-5 text-primary" /> {cluster.clusterLabel}</CardTitle>
                      <CardDescription className="mt-2">{cluster.walletCount} stored members · average risk {cluster.averageRiskScore}</CardDescription>
                    </div>
                    <Badge variant="outline" className={actionClass(cluster.suggestedAction)}>{title(cluster.suggestedAction)}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1"><Users className="size-3" /> {members.length} wallets</Badge>
                    <Badge variant="outline">Behavior similarity {cluster.behaviorSimilarityScore}%</Badge>
                    {cluster.sharedFundingSource && <Badge variant="outline">Shared funding</Badge>}
                  </div>
                  <div className="space-y-2">
                    {familyReasons.slice(0, 4).map((reason) => <p key={reason} className="text-xs leading-relaxed text-muted-foreground">• {reason}</p>)}
                    {!familyReasons.length && <p className="text-xs text-muted-foreground">Stored family-level grouping reasons are not available in this record.</p>}
                  </div>
                  <Link
                    href={`/dashboard/analysis/${analysis.id}/clusters/${encodeURIComponent(cluster.clusterLabel)}`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Investigate cluster
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </section>
      ) : (
        <Card className="glass-panel premium-card border-green-400/20">
          <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-5 text-green-300" />
            This analysis has no stored suspicious clusters. The workspace does not manufacture clusters from weak standalone signals.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
