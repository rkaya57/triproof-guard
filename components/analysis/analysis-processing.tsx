"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RefreshCw, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatNumber } from "@/lib/format"

export type AnalysisProcessingStatus = {
  analysisId: string
  status: string
  totalWallets: number
  processedWalletCount: number
  progressPercent: number
  batchCount: number
  completedBatchCount: number
  processingBatchCount: number
  failedBatchCount: number
  failedEnrichmentCount: number
}

export function AnalysisProcessing({
  analysisId,
  initialStatus,
}: {
  analysisId: string
  initialStatus?: Partial<AnalysisProcessingStatus>
}) {
  const router = useRouter()
  const inFlight = useRef(false)
  const [status, setStatus] = useState<Partial<AnalysisProcessingStatus>>(
    initialStatus ?? { analysisId, status: "processing", progressPercent: 0 }
  )
  const [error, setError] = useState("")
  const [lastWorkerMessage, setLastWorkerMessage] = useState("")

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/analysis/${analysisId}/status`, { cache: "no-store" })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? "Could not load analysis status")
    }

    const nextStatus = (await response.json()) as AnalysisProcessingStatus
    setStatus(nextStatus)

    if (nextStatus.status === "completed") {
      router.refresh()
    }
    return nextStatus
  }, [analysisId, router])

  const processOneBatch = useCallback(async () => {
    const response = await fetch(`/api/analysis/${analysisId}/process`, {
      method: "POST",
      cache: "no-store",
    })
    const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; status?: string }
    if (!response.ok) throw new Error(body.error ?? "Could not process analysis batch")
    setLastWorkerMessage(body.message ?? body.status ?? "Batch trigger sent")
  }, [analysisId])

  const tick = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const current = await loadStatus()
      setError("")
      if (current.status !== "completed") {
        await processOneBatch()
        await loadStatus()
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Processing failed")
    } finally {
      inFlight.current = false
    }
  }, [loadStatus, processOneBatch])

  useEffect(() => {
    let active = true
    const run = () => {
      if (!active) return
      tick().catch((caughtError: Error) => {
        if (active) setError(caughtError.message)
      })
    }
    run()
    const timer = window.setInterval(run, 6500)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [tick])

  const progress = Math.max(0, Math.min(100, status.progressPercent ?? 0))

  return (
    <Card className="glass-panel mx-auto max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div>
            <CardTitle>Analysis is processing</CardTitle>
            <CardDescription>
              Tri-Proof Guard is enriching wallets with real on-chain data. Keep this page open while batches run.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Wallets</p>
            <p className="text-lg font-semibold">
              {formatNumber(status.processedWalletCount ?? 0)} / {formatNumber(status.totalWallets ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Batches</p>
            <p className="text-lg font-semibold">
              {formatNumber(status.completedBatchCount ?? 0)} / {formatNumber(status.batchCount ?? 0)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Processing</p>
            <p className="text-lg font-semibold">{status.processingBatchCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-lg font-semibold">{status.failedBatchCount ?? 0}</p>
          </div>
        </div>

        {lastWorkerMessage && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {lastWorkerMessage}
          </p>
        )}
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => tick()}>
            <Zap data-icon="inline-start" />
            Process next batch
          </Button>
          <Button variant="outline" onClick={() => loadStatus()}>
            <RefreshCw data-icon="inline-start" />
            Refresh status
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
