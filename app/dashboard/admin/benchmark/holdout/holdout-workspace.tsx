"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FlaskConical,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
  UsersRound,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Run = {
  id: string
  status: string
  freezeHash: string
  stackHash: string
  stackCommitSha: string
  frozenAt: string
  candidateNotBefore: string
  freeze: {
    minimums: { cases: number; malicious: number; organic: number; chains: number }
  }
}

type Bundle = {
  batchId: string
  reviewerCsv: string
  reviewerAFileName: string
  reviewerBFileName: string
  representativeCases: number
  projects: number
  byChain: Record<string, number>
}

type BundleState = {
  candidateWallets: number
  selectedCases: number
  projects: number
  byChain: Record<string, number>
  sealable: boolean
  reasons: string[]
  alreadySealed: boolean
  casesPerProject: number
  bundle: Bundle | null
}

type ReviewState = {
  status: string
  reviewerAImported: boolean
  reviewerBImported: boolean
  adjudicatorImported: boolean
  reviewerA: string | null
  reviewerB: string | null
  adjudicator: string | null
  totalCases: number
  resolvedCases: number
  conflictCases: string[]
  readyForGroundTruth: boolean
  groundTruthSealed: boolean
  groundTruthHash: string | null
  adjudicatorTemplateCsv: string | null
  adjudicatorFileName: string | null
}

type Evaluation = {
  evaluatedAt: string
  observationsHash: string
  metrics: {
    totalCases: number
    acceptableDecisionAccuracy: number
    exactDecisionAccuracy: number
    maliciousPrecision: number | null
    maliciousRecall: number | null
    maliciousF1: number | null
    maliciousContainmentRate: number | null
    criticalFalseApprovals: number
    organicFalseRejectRate: number | null
    manualReviewRate: number
  }
  finalClaimGate: {
    ready: boolean
    reasons: string[]
    stackMatchesFreeze: boolean
    designReady: boolean
    operationalGatePassed: boolean
    metricClaimReadinessPassed: boolean
    criticalFalseApprovals: number
  }
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

async function jsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  const payload = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })
  if (!response.ok) throw new Error(payload.error || `Request failed (HTTP ${response.status})`)
  return payload
}

