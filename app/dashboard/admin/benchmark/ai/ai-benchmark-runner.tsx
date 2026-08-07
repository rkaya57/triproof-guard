"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FlaskConical,
  Loader2,
  ShieldCheck,
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

type BenchmarkCase = {
  fixtureId: string
  kind: string
  expectedAiBehavior: string
  source: string
  model: string | null
  recommendation: string
  confidence: number | null
  evidenceSufficiency: number | null
  latencyMs: number | null
  gateApplied: boolean
  gateTrigger: string
  originalStatus: string
  finalStatus: string
  originalRiskScore: number
  finalRiskScore: number
  riskScoreUnchanged: boolean
  falseEscalation: boolean
  usefulEscalation: boolean
  summary: string
  fallbackReason?: string
}

type BenchmarkResponse = {
  schemaVersion: string
  suiteVersion: string
  claimEligible: false
  generatedAt: string
  modelRequested: string
  metrics: {
    walletCases: number
    geminiResponses: number
    fallbackResponses: number
    structuredResponseRate: number
    gateEscalations: number
    falseEscalations: number
    usefulEscalations: number
    riskMutations: number
    nonApprovedDecisionMutations: number
    medianLatencyMs: number | null
    p95LatencyMs: number | null
    clusterGeminiResponse: boolean
    clusterRecommendation: string
    clusterConfidence: number | null
    structuralSafetyPassed: boolean
    providerReady: boolean
  }
  cases: BenchmarkCase[]
  cluster: {
    source: string
    model: string | null
    recommendation: string
    confidence: number | null
    evidenceSufficiency: number | null
    coordinationEvidenceStrength: number | null
    neutralExplanationStrength: number | null
    latencyMs: number | null
    interpretation: string
    fallbackReason?: string
  }
  limitations: string[]
}

function percent(value: number) {
  return `${(value * 100).toFixed(0)}%`
}

function score(value: number | null) {
  return value === null ? "n/a" : value.toFixed(2)
}

