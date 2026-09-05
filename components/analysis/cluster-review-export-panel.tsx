"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson2,
  FileSpreadsheet,
  History,
  RotateCcw,
  Save,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { ClusterInvestigationReport } from "@/lib/cluster-investigation/builder"
import {
  clusterReviewDispositionLabel,
  clusterReviewDispositions,
  type ClusterReviewDisposition,
  type ClusterReviewRecord,
} from "@/lib/cluster-investigation/review"
import { formatDateTimeUTC } from "@/lib/format"
import { cn } from "@/lib/utils"

type ReviewState = {
  storageAvailable: boolean
  latest: ClusterReviewRecord | null
  history: ClusterReviewRecord[]
}

const dispositionDescriptions: Record<ClusterReviewDisposition, string> = {
  grouping_supported: "The reviewed evidence supports keeping the stored grouping as an investigation unit.",
  grouping_not_supported: "The reviewed evidence does not support the stored grouping strongly enough to rely on it.",
  needs_more_data: "The available evidence is insufficient for a reviewer disposition.",
  escalate: "Send this cluster for deeper investigation or additional evidence collection.",
}

function dispositionClass(disposition: ClusterReviewDisposition) {
  if (disposition === "grouping_supported") return "border-green-400/35 bg-green-400/10 text-green-200"
  if (disposition === "grouping_not_supported") return "border-red-400/35 bg-red-400/10 text-red-200"
  if (disposition === "escalate") return "border-violet-400/35 bg-violet-400/10 text-violet-200"
  return "border-amber-400/35 bg-amber-400/10 text-amber-200"
}

export function ClusterReviewExportPanel({ report }: { report: ClusterInvestigationReport }) {
  return <ClusterReviewExportPanelContent key={`${report.analysisId}:${report.cluster.clusterLabel}`} report={report} />
}

function ClusterReviewExportPanelContent({ report }: { report: ClusterInvestigationReport }) {
  const [reviewState, setReviewState] = useState<ReviewState | null>(null)
  const [disposition, setDisposition] = useState<ClusterReviewDisposition>("needs_more_data")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const encodedLabel = useMemo(() => encodeURIComponent(report.cluster.clusterLabel), [report.cluster.clusterLabel])
  const reviewPath = `/api/analysis/${report.analysisId}/clusters/${encodedLabel}/review`
  const exportPath = `/api/analysis/${report.analysisId}/clusters/${encodedLabel}/export`

  const requestData = useCallback((signal?: AbortSignal) => {
    return fetch(reviewPath, { cache: "no-store", signal }).then(async (response) => {
      const body = (await response.json().catch(() => ({}))) as ReviewState & { error?: string }
      if (signal?.aborted) return
      if (!response.ok) throw new Error(body.error ?? "Cluster review history could not be loaded")
      setReviewState(body)
    }).catch((loadError) => {
      if (signal?.aborted) return
      setError(loadError instanceof Error ? loadError.message : "Cluster review history could not be loaded")
    }).finally(() => {
      if (!signal?.aborted) setLoading(false)
    })
  }, [reviewPath])

  async function loadReviews() {
    setLoading(true)
    setError("")
    await requestData()
  }

  useEffect(() => {
    const controller = new AbortController()
    void requestData(controller.signal)
    return () => controller.abort()
  }, [requestData])

  async function saveReview() {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch(reviewPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition, notes, source: "cluster_workspace" }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        error?: string
        review?: ClusterReviewRecord
        mutatedClusterMembership?: boolean
        mutatedWalletDecisionState?: boolean
      }
      if (!response.ok || !body.review) throw new Error(body.error ?? "Cluster review could not be saved")
      setNotes("")
      setMessage("Review event saved. Cluster membership and wallet decision state were not changed.")
      await loadReviews()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Cluster review could not be saved")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-5 px-5 pb-8 sm:px-8 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-5 text-primary" /> Cluster reviewer disposition
          </CardTitle>
          <CardDescription>
            Append-only human review. This records an investigation judgment without changing cluster membership, wallet risk, or policy decisions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {clusterReviewDispositions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDisposition(option)}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  disposition === option
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-background/45 hover:border-primary/30",
                )}
              >
                <Badge variant="outline" className={dispositionClass(option)}>
                  {clusterReviewDispositionLabel(option)}
                </Badge>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  {dispositionDescriptions[option]}
                </p>
              </button>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Reviewer notes</p>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={4000}
              placeholder="Record evidence checked, unresolved questions, or why this grouping should be supported, challenged, or escalated..."
              className="min-h-28"
            />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">{notes.length}/4000</p>
          </div>

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/5 p-4 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </div>
          )}
          {message && (
            <div className="flex items-start gap-3 rounded-xl border border-green-400/25 bg-green-400/5 p-4 text-sm text-green-100">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void saveReview()} disabled={saving || loading || reviewState?.storageAvailable === false}>
              {saving ? <RotateCcw data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
              Save review event
            </Button>
            <Button variant="outline" onClick={() => void loadReviews()} disabled={loading}>
              <RotateCcw data-icon="inline-start" className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            {reviewState?.storageAvailable === false && (
              <span className="text-xs text-amber-200">Review storage migration is not deployed on this environment yet.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="size-5 text-primary" /> Review audit trail</CardTitle>
            <CardDescription>Newest reviewer event is shown first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewState?.history.slice(0, 6).map((review) => (
              <div key={review.id} className="rounded-xl border border-border bg-background/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={dispositionClass(review.disposition)}>
                    {clusterReviewDispositionLabel(review.disposition)}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">{formatDateTimeUTC(review.createdAt)}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Reviewer: {review.reviewerName}</p>
                {review.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{review.notes}</p>}
              </div>
            ))}
            {!loading && reviewState?.storageAvailable !== false && !reviewState?.history.length && (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No cluster-level review event has been recorded yet.</p>
            )}
            {loading && <p className="text-sm text-muted-foreground">Loading review history…</p>}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Download className="size-5 text-primary" /> Investigation export</CardTitle>
            <CardDescription>Deterministic, read-only evidence package for audit or customer handoff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a href={`${exportPath}?format=json`} className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}>
              <FileJson2 data-icon="inline-start" /> Full JSON audit package
            </a>
            <a href={`${exportPath}?format=csv`} className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}>
              <FileSpreadsheet data-icon="inline-start" /> Wallet evidence CSV
            </a>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Exports preserve the stored decision state and interpretation boundaries. Generating a file never changes cluster or wallet results.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
