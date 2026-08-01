import { after } from "next/server"

import { processAnalysisQueue } from "@/lib/analysis/queue-optimizer"

const DEFAULT_BOOTSTRAP_BATCHES = Number.parseInt(process.env.WORKER_BOOTSTRAP_MAX_BATCHES ?? "25", 10)
const DEFAULT_BOOTSTRAP_TIME_BUDGET_MS = Number.parseInt(process.env.WORKER_BOOTSTRAP_TIME_BUDGET_MS ?? "240000", 10)
const CONTINUATION_BATCHES = Number.parseInt(process.env.WORKER_CONTINUATION_MAX_BATCHES ?? "25", 10)
const CONTINUATION_TIME_BUDGET_MS = Number.parseInt(process.env.WORKER_CONTINUATION_TIME_BUDGET_MS ?? "240000", 10)

type QueueSnapshot = {
  pending: number
  processing: number
  staleProcessing?: number
}

function safeNumber(value: number, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function siteOrigin() {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    "https://triproofprotocol.com"

  const withProtocol = configured.startsWith("http")
    ? configured
    : `https://${configured}`

  return withProtocol.replace(/\/$/, "")
}

function workerSecret() {
  return process.env.WORKER_SECRET ?? process.env.ANALYSIS_WORKER_SECRET ?? process.env.CRON_SECRET ?? ""
}

function needsContinuation(queue: QueueSnapshot | null | undefined) {
  if (!queue) return false
  return (queue.staleProcessing ?? 0) > 0 || (queue.pending > 0 && queue.processing === 0)
}

async function requestWorkerContinuation({
  analysisId,
  reason,
}: {
  analysisId: string
  reason: string
}) {
  const maxBatches = safeNumber(CONTINUATION_BATCHES, 25, 1, 50)
  const timeBudgetMs = safeNumber(CONTINUATION_TIME_BUDGET_MS, 240_000, 1_000, 280_000)
  const url = new URL("/api/worker/analysis-queue", siteOrigin())
  url.searchParams.set("analysisId", analysisId)
  url.searchParams.set("maxBatches", String(maxBatches))
  url.searchParams.set("timeBudgetMs", String(timeBudgetMs))
  url.searchParams.set("recoverStale", "true")

  const secret = workerSecret()
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: secret ? { authorization: `Bearer ${secret}` } : undefined,
  })

  if (!response.ok) {
    const message = await response.text().catch(() => "")
    throw new Error(`Worker continuation failed from ${reason}: ${response.status} ${message.slice(0, 200)}`)
  }
}

export function dispatchAnalysisWorkerContinuation({
  analysisId,
  queue,
  reason,
}: {
  analysisId: string
  queue: QueueSnapshot | null | undefined
  reason: string
}) {
  if (!needsContinuation(queue)) return

  after(async () => {
    try {
      await requestWorkerContinuation({ analysisId, reason })
    } catch (error) {
      console.error("Analysis worker continuation failed", {
        analysisId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}

export function dispatchAnalysisWorker({
  analysisId,
  reason,
}: {
  analysisId: string
  reason: string
}) {
  const maxBatches = safeNumber(DEFAULT_BOOTSTRAP_BATCHES, 25, 1, 50)
  const timeBudgetMs = safeNumber(DEFAULT_BOOTSTRAP_TIME_BUDGET_MS, 240_000, 1_000, 280_000)

  after(async () => {
    try {
      const result = await processAnalysisQueue({
        analysisId,
        maxBatches,
        timeBudgetMs,
        recoverStale: true,
      })
      if (needsContinuation(result.queue)) {
        await requestWorkerContinuation({ analysisId, reason: `${reason}:continuation` })
      }
    } catch (error) {
      console.error("Analysis worker dispatch failed", {
        analysisId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
