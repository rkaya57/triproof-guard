"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Download, GitCompareArrows, Loader2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type Metrics = {
  acceptableDecisionAccuracy: number
  maliciousContainmentRate: number | null
  organicFalseRejectRate: number | null
  manualReviewRate: number
}

type CalibrationMismatch = {
  caseId: string
  chain: string
  walletAddress: string
  label: string
  expectedDecision: string
  predictedDecision: string
  riskScore: number
  split: "development" | "validation" | "holdout"
  category:
    | "malicious_false_approval"
    | "organic_false_reject"
    | "organic_manual_review"
    | "other_decision_mismatch"
}

type CalibrationSummary = {
  labelCounts: Record<string, number>
  secondReviewRequiredCases: number
  metrics: Metrics
  mismatches: CalibrationMismatch[]
}

type AdjudicationChange = {
  caseId: string
  chain: string
  walletAddress: string
  firstLabel: string
  adjudicatedLabel: string
  firstExpectedDecision: string
  adjudicatedExpectedDecision: string
  firstReviewers: string[]
  secondReviewers: string[]
  independentReviewer: boolean
}

type AdjudicationResponse = {
  schemaVersion: string
  batchId: string
  claimEligible: false
  provenance: {
    firstReviewPreserved: true
    adjudicationLayerSha256: string
    secondReviewRows: number
    independentReviewerCases: number
    independenceSatisfied: boolean
    reviewerNameSeparatedCases: number
    reviewerNameSeparationSatisfied: boolean
    externalIndependenceSatisfied: false
    note: string
  }
  original: CalibrationSummary
  adjudicated: CalibrationSummary
  changes: AdjudicationChange[]
  adjudicatedReviewerCsv: string
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

function csvCell(value: string | number) {
  const text = String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function mismatchCsv(items: CalibrationMismatch[]) {
  const headers = [
    "case_id",
    "chain",
    "wallet_address",
    "label",
    "expected_decision",
    "predicted_decision",
    "risk_score",
    "split",
    "category",
  ]
  const rows = items.map((item) => [
    item.caseId,
    item.chain,
    item.walletAddress,
    item.label,
    item.expectedDecision,
    item.predictedDecision,
    item.riskScore,
    item.split,
    item.category,
  ])
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`
}

function categoryLabel(category: CalibrationMismatch["category"]) {
  switch (category) {
    case "malicious_false_approval":
      return "malicious → approved"
    case "organic_false_reject":
      return "organic → rejected"
    case "organic_manual_review":
      return "organic → manual review"
    default:
      return "other mismatch"
  }
}

function MetricComparison({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/35 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
        <span>{before}</span>
        <span className="text-slate-500">→</span>
        <span className="text-cyan-200">{after}</span>
      </div>
    </div>
  )
}

export function CalibrationAdjudicationUpload() {
  const [reviewerFile, setReviewerFile] = useState<File | null>(null)
  const [sealFile, setSealFile] = useState<File | null>(null)
  const [secondReviewFile, setSecondReviewFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AdjudicationResponse | null>(null)

  async function runAdjudication() {
    if (!reviewerFile || !sealFile || !secondReviewFile) {
      setError("Original reviewer CSV, original private seal ve completed second-review CSV birlikte gerekli.")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.set("reviewerCsv", reviewerFile)
      formData.set("privateSeal", sealFile)
      formData.set("secondReviewCsv", secondReviewFile)

      const response = await fetch("/api/admin/benchmark/internal-adjudication", {
        method: "POST",
        body: formData,
      })
      const text = await response.text()
      let payload: AdjudicationResponse | { error?: string }
      try {
        payload = JSON.parse(text) as AdjudicationResponse | { error?: string }
      } catch {
        throw new Error(text.trim() || `Adjudication returned an invalid response (HTTP ${response.status}).`)
      }

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            "Admin session is not active or this account is not authorized. Sign out, sign back in with an approved admin account, then retry."
          )
        }
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : `Adjudication failed (HTTP ${response.status}).`
        )
      }
      setResult(payload as AdjudicationResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Adjudication failed")
    } finally {
      setLoading(false)
    }
  }

  const totalCases = result
    ? Object.values(result.adjudicated.labelCounts).reduce((sum, count) => sum + count, 0)
    : 0

  return (
    <Card className="glass-panel premium-card border-violet-400/25">
      <CardHeader>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-violet-400/30 bg-violet-400/10 text-violet-100">
            Internal Adjudication v1
          </Badge>
          <Badge variant="outline" className="border-yellow-400/30 bg-yellow-400/10 text-yellow-100">
            CLAIM-INELIGIBLE
          </Badge>
        </div>
        <CardTitle className="mt-3 flex items-center gap-2 text-white">
          <GitCompareArrows className="size-5 text-violet-300" />
          Compare first review with completed second review
        </CardTitle>
        <CardDescription className="max-w-4xl text-slate-300">
          This layer preserves the original sealed first-review result, validates the second-review rows against the same sealed case identities, and computes a separate adjudicated calibration. It never rewrites the first-review result and cannot unlock an external accuracy claim.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="rounded-xl border border-border bg-background/40 p-4 text-sm text-slate-300">
            <span className="mb-2 block font-semibold text-white">Original completed reviewer CSV</span>
            <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(event) => setReviewerFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="rounded-xl border border-border bg-background/40 p-4 text-sm text-slate-300">
            <span className="mb-2 block font-semibold text-white">Original PRIVATE seal</span>
            <input type="file" accept=".gz,.json,application/gzip,application/json" className="block w-full text-sm" onChange={(event) => setSealFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="rounded-xl border border-border bg-background/40 p-4 text-sm text-slate-300">
            <span className="mb-2 block font-semibold text-white">Completed second-review CSV</span>
            <input type="file" accept=".csv,text/csv" className="block w-full text-sm" onChange={(event) => setSecondReviewFile(event.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4 text-sm leading-6 text-slate-300">
          This workflow is for internal error discovery. Reviewer-name separation is recorded as provenance, but it is not equivalent to independent human review. Public claims remain blocked until the independent holdout workflow is completed.
        </div>

        <Button onClick={runAdjudication} disabled={loading || !reviewerFile || !sealFile || !secondReviewFile}>
          {loading ? (
            <><Loader2 className="mr-2 size-4 animate-spin" />Running adjudication…</>
          ) : (
            <><GitCompareArrows className="mr-2 size-4" />Run internal adjudication</>
          )}
        </Button>

        {error ? (
          <div className="flex gap-3 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-100">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-300" />
            <p>{error}</p>
          </div>
        ) : null}

        {result ? (
          <div className="space-y-6">
            <div className="flex gap-3 rounded-xl border border-green-400/25 bg-green-400/5 p-4 text-sm text-green-100">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-300" />
              <div>
                <p className="font-semibold">Adjudication layer verified — batch {result.batchId}</p>
                <p className="mt-1 text-green-100/75">Original first-review result remains preserved. Second-review fingerprint: <span className="font-mono">{result.provenance.adjudicationLayerSha256.slice(0, 16)}…</span></p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricComparison label="Acceptable decision agreement" before={percent(result.original.metrics.acceptableDecisionAccuracy)} after={percent(result.adjudicated.metrics.acceptableDecisionAccuracy)} />
              <MetricComparison label="Malicious containment" before={percent(result.original.metrics.maliciousContainmentRate)} after={percent(result.adjudicated.metrics.maliciousContainmentRate)} />
              <MetricComparison label="Organic false reject" before={percent(result.original.metrics.organicFalseRejectRate)} after={percent(result.adjudicated.metrics.organicFalseRejectRate)} />
              <MetricComparison label="Manual review rate" before={percent(result.original.metrics.manualReviewRate)} after={percent(result.adjudicated.metrics.manualReviewRate)} />
            </div>
            <p className="text-xs leading-5 text-slate-400">
              These are internal calibration agreement/workload metrics, not real-world accuracy claims.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border p-4 text-sm text-slate-300">
                <p className="font-semibold text-white">Adjudication provenance</p>
                <div className="mt-3 space-y-2">
                  <p>Second-review rows: <strong className="text-white">{result.provenance.secondReviewRows}</strong></p>
                  <p>Reviewer-name separated cases: <strong className="text-white">{result.provenance.reviewerNameSeparatedCases}</strong></p>
                  <p>Name-separation signal: <strong className={result.provenance.reviewerNameSeparationSatisfied ? "text-cyan-200" : "text-amber-300"}>{result.provenance.reviewerNameSeparationSatisfied ? "PRESENT" : "PARTIAL"}</strong></p>
                  <p>External human independence: <strong className="text-amber-300">NOT SATISFIED</strong></p>
                </div>
                <p className="mt-3 leading-6 text-slate-400">{result.provenance.note}</p>
              </div>
              <div className="rounded-xl border border-border p-4 text-sm text-slate-300">
                <p className="font-semibold text-white">Malicious-label queue after adjudication</p>
                <p className="mt-3 text-3xl font-semibold text-violet-200">{result.adjudicated.secondReviewRequiredCases}</p>
                <p className="mt-2 text-slate-400">Cases still labeled sybil/bot in the adjudicated layer.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-background/50 px-4 py-3 text-sm font-semibold text-white">Adjudicated case changes</div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-background text-slate-400">
                    <tr>
                      <th className="px-3 py-2">Case</th>
                      <th className="px-3 py-2">First label</th>
                      <th className="px-3 py-2">Adjudicated label</th>
                      <th className="px-3 py-2">First decision</th>
                      <th className="px-3 py-2">Adjudicated decision</th>
                      <th className="px-3 py-2">Name separated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.changes.map((item) => (
                      <tr key={item.caseId} className="border-t border-border/60 text-slate-300">
                        <td className="px-3 py-2 font-mono">{item.caseId}</td>
                        <td className="px-3 py-2">{item.firstLabel}</td>
                        <td className="px-3 py-2">{item.adjudicatedLabel}</td>
                        <td className="px-3 py-2">{item.firstExpectedDecision}</td>
                        <td className="px-3 py-2">{item.adjudicatedExpectedDecision}</td>
                        <td className={item.independentReviewer ? "px-3 py-2 text-cyan-200" : "px-3 py-2 text-amber-300"}>{item.independentReviewer ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-amber-400/25">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-amber-400/5 px-4 py-4">
                <div>
                  <p className="font-semibold text-white">Adjudicated current-engine mismatch map</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {result.adjudicated.mismatches.length} unacceptable decision mismatches remain across {totalCases} sealed calibration cases.
                  </p>
                </div>
                <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-100">
                  {result.adjudicated.mismatches.length} remaining
                </Badge>
              </div>
              {result.adjudicated.mismatches.length ? (
                <>
                  <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-4">
                    {(["malicious_false_approval", "organic_false_reject", "organic_manual_review", "other_decision_mismatch"] as const).map((category) => (
                      <div key={category} className="rounded-lg border border-border bg-background/35 p-3">
                        <p className="text-xs text-slate-400">{categoryLabel(category)}</p>
                        <p className="mt-1 text-xl font-semibold text-white">{result.adjudicated.mismatches.filter((item) => item.category === category).length}</p>
                      </div>
                    ))}
                  </div>
                  <div className="max-h-96 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-background text-slate-400">
                        <tr>
                          <th className="px-3 py-2">Case</th>
                          <th className="px-3 py-2">Chain</th>
                          <th className="px-3 py-2">Label</th>
                          <th className="px-3 py-2">Expected</th>
                          <th className="px-3 py-2">Predicted</th>
                          <th className="px-3 py-2">Risk</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Split</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.adjudicated.mismatches.map((item) => (
                          <tr key={item.caseId} className="border-t border-border/60 text-slate-300">
                            <td className="px-3 py-2 font-mono" title={item.walletAddress}>{item.caseId}</td>
                            <td className="px-3 py-2">{item.chain}</td>
                            <td className="px-3 py-2">{item.label}</td>
                            <td className="px-3 py-2">{item.expectedDecision}</td>
                            <td className="px-3 py-2 text-amber-200">{item.predictedDecision}</td>
                            <td className="px-3 py-2">{item.riskScore}</td>
                            <td className="px-3 py-2">{categoryLabel(item.category)}</td>
                            <td className="px-3 py-2">{item.split}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="p-5 text-sm text-green-200">No unacceptable adjudicated decision mismatches remain.</div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => downloadText(`tri-proof-internal-adjudication-${result.batchId}.csv`, result.adjudicatedReviewerCsv)}>
                <Download className="mr-2 size-4" />Download adjudicated calibration CSV
              </Button>
              <Button variant="outline" disabled={!result.adjudicated.mismatches.length} onClick={() => downloadText(`tri-proof-internal-adjudication-${result.batchId}-mismatches.csv`, mismatchCsv(result.adjudicated.mismatches))}>
                <Download className="mr-2 size-4" />Download mismatch map
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
