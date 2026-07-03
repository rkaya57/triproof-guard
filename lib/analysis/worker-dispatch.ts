import { after } from "next/server"

import { processAnalysisQueue } from "@/lib/analysis/queue-optimizer"

const DEFAULT_BOOTSTRAP_BATCHES = Number.parseInt(process.env.WORKER_BOOTSTRAP_MAX_BATCHES ?? "8", 10)
const DEFAULT_BOOTSTRAP_TIME_BUDGET_MS = Number.parseInt(process.env.WORKER_BOOTSTRAP_TIME_BUDGET_MS ?? "45000", 10)

function safeNumber(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function dispatchAnalysisWorker({
  analysisId,
  reason,
}: {
  analysisId: string
  reason: string
}) {
  const maxBatches = safeNumber(DEFAULT_BOOTSTRAP_BATCHES, 8, 1, 10)
  const timeBudgetMs = safeNumber(DEFAULT_BOOTSTRAP_TIME_BUDGET_MS, 45_000, 1_000, 45_000)

  after(async () => {
    try {
      await processAnalysisQueue({
        analysisId,
        maxBatches,
        timeBudgetMs,
        recoverStale: true,
      })
    } catch (error) {
      console.error("Analysis worker dispatch failed", {
        analysisId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
