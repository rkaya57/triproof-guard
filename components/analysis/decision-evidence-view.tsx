"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Search,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  AnalysisDetail,
  DecisionEvidenceConfidence,
  DecisionEvidenceEffect,
  DecisionEvidenceFamily,
  WalletRiskResult,
  WalletStatus,
} from "@/types"

type DecisionEvidenceViewProps = {
  analysisId: string
}

type StatusFilter = "all" | WalletStatus
type ConfidenceFilter = "all" | DecisionEvidenceConfidence

const statusOrder: Record<WalletStatus, number> = {
  rejected: 3,
  manual_review: 2,
  approved: 1,
}

const statusLabels: Record<WalletStatus, string> = {
  approved: "Approved",
  manual_review: "Gray Zone",
  rejected: "Rejected / Not Eligible",
}

const confidenceLabels: Record<DecisionEvidenceConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
}

const familyLabels: Record<DecisionEvidenceFamily, string> = {
  funding: "Funding",
  referral: "Referral",
  timing: "Timing",
  behavior: "Behavior",
  activity_quality: "Activity quality",
  campaign_coordination: "Campaign coordination",
  graph: "Risk graph",
  known_entity: "Known entity",
  account_state: "Account state",
  policy: "Campaign policy",
  data_coverage: "Data coverage",
  manual_review: "Human review",
  other: "Additional evidence",
}

const effectLabels: Record<DecisionEvidenceEffect, string> = {
  risk_signal: "Risk signal",
  corroborating_signal: "Corroborating signal",
  eligibility_exclusion: "Eligibility exclusion",
  neutralizing_context: "Neutralizing context",
  coverage_limitation: "Coverage limitation",
  human_override: "Human decision",
}

function statusClass(status: WalletStatus) {
  if (status === "approved") {
    return "border-green-400/35 bg-green-400/10 text-green-200"
  }
  if (status === "manual_review") {
    return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  }
  return "border-red-400/35 bg-red-400/10 text-red-200"
}

function confidenceClass(confidence: DecisionEvidenceConfidence) {
  if (confidence === "high") {
    return "border-primary/40 bg-primary/10 text-primary"
  }
  if (confidence === "medium") {
    return "border-amber-400/35 bg-amber-400/10 text-amber-200"
  }
  return "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
}

function effectClass(effect: DecisionEvidenceEffect) {
  if (effect === "risk_signal" || effect === "eligibility_exclusion") {
    return "border-red-400/25 bg-red-400/5"
  }
  if (effect === "coverage_limitation") {
    return "border-amber-400/25 bg-amber-400/5"
  }
  if (effect === "neutralizing_context") {
    return "border-green-400/25 bg-green-400/5"
  }
  if (effect === "human_override") {
    return "border-violet-400/25 bg-violet-400/5"
  }
  return "border-primary/20 bg-primary/5"
}

function shortAddress(address: string) {
  if (address.length <= 18) return address
  return `${address.slice(0, 9)}…${address.slice(-7)}`
}

function WalletStatusIcon({ status }: { status: WalletStatus }) {
  if (status === "approved") return <CheckCircle2 className="mr-1 size-3.5" />
  if (status === "manual_review") return <ShieldQuestion className="mr-1 size-3.5" />
  return <XCircle className="mr-1 size-3.5" />
}

