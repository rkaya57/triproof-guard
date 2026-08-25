"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowLeft, CheckCircle2, RotateCcw, Save, Search, ShieldX, Users } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"
import { formatNumber } from "@/lib/format"
import type {
  AnalysisDetail,
  DecisionEvidenceEffect,
  DecisionEvidenceItem,
  FeedbackLabel,
  WalletRiskResult,
  WalletStatus,
} from "@/types"

type Draft = {
  finalStatus: WalletStatus
  feedbackLabel: FeedbackLabel
  notes: string
}

type EvidenceFilter = "all" | "canonical" | "risk" | "corroborating" | "neutral"

const feedbackOptions: Array<{ value: FeedbackLabel; label: string }> = [
  { value: "correct_decision", label: "Correct decision" },
  { value: "false_positive", label: "False positive" },
  { value: "false_negative", label: "False negative" },
  { value: "confirmed_risk", label: "Confirmed risk" },
  { value: "trusted_user", label: "Trusted user" },
  { value: "needs_more_data", label: "Needs more data" },
]

function shortAddress(address: string) {
  if (address.length <= 14) return address
  return `${address.slice(0, 7)}...${address.slice(-4)}`
}

function statusLabel(status: WalletStatus) {
  if (status === "approved") return "Approved"
  if (status === "manual_review") return "Gray Zone"
  return "Rejected / Not Eligible"
}

function defaultFeedback(status: WalletStatus): FeedbackLabel {
  if (status === "approved") return "trusted_user"
  if (status === "rejected") return "confirmed_risk"
  return "needs_more_data"
}

function statusTone(status: WalletStatus) {
  if (status === "approved") return "border-green-400/40 bg-green-400/10 text-green-300"
  if (status === "manual_review") return "border-amber-400/40 bg-amber-400/10 text-amber-300"
  return "border-red-400/40 bg-red-400/10 text-red-300"
}

function canonicalFundingEvidence(wallet: WalletRiskResult): DecisionEvidenceItem[] {
  return (wallet.decisionEvidence?.evidence ?? []).filter(
    (item) => item.family === "funding" && item.code.startsWith("CANONICAL_"),
  )
}

function evidenceTone(effect: DecisionEvidenceEffect) {
  if (effect === "risk_signal") return "border-red-400/40 bg-red-400/10 text-red-300"
  if (effect === "corroborating_signal") return "border-amber-400/40 bg-amber-400/10 text-amber-300"
  if (effect === "neutralizing_context") return "border-cyan-400/40 bg-cyan-400/10 text-cyan-300"
  return "border-border bg-muted/30 text-muted-foreground"
}

function evidenceLabel(effect: DecisionEvidenceEffect) {
  if (effect === "risk_signal") return "Funding risk"
  if (effect === "corroborating_signal") return "Funding corroboration"
  if (effect === "neutralizing_context") return "Neutralized funding"
  return "Funding evidence"
}

function matchesEvidenceFilter(wallet: WalletRiskResult, filter: EvidenceFilter) {
  if (filter === "all") return true
  const evidence = canonicalFundingEvidence(wallet)
  if (filter === "canonical") return evidence.length > 0
  if (filter === "risk") return evidence.some((item) => item.effect === "risk_signal")
  if (filter === "corroborating") {
    return evidence.some((item) => item.effect === "corroborating_signal")
  }
  return evidence.some((item) => item.effect === "neutralizing_context")
}

