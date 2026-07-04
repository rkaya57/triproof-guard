"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"

import { AnalysisDetail } from "@/components/analysis/analysis-detail"
import { AnalysisProcessing, type AnalysisProcessingStatus } from "@/components/analysis/analysis-processing"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RouteState =
  | { status: "loading" }
  | { status: "processing"; data: Partial<AnalysisProcessingStatus> }
  | { status: "completed" }
  | { status: "error"; message: string }

export function AnalysisRouteClient({ analysisId }: { analysisId: string }) {
  const [state, setState] = useState<RouteState>({ status: "loading" })

  const markCompleted = useCallback(() => {
    setState({ status: "completed" })
  }, [])

  const markFailed = useCallback((message: string) => {
    setState({ status: "error", message })
  }, [])

  const fetchRouteState = useCallback(async (): Promise<RouteState> => {
    try {
      const response = await fetch(`/api/analysis/${analysisId}/status`, { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as Partial<AnalysisProcessingStatus> & { error?: string }

      if (!response.ok) {
        throw new Error(body.error ?? "Analysis status could not be loaded")
      }

      if (body.status === "completed") {
        return { status: "completed" }
      }

      if (body.status === "failed") {
        return {
          status: "error",
          message: "Analysis failed after the worker retried one or more batches. Start a new analysis or review worker diagnostics.",
        }
      }

      return { status: "processing", data: body }
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Analysis could not be loaded",
      }
    }
  }, [analysisId])

  useEffect(() => {
    let active = true
    async function load() {
      const nextState = await fetchRouteState()
      if (active) setState(nextState)
    }

    void load()

    return () => {
      active = false
    }
  }, [fetchRouteState])

  const retry = useCallback(async () => {
    setState({ status: "loading" })
    setState(await fetchRouteState())
  }, [fetchRouteState])

  if (state.status === "loading") {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="size-5 animate-spin text-primary" /> Loading analysis
            </CardTitle>
            <CardDescription>Checking analysis status without server-side database rendering.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  if (state.status === "processing") {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <AnalysisProcessing analysisId={analysisId} initialStatus={state.data} onCompleted={markCompleted} onFailed={markFailed} />
      </main>
    )
  }

  if (state.status === "completed") {
    return (
      <main className="premium-page min-h-screen bg-background text-foreground">
        <AnalysisDetail analysisId={analysisId} />
      </main>
    )
  }

  return (
    <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <Card className="glass-panel mx-auto max-w-2xl border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" /> Analysis could not load
          </CardTitle>
          <CardDescription>
            The page did not crash. The backend status endpoint returned the error below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {state.message}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void retry()}>
              <RotateCcw data-icon="inline-start" /> Retry
            </Button>
            <Link href="/dashboard/new-analysis" className={buttonVariants({ variant: "outline" })}>
              New analysis
            </Link>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
              Dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