function WalletEvidenceCard({
  wallet,
  open,
}: {
  wallet: WalletRiskResult
  open: boolean
}) {
  const explanation = wallet.decisionEvidence

  return (
    <details open={open} className="group rounded-xl border border-border bg-background/45 open:border-primary/35 open:bg-primary/[0.03]">
      <summary className="cursor-pointer list-none p-4 marker:hidden sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusClass(wallet.status)}>
                <WalletStatusIcon status={wallet.status} />
                {statusLabels[wallet.status]}
              </Badge>
              <Badge variant="outline">{wallet.riskScore} risk</Badge>
              {explanation && (
                <Badge
                  variant="outline"
                  className={confidenceClass(explanation.evidenceConfidence)}
                >
                  {confidenceLabels[explanation.evidenceConfidence]}
                </Badge>
              )}
              {wallet.clusterId && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {wallet.clusterId}
                </Badge>
              )}
            </div>
            <p className="mt-3 break-all font-mono text-sm text-foreground">
              {shortAddress(wallet.walletAddress)}
            </p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {wallet.statusExplanation}
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 text-center sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">Families</p>
              <p className="mt-1 font-semibold">
                {explanation?.evidenceFamilies.length ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <p className="text-xs text-muted-foreground">Risk families</p>
              <p className="mt-1 font-semibold">
                {explanation?.independentRiskFamilyCount ?? 0}
              </p>
            </div>
            <div className="col-span-2 rounded-lg border border-border bg-background/60 px-3 py-2 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Evidence items</p>
              <p className="mt-1 font-semibold">{explanation?.evidence.length ?? 0}</p>
            </div>
          </div>
        </div>
      </summary>

      <div className="border-t border-border px-4 py-5 sm:px-5">
        {!explanation ? (
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
            Explainable evidence is not available for this legacy result yet. Re-run or
            reopen the analysis after the Campaign Security Core release.
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={confidenceClass(explanation.evidenceConfidence)}>
                  {confidenceLabels[explanation.evidenceConfidence]}
                </Badge>
                <Badge variant="outline">
                  Schema: {explanation.schemaVersion}
                </Badge>
                {explanation.requiresHumanReview && (
                  <Badge
                    variant="outline"
                    className="border-amber-400/35 bg-amber-400/10 text-amber-200"
                  >
                    Human review required
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {explanation.evidenceFamilies.map((family) => (
                  <Badge key={family} variant="secondary">
                    {familyLabels[family]}
                  </Badge>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold">Decision evidence</h3>
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {explanation.evidence.map((item, index) => (
                  <article
                    key={`${item.code}-${item.family}-${index}`}
                    className={cn("rounded-lg border p-4", effectClass(item.effect))}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {item.code}
                      </Badge>
                      <Badge variant="secondary">{familyLabels[item.family]}</Badge>
                      <Badge variant="outline">{effectLabels[item.effect]}</Badge>
                    </div>
                    <p className="mt-3 font-medium">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">
                      Source: {item.source.replaceAll("_", " ")}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            {explanation.limitations.length > 0 && (
              <section className="rounded-lg border border-amber-400/25 bg-amber-400/5 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                  <AlertTriangle className="size-4" />
                  Evidence limitations
                </h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {explanation.limitations.map((limitation) => (
                    <li key={limitation}>• {limitation}</li>
                  ))}
                </ul>
              </section>
            )}

            {explanation.humanReview && (
              <section className="rounded-lg border border-violet-400/25 bg-violet-400/5 p-4">
                <h3 className="text-sm font-semibold">Campaign team review</h3>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p>
                    Final status:{" "}
                    <span className="text-foreground">
                      {statusLabels[explanation.humanReview.finalStatus]}
                    </span>
                  </p>
                  <p>
                    Reviewer:{" "}
                    <span className="text-foreground">
                      {explanation.humanReview.reviewerName ?? "Unassigned"}
                    </span>
                  </p>
                  <p className="sm:col-span-2">
                    Notes:{" "}
                    <span className="text-foreground">
                      {explanation.humanReview.notes ?? "No reviewer note recorded."}
                    </span>
                  </p>
                </div>
              </section>
            )}

            <p className="rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              Evidence is campaign-scoped decision support. A rejected or Gray Zone
              result does not by itself prove malicious intent.
            </p>
          </div>
        )}
      </div>
    </details>
  )
}

export function DecisionEvidenceView({ analysisId }: DecisionEvidenceViewProps) {
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [focusedWallet, setFocusedWallet] = useState<string | null>(null)
  const [focusedCluster, setFocusedCluster] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>("all")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wallet = params.get("wallet")?.trim() || null
    const cluster = params.get("cluster")?.trim() || null
    setFocusedWallet(wallet)
    setFocusedCluster(cluster)
    if (wallet || cluster) setQuery(wallet ?? cluster ?? "")
  }, [])

  useEffect(() => {
    let active = true

    fetch(`/api/analysis/${analysisId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { analysis?: AnalysisDetail; error?: string }
          | null
        if (!response.ok || !body?.analysis) {
          throw new Error(body?.error ?? "Decision evidence could not be loaded")
        }
        return body.analysis
      })
      .then((value) => {
        if (active) setAnalysis(value)
      })
      .catch((caughtError: Error) => {
        if (active) setError(caughtError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [analysisId])

  const wallets = useMemo(() => {
    if (!analysis) return []
    const normalizedQuery = query.trim().toLowerCase()

    return analysis.wallets
      .filter((wallet) => {
        const matchesQuery =
          !normalizedQuery ||
          wallet.walletAddress.toLowerCase().includes(normalizedQuery) ||
          Boolean(wallet.entityLabel?.toLowerCase().includes(normalizedQuery)) ||
          Boolean(wallet.clusterId?.toLowerCase().includes(normalizedQuery))
        const matchesStatus =
          statusFilter === "all" || wallet.status === statusFilter
        const matchesConfidence =
          confidenceFilter === "all" ||
          wallet.decisionEvidence?.evidenceConfidence === confidenceFilter
        return matchesQuery && matchesStatus && matchesConfidence
      })
      .sort(
        (left, right) =>
          statusOrder[right.status] - statusOrder[left.status] ||
          right.riskScore - left.riskScore ||
          left.walletAddress.localeCompare(right.walletAddress)
      )
  }, [analysis, confidenceFilter, query, statusFilter])

  if (loading) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-7xl">
          <CardHeader>
            <CardTitle>Loading decision evidence</CardTitle>
            <CardDescription>
              Building the explainable campaign-security view.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </CardContent>
        </Card>
      </main>
    )
  }

  if (error || !analysis) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-2xl border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Decision evidence unavailable
            </CardTitle>
            <CardDescription>{error || "The analysis could not be loaded."}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={`/dashboard/analysis/${analysisId}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <ArrowLeft data-icon="inline-start" />
              Back to report
            </Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const counts = {
    approved: analysis.wallets.filter((wallet) => wallet.status === "approved").length,
    manualReview: analysis.wallets.filter((wallet) => wallet.status === "manual_review").length,
    rejected: analysis.wallets.filter((wallet) => wallet.status === "rejected").length,
    highConfidence: analysis.wallets.filter(
      (wallet) => wallet.decisionEvidence?.evidenceConfidence === "high"
    ).length,
  }

  return (
    <main className="premium-page min-h-screen bg-background px-4 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-background/70 p-4 backdrop-blur sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href={`/dashboard/analysis/${analysis.id}`}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
            >
              <ArrowLeft data-icon="inline-start" />
              Analysis report
            </Link>
            <div className="mt-3 flex items-center gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-primary">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold sm:text-3xl">Decision Evidence</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {analysis.project.name} · {analysis.project.chain} ·{" "}
                  {formatNumber(analysis.totalWallets)} wallets
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/analysis/${analysis.id}/review`}
              className={buttonVariants({ variant: "outline" })}
            >
              Review queue
            </Link>
            <Link
              href={`/dashboard/analysis/${analysis.id}`}
              className={buttonVariants()}
            >
              Full report
            </Link>
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="glass-panel">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved</p>
              <p className="mt-2 text-2xl font-semibold text-green-200">
                {formatNumber(counts.approved)}
              </p>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Gray Zone</p>
              <p className="mt-2 text-2xl font-semibold text-amber-200">
                {formatNumber(counts.manualReview)}
              </p>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Not eligible</p>
              <p className="mt-2 text-2xl font-semibold text-red-200">
                {formatNumber(counts.rejected)}
              </p>
            </CardContent>
          </Card>
          <Card className="glass-panel">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">High-confidence decisions</p>
              <p className="mt-2 text-2xl font-semibold text-primary">
                {formatNumber(counts.highConfidence)}
              </p>
            </CardContent>
          </Card>
        </section>

        {focusedWallet && (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-4 py-3 text-sm text-muted-foreground">
            Focused from relationship graph: <span className="font-mono text-foreground">{shortAddress(focusedWallet)}</span>
            {focusedCluster ? ` · ${focusedCluster}` : ""}
          </div>
        )}

        <Card className="glass-panel">
          <CardHeader>
            <CardTitle>Evidence explorer</CardTitle>
            <CardDescription>
              Search a wallet, filter decisions, and expand any result to inspect the
              exact evidence and limitations behind it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search wallet, entity or cluster"
                  className="pl-9"
                />
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Filter by decision"
              >
                <option value="all">All decisions</option>
                <option value="approved">Approved</option>
                <option value="manual_review">Gray Zone</option>
                <option value="rejected">Rejected / Not Eligible</option>
              </select>
              <select
                value={confidenceFilter}
                onChange={(event) =>
                  setConfidenceFilter(event.target.value as ConfidenceFilter)
                }
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Filter by confidence"
              >
                <option value="all">All confidence levels</option>
                <option value="high">High confidence</option>
                <option value="medium">Medium confidence</option>
                <option value="low">Low confidence</option>
              </select>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("")
                  setStatusFilter("all")
                  setConfidenceFilter("all")
                }}
              >
                Clear
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>{formatNumber(wallets.length)} matching wallets</span>
              <span>
                Rejected and Gray Zone results are shown first for operational review.
              </span>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3">
          {wallets.length > 0 ? (
            wallets.map((wallet) => (
              <WalletEvidenceCard
                key={wallet.walletAddress}
                wallet={wallet}
                open={wallet.walletAddress === focusedWallet}
              />
            ))
          ) : (
            <Card className="glass-panel">
              <CardContent className="p-8 text-center text-muted-foreground">
                No wallet matches the selected filters.
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </main>
  )
}