export function TeamReviewDashboard({ initialAnalysis }: { initialAnalysis: AnalysisDetail }) {
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<WalletStatus | "all">("manual_review")
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("all")
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingWallet, setSavingWallet] = useState("")
  const [bulkSaving, setBulkSaving] = useState(false)
  const { toast } = useToast()

  const filteredWallets = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return analysis.wallets.filter((wallet) => {
      const canonicalEvidence = canonicalFundingEvidence(wallet)
      const evidenceText = canonicalEvidence
        .flatMap((item) => [item.code, item.title, item.description])
        .join(" ")
        .toLowerCase()
      const matchesStatus = statusFilter === "all" || wallet.status === statusFilter
      const matchesEvidence = matchesEvidenceFilter(wallet, evidenceFilter)
      const matchesQuery =
        !normalized ||
        wallet.walletAddress.toLowerCase().includes(normalized) ||
        wallet.reasons.join(" ").toLowerCase().includes(normalized) ||
        evidenceText.includes(normalized) ||
        Boolean(wallet.entityLabel?.toLowerCase().includes(normalized))
      return matchesStatus && matchesEvidence && matchesQuery
    })
  }, [analysis.wallets, evidenceFilter, query, statusFilter])

  const canonicalEvidenceWallets = useMemo(
    () => analysis.wallets.filter((wallet) => canonicalFundingEvidence(wallet).length > 0).length,
    [analysis.wallets],
  )

  const reviewSummary = analysis.teamReviewSummary ?? {
    reviewedWallets: analysis.wallets.filter((wallet) => wallet.teamReview).length,
    pendingReview: analysis.wallets.filter(
      (wallet) => wallet.status === "manual_review" && !wallet.teamReview
    ).length,
    approvedByTeam: analysis.wallets.filter((wallet) => wallet.teamReview?.finalStatus === "approved").length,
    grayZoneByTeam: analysis.wallets.filter((wallet) => wallet.teamReview?.finalStatus === "manual_review").length,
    rejectedByTeam: analysis.wallets.filter((wallet) => wallet.teamReview?.finalStatus === "rejected").length,
  }

  const feedbackSummary = analysis.feedbackSummary ?? {
    totalFeedback: 0,
    correctDecision: 0,
    falsePositive: 0,
    falseNegative: 0,
    confirmedRisk: 0,
    trustedUser: 0,
    needsMoreData: 0,
  }

  function draftFor(wallet: WalletRiskResult): Draft {
    return (
      drafts[wallet.walletAddress] ?? {
        finalStatus: wallet.teamReview?.finalStatus ?? wallet.status,
        feedbackLabel: wallet.teamReview?.feedbackLabel ?? defaultFeedback(wallet.status),
        notes: wallet.teamReview?.notes ?? "",
      }
    )
  }

  function updateDraft(wallet: WalletRiskResult, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [wallet.walletAddress]: { ...draftFor(wallet), ...patch },
    }))
  }

  async function saveWalletReview(wallet: WalletRiskResult) {
    const draft = draftFor(wallet)
    setSavingWallet(wallet.walletAddress)
    try {
      const response = await fetch(`/api/analysis/${analysis.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet.walletAddress,
          finalStatus: draft.finalStatus,
          feedbackLabel: draft.feedbackLabel,
          notes: draft.notes,
          source: "team_review_dashboard",
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        wallet?: { status: WalletStatus; recommendedAction: WalletRiskResult["recommendedAction"]; statusExplanation: string }
        counts?: { approvedCount: number; manualReviewCount: number; rejectedCount: number }
        review?: { finalStatus: WalletStatus; feedbackLabel: FeedbackLabel | null; notes: string | null; updatedAt: string }
        evidenceSnapshotCaptured?: boolean
      }
      if (!response.ok) throw new Error(body.error ?? "Review could not be saved")

      setAnalysis((current) => {
        const wallets = current.wallets.map((item) =>
          item.walletAddress === wallet.walletAddress
            ? {
                ...item,
                status: body.wallet?.status ?? draft.finalStatus,
                recommendedAction: body.wallet?.recommendedAction ?? item.recommendedAction,
                statusExplanation: body.wallet?.statusExplanation ?? item.statusExplanation,
                teamReview: {
                  finalStatus: body.review?.finalStatus ?? draft.finalStatus,
                  feedbackLabel: body.review?.feedbackLabel ?? draft.feedbackLabel,
                  notes: body.review?.notes ?? draft.notes,
                  reviewerName: null,
                  updatedAt: body.review?.updatedAt ?? new Date().toISOString(),
                },
              }
            : item
        )
        return {
          ...current,
          wallets,
          approvedCount: body.counts?.approvedCount ?? current.approvedCount,
          manualReviewCount: body.counts?.manualReviewCount ?? current.manualReviewCount,
          rejectedCount: body.counts?.rejectedCount ?? current.rejectedCount,
        }
      })
      toast(
        body.evidenceSnapshotCaptured
          ? "Team review saved with immutable evidence snapshot"
          : "Team review saved",
        "success",
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : "Review could not be saved", "error")
    } finally {
      setSavingWallet("")
    }
  }

  async function bulkApply(finalStatus: WalletStatus) {
    const walletAddresses = filteredWallets.slice(0, 1000).map((wallet) => wallet.walletAddress)
    if (!walletAddresses.length) return
    setBulkSaving(true)
    try {
      const response = await fetch(`/api/analysis/${analysis.id}/review/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddresses,
          finalStatus,
          feedbackLabel: defaultFeedback(finalStatus),
          notes: `Bulk team review applied from ${statusLabel(statusFilter === "all" ? finalStatus : statusFilter)} filter.`,
          source: "team_review_bulk",
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        counts?: { approvedCount: number; manualReviewCount: number; rejectedCount: number }
        reviewedWallets?: number
        evidenceSnapshotsCaptured?: number
      }
      if (!response.ok) throw new Error(body.error ?? "Bulk review could not be saved")

      const affected = new Set(walletAddresses)
      setAnalysis((current) => ({
        ...current,
        wallets: current.wallets.map((wallet) =>
          affected.has(wallet.walletAddress)
            ? {
                ...wallet,
                status: finalStatus,
                teamReview: {
                  finalStatus,
                  feedbackLabel: defaultFeedback(finalStatus),
                  notes: "Bulk team review applied.",
                  reviewerName: null,
                  updatedAt: new Date().toISOString(),
                },
              }
            : wallet
        ),
        approvedCount: body.counts?.approvedCount ?? current.approvedCount,
        manualReviewCount: body.counts?.manualReviewCount ?? current.manualReviewCount,
        rejectedCount: body.counts?.rejectedCount ?? current.rejectedCount,
      }))
      toast(
        `Bulk review saved for ${body.reviewedWallets ?? walletAddresses.length} wallets; ${body.evidenceSnapshotsCaptured ?? 0} audit snapshots captured`,
        "success",
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bulk review could not be saved", "error")
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 sm:px-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Link href={`/dashboard/analysis/${analysis.id}`} className={`${buttonVariants({ variant: "outline" })} mb-4`}>
            <ArrowLeft data-icon="inline-start" /> Back to analysis
          </Link>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="secondary">V2.2 Evidence-aware Team Review</Badge>
            <Badge variant="outline">{analysis.project.chain}</Badge>
            <Badge variant="outline">{analysis.riskPolicy ?? "balanced"}</Badge>
            <Badge variant="outline">{canonicalEvidenceWallets} wallets with canonical funding evidence</Badge>
          </div>
          <h1 className="text-gradient text-3xl font-semibold">Customer review dashboard</h1>
          <p className="mt-2 text-muted-foreground">Review deterministic decisions with canonical provenance context and preserve the evidence visible at override time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={bulkSaving || !filteredWallets.length} onClick={() => void bulkApply("approved")}>Bulk approve filtered</Button>
          <Button variant="outline" disabled={bulkSaving || !filteredWallets.length} onClick={() => void bulkApply("manual_review")}>Bulk gray-zone filtered</Button>
          <Button variant="outline" disabled={bulkSaving || !filteredWallets.length} onClick={() => void bulkApply("rejected")}>Bulk reject filtered</Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-5">
        <Card className="glass-panel"><CardHeader><CardTitle>{formatNumber(reviewSummary.reviewedWallets)}</CardTitle><CardDescription>Reviewed wallets</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardTitle>{formatNumber(reviewSummary.pendingReview)}</CardTitle><CardDescription>Pending team review</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardTitle>{formatNumber(canonicalEvidenceWallets)}</CardTitle><CardDescription>Canonical funding evidence</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardTitle>{formatNumber(feedbackSummary.totalFeedback)}</CardTitle><CardDescription>Feedback events</CardDescription></CardHeader></Card>
        <Card className="glass-panel"><CardHeader><CardTitle>{feedbackSummary.falsePositive + feedbackSummary.falseNegative}</CardTitle><CardDescription>Calibration corrections</CardDescription></CardHeader></Card>
      </div>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="text-primary" /> Review queue</CardTitle>
          <CardDescription>Filter by decision and canonical funding context, then save human overrides with immutable evidence snapshots.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[200px_220px_1fr_auto]">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as WalletStatus | "all")} className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <option value="all">All decisions</option>
              <option value="approved">Approved</option>
              <option value="manual_review">Gray Zone</option>
              <option value="rejected">Rejected / Not Eligible</option>
            </select>
            <select value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)} className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
              <option value="all">All evidence</option>
              <option value="canonical">Any canonical funding</option>
              <option value="risk">Funding risk</option>
              <option value="corroborating">Funding corroboration</option>
              <option value="neutral">Neutralized funding</option>
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wallet, reason, entity, or canonical evidence" className="pl-10" />
            </div>
            <Button variant="outline" onClick={() => { setQuery(""); setStatusFilter("manual_review"); setEvidenceFilter("all") }}>
              <RotateCcw data-icon="inline-start" /> Reset
            </Button>
          </div>

          <div className="max-h-[720px] overflow-auto rounded-lg border border-border">
            <Table className="min-w-[1180px] table-fixed">
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <TableRow>
                  <TableHead className="w-[14%]">Wallet</TableHead>
                  <TableHead className="w-[11%]">Current</TableHead>
                  <TableHead className="w-[12%]">Team decision</TableHead>
                  <TableHead className="w-[14%]">Feedback</TableHead>
                  <TableHead className="w-[21%]">Notes</TableHead>
                  <TableHead className="w-[20%]">Decision evidence</TableHead>
                  <TableHead className="w-[8%] text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWallets.map((wallet) => {
                  const draft = draftFor(wallet)
                  const fundingEvidence = canonicalFundingEvidence(wallet)
                  const primaryEvidence = fundingEvidence[0]
                  return (
                    <TableRow key={wallet.walletAddress}>
                      <TableCell><span className="font-mono text-xs text-muted-foreground">{shortAddress(wallet.walletAddress)}</span></TableCell>
                      <TableCell><Badge variant="outline" className={statusTone(wallet.status)}>{statusLabel(wallet.status)}</Badge></TableCell>
                      <TableCell>
                        <select value={draft.finalStatus} onChange={(event) => updateDraft(wallet, { finalStatus: event.target.value as WalletStatus })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                          <option value="approved">Approved</option>
                          <option value="manual_review">Gray Zone</option>
                          <option value="rejected">Rejected / Not Eligible</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <select value={draft.feedbackLabel} onChange={(event) => updateDraft(wallet, { feedbackLabel: event.target.value as FeedbackLabel })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs">
                          {feedbackOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </TableCell>
                      <TableCell><Textarea value={draft.notes} onChange={(event) => updateDraft(wallet, { notes: event.target.value })} rows={2} placeholder="Team note" /></TableCell>
                      <TableCell>
                        {primaryEvidence ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className={evidenceTone(primaryEvidence.effect)}>{evidenceLabel(primaryEvidence.effect)}</Badge>
                              {fundingEvidence.length > 1 && <Badge variant="outline">+{fundingEvidence.length - 1}</Badge>}
                            </div>
                            <span className="line-clamp-2 text-xs text-muted-foreground">{primaryEvidence.title}: {primaryEvidence.description}</span>
                            <span className="text-[11px] text-muted-foreground/70">Supplemental context; score and policy were not recomputed.</span>
                          </div>
                        ) : (
                          <span className="line-clamp-2 text-xs text-muted-foreground">{wallet.statusExplanation}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" disabled={savingWallet === wallet.walletAddress} onClick={() => void saveWalletReview(wallet)}>
                          {savingWallet === wallet.walletAddress ? <RotateCcw className="animate-spin" /> : <Save />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!filteredWallets.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">No wallets match this review filter.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="border-green-400/20 bg-green-400/5"><CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 text-green-300" /><p>Every saved team decision creates an immutable evidence snapshot in addition to the current review record. Re-reviewing a wallet cannot erase what the earlier reviewer saw.</p></CardContent></Card>
        <Card className="border-red-400/20 bg-red-400/5"><CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground"><ShieldX className="mt-0.5 text-red-300" /><p>Canonical funding provenance is supplemental reviewer context. Human overrides may change operational status, but the original Tri-Proof score, policy result, and deterministic reasons remain auditable.</p></CardContent></Card>
      </div>
    </div>
  )
}
