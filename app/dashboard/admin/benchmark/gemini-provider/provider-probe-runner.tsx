"use client"

import { useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Network } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type ProbeAttempt = {
  model: string
  mode: "basic" | "structured"
  ok: boolean
  httpStatus: number | null
  providerStatus: string | null
  providerCode: number | null
  latencyMs: number | null
  responseObserved: boolean
  detail: string
}

type ProbeResponse = {
  version: string
  generatedAt: string
  keyConfigured: boolean
  configuredModel: string | null
  overallReady: boolean
  attempts: ProbeAttempt[]
}

export function ProviderProbeRunner() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProbeResponse | null>(null)

  async function runProbe() {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch("/api/admin/benchmark/gemini-provider-probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "RUN_GEMINI_PROVIDER_PROBE_V1" }),
      })
      const text = await response.text()
      let payload: ProbeResponse | { error?: string }
      try {
        payload = JSON.parse(text) as ProbeResponse | { error?: string }
      } catch {
        throw new Error(text.trim() || `Invalid provider-probe response (HTTP ${response.status}).`)
      }

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : `Gemini provider probe failed (HTTP ${response.status}).`
        )
      }
      setResult(payload as ProbeResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gemini provider probe failed")
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
              Gemini Provider Probe v1
            </Badge>
            <Badge variant="outline" className="border-yellow-400/30 bg-yellow-400/10 text-yellow-100">
              ADMIN ONLY
            </Badge>
          </div>
          <CardTitle className="mt-3 flex items-center gap-2 text-white">
            <Network className="size-5 text-cyan-300" />
            Diagnose Gemini connectivity and structured output
          </CardTitle>
          <CardDescription className="max-w-3xl text-slate-300">
            Tests Gemini 3.6 Flash and Gemini 3.5 Flash with a minimal basic request and a minimal structured-output request. The API key is never returned or logged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runProbe} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Probing Gemini provider…
              </>
            ) : (
              <>
                <Network className="mr-2 size-4" />
                Run Gemini Provider Probe
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
              result.overallReady
                ? "border-green-400/25 bg-green-400/5 text-green-100"
                : "border-red-400/30 bg-red-400/5 text-red-100"
            }`}
          >
            {result.overallReady ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-300" />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-300" />
            )}
            <div>
              <p className="font-semibold">
                Provider readiness: {result.overallReady ? "PASS" : "FAIL"}
              </p>
              <p className="mt-1 opacity-80">
                API key configured: {result.keyConfigured ? "yes" : "NO"} · Configured model: {result.configuredModel ?? "default"}
              </p>
            </div>
          </div>

          <Card className="glass-panel premium-card">
            <CardHeader>
              <CardTitle className="text-white">Provider attempts</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Mode</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2">HTTP</th>
                    <th className="px-3 py-2">Provider status</th>
                    <th className="px-3 py-2">Latency</th>
                    <th className="px-3 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {result.attempts.map((attempt) => (
                    <tr key={`${attempt.model}:${attempt.mode}`} className="border-t border-border text-slate-200">
                      <td className="px-3 py-2 font-medium text-white">{attempt.model}</td>
                      <td className="px-3 py-2">{attempt.mode}</td>
                      <td className="px-3 py-2">{attempt.ok ? "PASS" : "FAIL"}</td>
                      <td className="px-3 py-2">{attempt.httpStatus ?? "n/a"}</td>
                      <td className="px-3 py-2">{attempt.providerStatus ?? "n/a"}</td>
                      <td className="px-3 py-2">{attempt.latencyMs === null ? "n/a" : `${attempt.latencyMs} ms`}</td>
                      <td className="max-w-[420px] px-3 py-2 text-slate-400">{attempt.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
