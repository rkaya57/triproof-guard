import { NextResponse } from "next/server"

import { isDatabaseConnectionError } from "@/lib/db/errors"
import {
  getAnalysisQueueStatus,
  processAnalysisQueue,
} from "@/lib/analysis/queue-optimizer"
import { recoverStaleAnalysisBatches } from "@/lib/analysis/batch-lease"
import { dispatchAnalysisWorkerContinuation } from "@/lib/analysis/worker-dispatch"
import { finalizeReadyAnalyses } from "@/lib/analysis/batch-worker"
import { boundedNumber, isWorkerAuthorized, workerUnauthorized } from "@/lib/worker/auth"

export const runtime = "nodejs"
export const maxDuration = 300

function booleanParam(value: string | null, fallback: boolean) {
  if (value === null) return fallback
  return value === "true" || value === "1" || value === "yes"
}

export async function GET(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const url = new URL(request.url)
  const analysisId = url.searchParams.get("analysisId")
  const maxBatches = boundedNumber(url.searchParams.get("maxBatches"), 25, 1, 50)
  const timeBudgetMs = boundedNumber(url.searchParams.get("timeBudgetMs"), 240000, 1000, 280000)

  try {
    const result = await processAnalysisQueue({
      analysisId,
      maxBatches,
      timeBudgetMs,
      recoverStale: true,
    })
    if (analysisId) {
      dispatchAnalysisWorkerContinuation({
        analysisId,
        queue: result.queue,
        reason: "worker-get",
      })
    }

    return NextResponse.json({ ok: true, source: "get", analysisId, ...result })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for queue worker" }, { status: 503 })
    }
    throw error
  }
}

export async function POST(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const url = new URL(request.url)
  const analysisId = url.searchParams.get("analysisId")
  const maxBatches = boundedNumber(url.searchParams.get("maxBatches"), 25, 1, 50)
  const timeBudgetMs = boundedNumber(url.searchParams.get("timeBudgetMs"), 240000, 1000, 280000)
  const recoverStale = booleanParam(url.searchParams.get("recoverStale"), true)
  const recoverOnly = booleanParam(url.searchParams.get("recoverOnly"), false)

  try {
    if (recoverOnly) {
      const recovered = await recoverStaleAnalysisBatches(analysisId ?? undefined)
      const finalizedReadyAnalyses = analysisId
        ? { checked: 0, finalized: 0 }
        : await finalizeReadyAnalyses(maxBatches)
      const queue = await getAnalysisQueueStatus({ analysisId })
      return NextResponse.json({ recoveredStaleBatches: recovered, finalizedReadyAnalyses, queue, analysisId })
    }

    const result = await processAnalysisQueue({
      analysisId,
      maxBatches,
      timeBudgetMs,
      recoverStale,
    })
    if (analysisId) {
      dispatchAnalysisWorkerContinuation({
        analysisId,
        queue: result.queue,
        reason: "worker-post",
      })
    }

    return NextResponse.json({ ok: true, analysisId, ...result })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for queue worker" }, { status: 503 })
    }
    throw error
  }
}
