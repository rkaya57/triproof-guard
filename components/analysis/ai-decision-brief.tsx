"use client"

import { useEffect, useState } from "react"
import { Bot, Lightbulb, RefreshCw, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/components/ui/toast"
import type { AiAnalysisBrief } from "@/types"

type BriefResponse = {
  brief: AiAnalysisBrief
  cached: boolean
  message?: string
}

function sourceLabel(brief: AiAnalysisBrief) {
  return brief.source === "gemini" ? brief.model ?? "Gemini" : "Evidence fallback"
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
  const [brief, setBrief] = useState<AiAnalysisBrief | null>(initialBrief ?? null)
  const [loading, setLoading] = useState(!initialBrief)
  const [generating, setGenerating] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    let active = true
    fetch(`/api/analysis/${analysisId}/ai-brief`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as BriefResponse | { error?: string } | null
        if (!response.ok || !body || !("brief" in body)) {
          throw new Error((body as { error?: string } | null)?.error ?? "AI decision brief could not be loaded")
        }
        return body
      })
      .then((body) => {
        if (!active) return
        setBrief(body.brief)
        onBriefChange(body.brief)
      })
      .catch(() => {
        // The report remains fully usable if the optional explanation endpoint is unavailable.
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
      const body = (await response.json().catch(() => null)) as BriefResponse | { error?: string } | null
      if (!response.ok || !body || !("brief" in body)) {
        throw new Error((body as { error?: string } | null)?.error ?? "AI decision brief could not be generated")
      }
      setBrief(body.brief)
      onBriefChange(body.brief)
      toast(
        body.brief.source === "gemini"
          ? "Gemini decision brief generated"
          : "Evidence-based fallback brief saved; configure Gemini to add AI phrasing",
        body.brief.source === "gemini" ? "success" : "info"
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : "AI decision brief could not be generated", "error")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card className="glass-panel premium-card">
      <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="text-primary" />
            AI decision brief
          </CardTitle>
          <CardDescription className="mt-2 max-w-3xl">
            A readable operational summary based only on aggregate report evidence. It cannot change scores, wallet status, or the underlying decision engine.
          </CardDescription>
        </div>
        <Button variant="outline" onClick={() => void generateBrief()} disabled={generating}>
          {generating ? <RefreshCw className="animate-spin" data-icon="inline-start" /> : <Bot data-icon="inline-start" />}
          {brief?.source === "gemini" ? "Refresh Gemini brief" : "Generate Gemini brief"}
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
              <Badge variant="outline" className={brief.source === "gemini" ? "border-primary/40 bg-primary/10 text-primary" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}>
                {sourceLabel(brief)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Generated {new Date(brief.generatedAt).toLocaleString()}
              </span>
            </div>

            <div className="grid gap-2 border-l-2 border-primary/60 pl-4">
              <p className="text-base font-medium text-foreground">{brief.executiveSummary}</p>
              <p className="text-sm leading-6 text-muted-foreground">{brief.decisionRationale}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="grid gap-2">
                <p className="text-sm font-medium">Primary risk drivers</p>
                {brief.riskDrivers.map((driver) => (
                  <div key={`${driver.title}-${driver.explanation}`} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{driver.title}</p>
                      <Badge variant="outline" className={driver.severity === "high" ? "border-red-400/40 text-red-200" : driver.severity === "caution" ? "border-amber-400/40 text-amber-200" : "border-primary/40 text-primary"}>
                        {driver.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{driver.explanation}</p>
                  </div>
                ))}
              </section>

              <section className="grid content-start gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium"><Lightbulb className="size-4 text-primary" /> Recommended actions</p>
                  <ul className="mt-2 grid gap-2 text-sm leading-6 text-muted-foreground">
                    {brief.recommendedActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-sm font-medium">Limits of this brief</p>
                  <ul className="mt-2 grid gap-2 text-xs leading-5 text-muted-foreground">
                    {brief.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
                  </ul>
                </div>
              </section>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No explanation is available for this report yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