export function HoldoutWorkspace() {
  const [run, setRun] = useState<Run | null>(null)
  const [latestRun, setLatestRun] = useState<Run | null>(null)
  const [bundle, setBundle] = useState<BundleState | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const freeze = await jsonResponse<{ activeRun: Run | null; latestRun: Run | null }>(
        await fetch("/api/admin/benchmark/holdout/freeze", { cache: "no-store" })
      )
      setRun(freeze.activeRun)
      setLatestRun(freeze.latestRun)

      if (freeze.activeRun) {
        const bundleResponse = await fetch("/api/admin/benchmark/holdout/reviewer-bundle", { cache: "no-store" })
        if (bundleResponse.ok) {
          const bundlePayload = await jsonResponse<BundleState>(bundleResponse)
          setBundle(bundlePayload)
          if (bundlePayload.alreadySealed) {
            const reviewResponse = await fetch("/api/admin/benchmark/holdout/reviews", { cache: "no-store" })
            setReview(reviewResponse.ok ? await jsonResponse<ReviewState>(reviewResponse) : null)
          } else {
            setReview(null)
          }
        } else {
          setBundle(null)
          setReview(null)
        }
      } else {
        setBundle(null)
        setReview(null)
      }

      const evaluationResponse = await fetch("/api/admin/benchmark/holdout/evaluate", { cache: "no-store" })
      if (evaluationResponse.ok) {
        const payload = await jsonResponse<{ evaluation: Evaluation | null }>(evaluationResponse)
        setEvaluation(payload.evaluation)
      } else {
        setEvaluation(null)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Holdout workspace refresh failed")
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const visibleRun = run ?? latestRun
  const chainText = useMemo(() => {
    if (!bundle) return "—"
    return Object.entries(bundle.byChain)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([chain, count]) => `${chain}: ${count}`)
      .join(" · ") || "—"
  }, [bundle])

  async function createFreeze() {
    if (!window.confirm("Freeze the current production engine/AI stack for Independent Holdout Validation v1? Any later code/model/policy change will invalidate this run.")) return
    setBusy("freeze")
    setError(null)
    try {
      await jsonResponse(await fetch("/api/admin/benchmark/holdout/freeze", { method: "POST" }))
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Freeze failed")
    } finally {
      setBusy(null)
    }
  }

  async function sealBundle() {
    setBusy("bundle")
    setError(null)
    try {
      await jsonResponse(await fetch("/api/admin/benchmark/holdout/reviewer-bundle", { method: "POST" }))
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reviewer bundle seal failed")
    } finally {
      setBusy(null)
    }
  }

  async function uploadReview(role: "reviewer_a" | "reviewer_b" | "adjudicator", file: File) {
    setBusy(role)
    setError(null)
    try {
      const formData = new FormData()
      formData.set("role", role)
      formData.set("reviewCsv", file)
      await jsonResponse(
        await fetch("/api/admin/benchmark/holdout/reviews", { method: "POST", body: formData })
      )
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Review import failed")
    } finally {
      setBusy(null)
    }
  }

  async function evaluate() {
    if (!window.confirm("Run the one-shot Independent Holdout evaluation now? The frozen engine outputs will be compared to sealed ground truth exactly once.")) return
    setBusy("evaluate")
    setError(null)
    try {
      await jsonResponse(await fetch("/api/admin/benchmark/holdout/evaluate", { method: "POST" }))
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "One-shot evaluation failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="glass-panel premium-card border-cyan-400/25">
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">Independent Holdout v1</Badge>
            <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">ENGINE-BLIND</Badge>
            <Badge variant="outline" className="border-violet-400/30 bg-violet-400/10 text-violet-100">ONE-SHOT</Badge>
          </div>
          <CardTitle className="mt-3 text-3xl text-white">Independent validation workspace</CardTitle>
          <CardDescription className="max-w-4xl text-slate-300">
            Freeze one production stack, collect only post-freeze cases, run two independent blind reviews, adjudicate conflicts, seal ground truth, then compare it once against the already-frozen engine outputs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!visibleRun ? (
            <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/5 p-5">
              <div className="flex gap-3">
                <LockKeyhole className="mt-0.5 size-5 text-yellow-300" />
                <div>
                  <p className="font-semibold text-white">No holdout freeze exists yet</p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">Create the freeze only after this workspace and all validation tooling are deployed and production-stable. The freeze commit becomes part of the scientific protocol.</p>
                </div>
              </div>
              <Button className="mt-4" onClick={createFreeze} disabled={Boolean(busy)}>
                {busy === "freeze" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <LockKeyhole className="mr-2 size-4" />}
                Create Holdout v1 freeze
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-background/35 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Status</p><p className="mt-2 text-xl font-semibold text-white">{visibleRun.status}</p></div>
              <div className="rounded-xl border border-border bg-background/35 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Freeze commit</p><p className="mt-2 truncate font-mono text-sm text-cyan-200" title={visibleRun.stackCommitSha}>{visibleRun.stackCommitSha.slice(0, 12)}…</p></div>
              <div className="rounded-xl border border-border bg-background/35 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Candidate cutoff</p><p className="mt-2 text-sm font-semibold text-white">{new Date(visibleRun.candidateNotBefore).toLocaleString()}</p></div>
              <div className="rounded-xl border border-border bg-background/35 p-4"><p className="text-xs uppercase tracking-wide text-slate-400">Freeze hash</p><p className="mt-2 truncate font-mono text-sm text-violet-200" title={visibleRun.freezeHash}>{visibleRun.freezeHash.slice(0, 16)}…</p></div>
            </div>
          )}

          <Button variant="outline" onClick={() => void refresh()} disabled={Boolean(busy)} className="text-white">
            <RefreshCw className="mr-2 size-4" />Refresh state
          </Button>

          {error ? <div className="flex gap-3 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-100"><AlertTriangle className="mt-0.5 size-5 shrink-0" /><p>{error}</p></div> : null}
        </CardContent>
      </Card>

      {run && bundle ? (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><UsersRound className="size-5 text-primary" />1. Post-freeze case collection</CardTitle>
            <CardDescription className="text-slate-300">Sampling is fixed at {bundle.casesPerProject} cases per project and cannot be tuned after freeze.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-white">{bundle.candidateWallets}</p><p className="text-sm text-slate-400">Post-freeze candidates</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-white">{bundle.selectedCases}</p><p className="text-sm text-slate-400">Blind-review cases</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-2xl font-semibold text-white">{bundle.projects}</p><p className="text-sm text-slate-400">Projects</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-sm font-semibold text-white">{chainText}</p><p className="text-sm text-slate-400">Chain distribution</p></div>
            </div>
            {!bundle.alreadySealed ? (
              <div>
                {bundle.reasons.length ? <div className="mb-3 rounded-xl border border-yellow-400/25 bg-yellow-400/5 p-4 text-sm text-yellow-100">{bundle.reasons.join(" ")}</div> : null}
                <Button onClick={sealBundle} disabled={Boolean(busy) || !bundle.sealable}>
                  {busy === "bundle" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}
                  Seal blind reviewer bundle
                </Button>
              </div>
            ) : bundle.bundle ? (
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" className="text-white" onClick={() => downloadText(bundle.bundle!.reviewerAFileName, bundle.bundle!.reviewerCsv)}><Download className="mr-2 size-4" />Reviewer A CSV</Button>
                <Button variant="outline" className="text-white" onClick={() => downloadText(bundle.bundle!.reviewerBFileName, bundle.bundle!.reviewerCsv)}><Download className="mr-2 size-4" />Reviewer B CSV</Button>
                <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Private engine seal stored server-side</Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {run && bundle?.alreadySealed ? (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><FileCheck2 className="size-5 text-primary" />2. Independent reviews and adjudication</CardTitle>
            <CardDescription className="text-slate-300">Reviewer A and Reviewer B must work independently and must not see engine, AI, or private-seal outputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {(["reviewer_a", "reviewer_b", "adjudicator"] as const).map((role) => {
                const completed = role === "reviewer_a" ? review?.reviewerAImported : role === "reviewer_b" ? review?.reviewerBImported : review?.adjudicatorImported
                const enabled = role === "reviewer_a" || (role === "reviewer_b" && review?.reviewerAImported) || (role === "adjudicator" && Boolean(review?.adjudicatorTemplateCsv))
                return (
                  <label key={role} className={`rounded-xl border p-4 ${completed ? "border-green-400/30 bg-green-400/5" : "border-border bg-background/35"}`}>
                    <p className="font-semibold text-white">{role === "reviewer_a" ? "Reviewer A" : role === "reviewer_b" ? "Reviewer B" : "Adjudicator"}</p>
                    <p className="mt-1 text-xs text-slate-400">{completed ? "Imported and frozen" : enabled ? "Upload completed blind CSV" : "Waiting for previous stage"}</p>
                    {!completed && enabled ? <input type="file" accept=".csv,text/csv" className="mt-3 block w-full text-xs text-slate-300" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadReview(role, file) }} /> : null}
                    {completed ? <CheckCircle2 className="mt-3 size-5 text-green-300" /> : busy === role ? <Loader2 className="mt-3 size-5 animate-spin text-primary" /> : null}
                  </label>
                )
              })}
            </div>

            {review?.adjudicatorTemplateCsv && review.adjudicatorFileName ? (
              <Button variant="outline" className="text-white" onClick={() => downloadText(review.adjudicatorFileName!, review.adjudicatorTemplateCsv!)}><Download className="mr-2 size-4" />Download blind conflict file ({review.conflictCases.length})</Button>
            ) : null}

            {review ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Resolved</p><p className="mt-1 text-2xl font-semibold text-white">{review.resolvedCases}/{review.totalCases}</p></div>
                <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Open conflicts</p><p className="mt-1 text-2xl font-semibold text-white">{review.conflictCases.length}</p></div>
                <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Ground truth</p><p className={`mt-1 font-semibold ${review.groundTruthSealed ? "text-green-300" : "text-slate-300"}`}>{review.groundTruthSealed ? "SEALED" : "pending"}</p></div>
                <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Ground-truth hash</p><p className="mt-1 truncate font-mono text-sm text-violet-200">{review.groundTruthHash ? `${review.groundTruthHash.slice(0, 16)}…` : "—"}</p></div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {run?.status === "ready_to_evaluate" ? (
        <Card className="glass-panel premium-card border-violet-400/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><FlaskConical className="size-5 text-violet-300" />3. One-shot evaluation</CardTitle>
            <CardDescription className="text-slate-300">This does not rerun the risk engine. It compares the already-frozen production outputs against sealed independent ground truth once.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={evaluate} disabled={Boolean(busy)}>{busy === "evaluate" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FlaskConical className="mr-2 size-4" />}Run one-shot evaluation</Button>
          </CardContent>
        </Card>
      ) : null}

      {evaluation ? (
        <Card className={`glass-panel premium-card ${evaluation.finalClaimGate.ready ? "border-green-400/30" : "border-amber-400/30"}`}>
          <CardHeader>
            <div className="flex flex-wrap gap-2"><Badge className={evaluation.finalClaimGate.ready ? "bg-green-400/10 text-green-200" : "bg-amber-400/10 text-amber-100"}>{evaluation.finalClaimGate.ready ? "CLAIM GATE READY" : "CLAIM GATE NOT READY"}</Badge><Badge variant="outline">Observed · frozen · one-shot</Badge></div>
            <CardTitle className="mt-3 text-white">Independent Holdout v1 result</CardTitle>
            <CardDescription className="text-slate-300">Observed result only. If this gate fails, do not tune against this holdout; record the result and create a new Holdout version for future changes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Cases</p><p className="mt-1 text-2xl font-semibold text-white">{evaluation.metrics.totalCases}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Acceptable agreement</p><p className="mt-1 text-2xl font-semibold text-white">{percent(evaluation.metrics.acceptableDecisionAccuracy)}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Malicious precision / recall</p><p className="mt-1 text-lg font-semibold text-white">{percent(evaluation.metrics.maliciousPrecision)} / {percent(evaluation.metrics.maliciousRecall)}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Critical false approvals</p><p className={`mt-1 text-2xl font-semibold ${evaluation.metrics.criticalFalseApprovals === 0 ? "text-green-300" : "text-red-300"}`}>{evaluation.metrics.criticalFalseApprovals}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Malicious containment</p><p className="mt-1 text-2xl font-semibold text-white">{percent(evaluation.metrics.maliciousContainmentRate)}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Organic false reject</p><p className="mt-1 text-2xl font-semibold text-white">{percent(evaluation.metrics.organicFalseRejectRate)}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Manual review rate</p><p className="mt-1 text-2xl font-semibold text-white">{percent(evaluation.metrics.manualReviewRate)}</p></div>
              <div className="rounded-xl border border-border p-4"><p className="text-xs text-slate-400">Observation seal</p><p className="mt-1 truncate font-mono text-sm text-violet-200">{evaluation.observationsHash.slice(0, 16)}…</p></div>
            </div>
            {evaluation.finalClaimGate.reasons.length ? <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-100"><p className="font-semibold">Claim gate reasons</p><ul className="mt-2 list-disc space-y-1 pl-5">{evaluation.finalClaimGate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : <div className="rounded-xl border border-green-400/25 bg-green-400/5 p-4 text-sm text-green-100">Frozen stack, independent design, operational gate, claim-readiness minimums and critical false-approval gate all passed.</div>}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
