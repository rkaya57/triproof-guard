"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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
  const [status, setStatus] = useState<Partial<AnalysisProcessingStatus>>(
    initialStatus ?? { analysisId, status: "processing", progressPercent: 0 }
  )
  const [error, setError] = useState("")

  async function loadStatus() {
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
  }

  useEffect(() => {
    let active = true
    const timer = window.setInterval(() => {
      loadStatus().catch((caughtError: Error) => {
        if (active) setError(caughtError.message)
      })
    }, 5000)

    loadStatus().catch((caughtError: Error) => {
      if (active) setError(caughtError.message)
    })

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [analysisId])

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
              Tri-Proof Guard is enriching wallets batch by batch. This page updates automatically.
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
              {(status.processedWalletCount ?? 0).toLocaleString()} / {(status.totalWallets ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Batches</p>
            <p className="text-lg font-semibold">
              {(status.completedBatchCount ?? 0).toLocaleString()} / {(status.batchCount ?? 0).toLocaleString()}
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

        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <Button variant="outline" onClick={() => loadStatus()}>
          <RefreshCw data-icon="inline-start" />
          Refresh status
        </Button>
      </CardContent>
    </Card>
  )
}