export function AiBenchmarkRunner() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BenchmarkResponse | null>(null)

  async function runBenchmark() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch("/api/admin/benchmark/ai-sidecar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "RUN_AI_BENCHMARK_V1" }),
      })
      const text = await response.text()
      let payload: BenchmarkResponse | { error?: string }
      try {
        payload = JSON.parse(text) as BenchmarkResponse | { error?: string }
      } catch {
        throw new Error(text.trim() || `Invalid benchmark response (HTTP ${response.status}).`)
      }
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : `AI benchmark failed (HTTP ${response.status}).`
        )
      }
      setResult(payload as BenchmarkResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI benchmark failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="glass-panel premium-card border-cyan-400/25">
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">
              AI Sidecar Benchmark v1
            </Badge>
            <Badge
              variant="outline"
              className="border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
            >
              CLAIM-INELIGIBLE
            </Badge>
            <Badge
              variant="outline"
              className="border-green-400/30 bg-green-400/10 text-green-100"
            >
              CONTROLLED FIXTURES
            </Badge>
          </div>
          <CardTitle className="mt-3 flex items-center gap-2 text-white">
            <Bot className="size-5 text-cyan-300" />
            Gemini evidence sidecar safety benchmark
          </CardTitle>
          <CardDescription className="max-w-3xl text-slate-300">
            Runs four privacy-reduced wallet controls and one aggregate cluster
            control against the configured Gemini model. It measures structured
            response reliability, one-way disagreement-gate behavior, false
            escalation, useful review escalation, latency, and risk immutability.
            It never produces a public accuracy claim.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/5 p-4 text-sm text-yellow-50">
            This makes five live AI benchmark calls and writes privacy-reduced
            provenance events. A five-minute server-side cooldown prevents
            accidental repeated runs.
          </div>

          <Button onClick={runBenchmark} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Running controlled AI benchmark…
              </>
            ) : (
              <>
                <FlaskConical className="mr-2 size-4" />
                Run AI Sidecar Benchmark v1
              </>
            )}
          </Button>

          {error ? (
            <div className="flex gap-3 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-100">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-300" />
              <p>{error}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <div
            className={`flex gap-3 rounded-xl border p-4 text-sm ${
              result.metrics.structuralSafetyPassed
                ? "border-green-400/25 bg-green-400/5 text-green-100"
                : "border-red-400/30 bg-red-400/5 text-red-100"
            }`}
          >
            {result.metrics.structuralSafetyPassed ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-300" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-300" />
            )}
            <div>
              <p className="font-semibold">
                Structural safety: {result.metrics.structuralSafetyPassed ? "PASS" : "FAIL"}
              </p>
              <p className="mt-1 opacity-80">
                Model requested: {result.modelRequested} · Suite {result.suiteVersion}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric title="Structured response rate" value={percent(result.metrics.structuredResponseRate)} />
            <Metric title="False escalations" value={String(result.metrics.falseEscalations)} />
            <Metric title="Useful review escalations" value={String(result.metrics.usefulEscalations)} />
            <Metric title="Risk mutations" value={String(result.metrics.riskMutations)} />
            <Metric title="Gemini wallet responses" value={`${result.metrics.geminiResponses}/${result.metrics.walletCases}`} />
            <Metric title="Median latency" value={result.metrics.medianLatencyMs === null ? "n/a" : `${result.metrics.medianLatencyMs} ms`} />
            <Metric title="P95 latency" value={result.metrics.p95LatencyMs === null ? "n/a" : `${result.metrics.p95LatencyMs} ms`} />
            <Metric title="Cluster response" value={result.metrics.clusterGeminiResponse ? "Gemini" : "Fallback"} />
          </div>

          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <ShieldCheck className="size-5 text-primary" />
                Wallet safety controls
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Fixture</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Recommendation</th>
                    <th className="px-3 py-2">Confidence</th>
                    <th className="px-3 py-2">Sufficiency</th>
                    <th className="px-3 py-2">Gate</th>
                    <th className="px-3 py-2">Decision</th>
                    <th className="px-3 py-2">Risk immutable</th>
                  </tr>
                </thead>
                <tbody>
                  {result.cases.map((item) => (
                    <tr key={item.fixtureId} className="border-t border-border text-slate-200">
                      <td className="px-3 py-2 font-medium text-white">{item.fixtureId}</td>
                      <td className="px-3 py-2">{item.source}{item.model ? ` · ${item.model}` : ""}</td>
                      <td className="px-3 py-2">{item.recommendation}</td>
                      <td className="px-3 py-2">{score(item.confidence)}</td>
                      <td className="px-3 py-2">{score(item.evidenceSufficiency)}</td>
                      <td className="px-3 py-2">{item.gateApplied ? item.gateTrigger : "no-op"}</td>
                      <td className="px-3 py-2">{item.originalStatus} → {item.finalStatus}</td>
                      <td className="px-3 py-2">{item.riskScoreUnchanged ? "yes" : "NO"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle className="text-white">Aggregate cluster control</CardTitle>
              <CardDescription className="text-slate-300">
                The model sees only aggregate/opaque cluster evidence, never raw
                wallet or funder addresses.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>Source: <strong className="text-white">{result.cluster.source}</strong></p>
              <p>Recommendation: <strong className="text-white">{result.cluster.recommendation}</strong></p>
              <p>Confidence: <strong className="text-white">{score(result.cluster.confidence)}</strong></p>
              <p>Coordination evidence: <strong className="text-white">{score(result.cluster.coordinationEvidenceStrength)}</strong></p>
              <p>Neutral explanation strength: <strong className="text-white">{score(result.cluster.neutralExplanationStrength)}</strong></p>
              <p className="pt-2 text-slate-400">{result.cluster.interpretation}</p>
            </CardContent>
          </Card>

          <div className="rounded-xl border border-yellow-400/25 bg-yellow-400/5 p-4 text-sm text-yellow-100">
            <p className="font-semibold">Methodology boundary</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-yellow-100/80">
              {result.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{title}</p>
    </div>
  )
}
