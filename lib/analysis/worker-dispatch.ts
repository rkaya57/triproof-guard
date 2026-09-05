import { after } from "next/server"

import { continuationUrl, needsContinuation, type QueueSnapshot } from "@/lib/analysis/continuation-policy"
import { processAnalysisQueue } from "@/lib/analysis/queue-optimizer"

// A Solana screening batch can spend roughly two minutes on real RPC history.
// Keep each serverless invocation below the platform timeout, then continue in
// a fresh invocation through the queue endpoint.
const MAX_BATCHES_PER_INVOCATION = 2
const DEFAULT_BOOTSTRAP_BATCHES = Number.parseInt(process.env.WORKER_BOOTSTRAP_MAX_BATCHES ?? "2", 10)
const DEFAULT_BOOTSTRAP_TIME_BUDGET_MS = Number.parseInt(process.env.WORKER_BOOTSTRAP_TIME_BUDGET_MS ?? "240000", 10)
const CONTINUATION_BATCHES = Number.parseInt(process.env.WORKER_CONTINUATION_MAX_BATCHES ?? "2", 10)
const CONTINUATION_TIME_BUDGET_MS = Number.parseInt(process.env.WORKER_CONTINUATION_TIME_BUDGET_MS ?? "240000", 10)

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

async function requestWorkerContinuation({
  analysisId,
  reason,
}: {
  analysisId: string | null
  reason: string
}) {
  const url = continuationUrl(siteOrigin(), analysisId)
  url.searchParams.set("maxBatches", String(safeNumber(CONTINUATION_BATCHES, 2, 1, MAX_BATCHES_PER_INVOCATION)))
  url.searchParams.set("timeBudgetMs", String(safeNumber(CONTINUATION_TIME_BUDGET_MS, 240_000, 1_000, 280_000)))

  const secret = workerSecret()
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
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
  workerLockAcquired = true,
  reason,
}: {
  analysisId: string | null
  queue: QueueSnapshot | null | undefined
  workerLockAcquired?: boolean
  reason: string
}) {
  if (!needsContinuation(queue, workerLockAcquired)) return

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
  maxBatches: requestedMaxBatches = DEFAULT_BOOTSTRAP_BATCHES,
  timeBudgetMs: requestedTimeBudgetMs = DEFAULT_BOOTSTRAP_TIME_BUDGET_MS,
}: {
  analysisId: string | null
  reason: string
  maxBatches?: number
  timeBudgetMs?: number
}) {
  const maxBatches = safeNumber(
    requestedMaxBatches,
    MAX_BATCHES_PER_INVOCATION,
    1,
    MAX_BATCHES_PER_INVOCATION
  )
  const timeBudgetMs = safeNumber(requestedTimeBudgetMs, 240_000, 1_000, 280_000)

  after(async () => {
    try {
      const result = await processAnalysisQueue({
        analysisId,
        maxBatches,
        timeBudgetMs,
        recoverStale: true,
      })
      if (needsContinuation(result.queue, result.workerLockAcquired)) {
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
