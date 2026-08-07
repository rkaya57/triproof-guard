"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FlaskConical,
  Loader2,
  ShieldAlert,
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

type CalibrationMismatch = {
  caseId: string
  chain: string
  walletAddress: string
  label: string
  expectedDecision: string
  predictedDecision: string
  riskScore: number
  split: string
  category: string
}

type CalibrationResponse = {
  schemaVersion: string
  batchId: string
  claimEligible: false
  integrity: {
    reviewerSnapshotMatchesSeal: boolean
    auditMatchesSeal: boolean
    reviewerCases: number
    auditRows: number
  }
  normalization: {
    legacyExpectedDecisionRows: number
    legacyMaliciousExpectationRows: number
    numericConfidenceRows: number
    jsonListRows: number
  }
  labelCounts: Record<string, number>
  secondReviewRequiredCases: number
  report: {
    metrics: {
      totalCases: number
      acceptableDecisionAccuracy: number
      maliciousPrecision: number | null
      maliciousRecall: number | null
      maliciousF1: number | null
      maliciousContainmentRate: number | null
      criticalFalseApprovals: number
      organicFalseRejectRate: number | null
      manualReviewRate: number
      operationalGate: { passed: boolean }
      claimReadiness: {
        ready: boolean
        realWorldHoldoutCases: number
        realWorldMaliciousCases: number
        realWorldOrganicCases: number
        representedChains: number
      }
      bySplit: Record<
        string,
        {
          cases: number
          acceptableDecisionAccuracy: number
          maliciousPrecision: number | null
          maliciousRecall: number | null
          maliciousF1: number | null
          organicFalseRejectRate: number | null
          manualReviewRate: number
        }
      >
    }
  }
  mismatches: CalibrationMismatch[]
  normalizedReviewerCsv: string
  secondReviewerCsv: string
}

function percent(value: number | null) {
  return value === null ? "n/a" : `${(value * 100).toFixed(2)}%`
}

