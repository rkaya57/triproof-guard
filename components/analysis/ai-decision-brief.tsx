"use client"

import { useEffect, useState } from "react"
import { Bot, BrainCircuit, Lightbulb, RefreshCw, ShieldCheck, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import type { AiReportBrief, AiReportEvidenceMeta } from "@/lib/ai/report-types"
import type { AiAnalysisBrief } from "@/types"

type BriefResponse = {
  brief: AiReportBrief
  evidenceMeta?: AiReportEvidenceMeta
  cached: boolean
  message?: string
}

function sourceLabel(brief: AiReportBrief) {
  return brief.source === "gemini"
    ? `Gemini audit report · ${brief.model ?? "Gemini"}`
    : "Deterministic evidence fallback"
}

function percent(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "n/a"
}

export function AiDecisionBriefPanel({
  analysisId,
  initialBrief,
  onBriefChange,
}: {
  analysisId: string
  initialBrief?: AiAnalysisBrief | null
  onBriefChange: (brief: AiAnalysisBrief) => void
}) {
  const [brief, setBrief] = useState<AiReportBrief | null>(initialBrief ?? null)
  const [evidenceMeta, setEvidenceMeta] = useState<AiReportEvidenceMeta | null>(null)
  const [loading, setLoading] = useState(!initialBrief)
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let active = true
    fetch(`/api/analysis/${analysisId}/ai-brief`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | BriefResponse
          | { error?: string }
          | null
        if (!response.ok || !body || !("brief" in body)) {
          throw new Error(
            (body as { error?: string } | null)?.error ??
              "AI decision report could not be loaded"
          )
        }
        return body
      })
      .then((body) => {
        if (!active) return
        setBrief(body.brief)
        setEvidenceMeta(body.evidenceMeta ?? body.brief.evidenceMeta ?? null)
        onBriefChange(body.brief)
      })
      .catch(() => {
        // The deterministic analysis report remains fully usable if this optional layer is unavailable.
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [analysisId, onBriefChange])

  async function generateBrief() {
    setGenerating(true)
    try {
      const response = await fetch(`/api/analysis/${analysisId}/ai-brief`, { method: "POST" })
      const body = (await response.json().catch(() => null)) as
        | BriefResponse
        | { error?: string }
        | null
      if (!response.ok || !body || !("brief" in body)) {
        throw new Error(
          (body as { error?: string } | null)?.error ??
            "AI decision report could not be generated"
        )
      }
      setBrief(body.brief)
      setEvidenceMeta(body.evidenceMeta ?? body.brief.evidenceMeta ?? null)
      onBriefChange(body.brief)
      toast(
        body.brief.source === "gemini"
          ? "Audited Gemini decision report generated"
          : "Deterministic evidence fallback report saved",
        body.brief.source === "gemini" ? "success" : "info"
      )
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "AI decision report could not be generated",
        "error"
      )
    } finally {
      setGenerating(false)
    }
  }

  const meta = evidenceMeta ?? brief?.evidenceMeta ?? null
  const auditedAiAvailable = Boolean(
    meta && (meta.walletAssessments > 0 || meta.clusterAssessments > 0)
  )

  return (
    <Card className="glass-panel premium-card">
      <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-primary" />
            AI evidence report
          </CardTitle>
          <CardDescription className="mt-2 max-w-3xl">
            A customer-facing summary built from deterministic report evidence and the privacy-reduced production AI Evidence Analyst audit. AI can recommend review or additional evidence, but it cannot change deterministic risk scores or directly approve/reject wallets.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => void generateBrief()} disabled={generating}>
          {generating ? (
            <RefreshCw className="animate-spin" data-icon="inline-start" />
          ) : (
            <Bot data-icon="inline-start" />
          )}
          {brief?.source === "gemini" ? "Refresh AI report" : "Generate AI report"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !brief ? (
          <div className="grid gap-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
          </div>
        ) : brief ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={
                  brief.source === "gemini"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-amber-400/40 bg-amber-400/10 text-amber-200"
                }
              >
                {sourceLabel(brief)}
              </Badge>
              {auditedAiAvailable && (
                <Badge variant="outline" className="border-cyan-400/40 bg-cyan-400/10 text-cyan-200">
                  <ShieldCheck className="mr-1 size-3.5" /> Audited production AI evidence
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Generated {new Date(brief.generatedAt).toLocaleString()}
              </span>
            </div>

            {meta && auditedAiAvailable && (
              <section className="grid gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="size-4 text-cyan-300" />
                  <p className="text-sm font-medium">AI evidence coverage</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Wallet assessments</p>
                    <p className="mt-1 text-lg font-semibold">{meta.walletAssessments}</p>
                    <p className="text-xs text-muted-foreground">
                      {meta.walletGeminiResponses} Gemini · {meta.walletFallbacks} fallback
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg confidence</p>
                    <p className="mt-1 text-lg font-semibold">{percent(meta.averageConfidence)}</p>
                    <p className="text-xs text-muted-foreground">Decision-support confidence</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Evidence sufficiency</p>
                    <p className="mt-1 text-lg font-semibold">{percent(meta.averageEvidenceSufficiency)}</p>
                    <p className="text-xs text-muted-foreground">Across AI-reviewed wallets</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/30 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">One-way escalations</p>
                    <p className="mt-1 text-lg font-semibold">{meta.gateEscalations}</p>
                    <p className="text-xs text-muted-foreground">
                      Risk mutations: {meta.riskMutationViolations}
                    </p>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  The AI sidecar intentionally reviews a bounded subset of materially ambiguous wallets. It is not a second risk score and does not imply every wallet received an LLM assessment.
                </p>
              </section>
            )}

            <div className="grid gap-2 border-l-2 border-primary/60 pl-4">
              <p className="text-base font-medium text-foreground">{brief.executiveSummary}</p>
              <p className="text-sm leading-6 text-muted-foreground">{brief.decisionRationale}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="grid gap-2">
                <p className="text-sm font-medium">Primary evidence drivers</p>
                {brief.riskDrivers.map((driver) => (
                  <div
                    key={`${driver.title}-${driver.explanation}`}
                    className="rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{driver.title}</p>
                      <Badge
                        variant="outline"
                        className={
                          driver.severity === "high"
                            ? "border-red-400/40 text-red-200"
                            : driver.severity === "caution"
                              ? "border-amber-400/40 text-amber-200"
                              : "border-primary/40 text-primary"
                        }
                      >
                        {driver.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {driver.explanation}
                    </p>
                  </div>
                ))}
              </section>

              <section className="grid content-start gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="size-4 text-primary" /> Recommended actions
                  </p>
                  <ul className="mt-2 grid gap-2 text-sm leading-6 text-muted-foreground">
                    {brief.recommendedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium">Limits of this AI report</p>
                  <ul className="mt-2 grid gap-2 text-xs leading-5 text-muted-foreground">
                    {brief.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No AI explanation is available for this report yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