function downloadText(fileName: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function mismatchLabel(category: string) {
  if (category === "malicious_false_approval") return "Malicious → approved"
  if (category === "organic_false_reject") return "Organic → rejected"
  if (category === "organic_manual_review") return "Organic → manual review"
  return "Decision mismatch"
}

export function CalibrationUpload() {
  const [reviewerFile, setReviewerFile] = useState<File | null>(null)
  const [sealFile, setSealFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CalibrationResponse | null>(null)

  const mismatchCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    result?.mismatches.forEach((item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1
    })
    return counts
  }, [result])

  async function runCalibration() {
    if (!reviewerFile || !sealFile) {
      setError("Reviewer CSV ve private seal dosyasını birlikte seç.")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.set("reviewerCsv", reviewerFile)
      formData.set("privateSeal", sealFile)

      const response = await fetch("/api/admin/benchmark/internal-calibration", {
        method: "POST",
        body: formData,
      })
      const payload = (await response.json()) as CalibrationResponse | { error?: string }
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Calibration failed")
      }
      setResult(payload as CalibrationResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calibration failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="glass-panel premium-card border-cyan-400/25">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">
            Internal Calibration v1
          </Badge>
          <Badge
            variant="outline"
            className="border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
          >
            CLAIM-INELIGIBLE
          </Badge>
        </div>
        <CardTitle className="mt-3 flex items-center gap-2 text-white">
          <FlaskConical className="size-5 text-cyan-300" />
          Run the returned blind-review batch
        </CardTitle>
        <CardDescription className="max-w-3xl text-slate-300">
          Upload the completed reviewer CSV together with its original private
          seal. Tri-Proof verifies both hashes, normalizes legacy reviewer
          formatting, replays the sealed campaign context through the current
          engine, and extracts only the malicious labels that still need a
          second independent review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="rounded-xl border border-border bg-background/40 p-4 text-sm text-slate-300">
            <span className="mb-2 block font-semibold text-white">Completed reviewer CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full text-sm"
              onChange={(event) => setReviewerFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label className="rounded-xl border border-border bg-background/40 p-4 text-sm text-slate-300">
            <span className="mb-2 block font-semibold text-white">Original PRIVATE seal</span>
            <input
              type="file"
              accept=".gz,.json,application/gzip,application/json"
              className="block w-full text-sm"
              onChange={(event) => setSealFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <Button onClick={runCalibration} disabled={loading || !reviewerFile || !sealFile}>
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Replaying current engine…
            </>
          ) : (
            <>
              <FlaskConical className="mr-2 size-4" />
              Verify & run internal calibration
            </>
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
                <p className="font-semibold">Seal integrity verified — batch {result.batchId}</p>
                <p className="mt-1 text-green-100/75">
                  Reviewer snapshot and private audit hashes match. This report is
                  locked to internal calibration and cannot satisfy the external
                  accuracy-claim gate.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border p-4">
                <p className="text-2xl font-semibold text-white">
                  {percent(result.report.metrics.acceptableDecisionAccuracy)}
                </p>
                <p className="text-xs text-slate-400">Acceptable decision accuracy</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-2xl font-semibold text-white">
                  {percent(result.report.metrics.maliciousContainmentRate)}
                </p>
                <p className="text-xs text-slate-400">Malicious containment</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-2xl font-semibold text-white">
                  {percent(result.report.metrics.organicFalseRejectRate)}
                </p>
                <p className="text-xs text-slate-400">Organic false reject rate</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-2xl font-semibold text-white">
                  {result.secondReviewRequiredCases}
                </p>
                <p className="text-xs text-slate-400">Cases needing second review</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border p-4 text-sm text-slate-300">
                <p className="mb-3 font-semibold text-white">Current-engine mismatch map</p>
                <div className="space-y-2">
                  <p>Malicious → approved: <strong className="text-white">{mismatchCounts.malicious_false_approval ?? 0}</strong></p>
                  <p>Organic → rejected: <strong className="text-white">{mismatchCounts.organic_false_reject ?? 0}</strong></p>
                  <p>Organic → manual review: <strong className="text-white">{mismatchCounts.organic_manual_review ?? 0}</strong></p>
                  <p>Other mismatch: <strong className="text-white">{mismatchCounts.other_decision_mismatch ?? 0}</strong></p>
                </div>
              </div>
              <div className="rounded-xl border border-border p-4 text-sm text-slate-300">
                <p className="mb-3 font-semibold text-white">Legacy formatting normalized</p>
                <div className="space-y-2">
                  <p>Decision values: {result.normalization.legacyExpectedDecisionRows}</p>
                  <p>Malicious-expectation values: {result.normalization.legacyMaliciousExpectationRows}</p>
                  <p>Numeric confidence values: {result.normalization.numericConfidenceRows}</p>
                  <p>JSON acceptable-decision lists: {result.normalization.jsonListRows}</p>
                </div>
              </div>
            </div>

            {result.mismatches.length ? (
              <div className="overflow-hidden rounded-xl border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-background/50 px-4 py-3 text-sm font-semibold text-white">
                  <ShieldAlert className="size-4 text-yellow-300" />
                  Highest-priority decision mismatches
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-background text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Chain</th>
                        <th className="px-3 py-2">Wallet</th>
                        <th className="px-3 py-2">Human</th>
                        <th className="px-3 py-2">Engine</th>
                        <th className="px-3 py-2">Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.mismatches.slice(0, 50).map((item) => (
                        <tr key={item.caseId} className="border-t border-border/60 text-slate-300">
                          <td className="px-3 py-2">{mismatchLabel(item.category)}</td>
                          <td className="px-3 py-2">{item.chain}</td>
                          <td className="max-w-44 truncate px-3 py-2 font-mono">{item.walletAddress}</td>
                          <td className="px-3 py-2">{item.expectedDecision}</td>
                          <td className="px-3 py-2">{item.predictedDecision}</td>
                          <td className="px-3 py-2">{item.riskScore}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  downloadText(
                    `tri-proof-internal-calibration-${result.batchId}-normalized.csv`,
                    result.normalizedReviewerCsv
                  )
                }
              >
                <Download className="mr-2 size-4" />
                Download normalized calibration CSV
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadText(
                    `tri-proof-second-review-${result.batchId}.csv`,
                    result.secondReviewerCsv
                  )
                }
              >
                <Download className="mr-2 size-4" />
                Download blind second-review CSV ({result.secondReviewRequiredCases})
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
