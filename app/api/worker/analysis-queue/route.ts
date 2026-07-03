import { NextResponse } from "next/server"

import { isDatabaseConnectionError } from "@/lib/db/errors"
import {
  getAnalysisQueueStatus,
  processAnalysisQueue,
  recoverStaleAnalysisBatches,
} from "@/lib/analysis/queue-optimizer"
import { finalizeReadyAnalyses } from "@/lib/analysis/batch-worker"
import { boundedNumber, isWorkerAuthorized, workerUnauthorized } from "@/lib/worker/auth"

export const runtime = "nodejs"

function booleanParam(value: string | null, fallback: boolean) {
  if (value === null) return fallback
  return value === "true" || value === "1" || value === "yes"
}

export async function GET(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const url = new URL(request.url)
  const analysisId = url.searchParams.get("analysisId")
  const maxBatches = boundedNumber(url.searchParams.get("maxBatches"), 8, 1, 25)
  const timeBudgetMs = boundedNumber(url.searchParams.get("timeBudgetMs"), 45000, 1000, 50000)

  try {
    const result = await processAnalysisQueue({
      analysisId,
      maxBatches,
      timeBudgetMs,
      recoverStale: true,
    })

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
  const maxBatches = boundedNumber(url.searchParams.get("maxBatches"), 5, 1, 25)
  const timeBudgetMs = boundedNumber(url.searchParams.get("timeBudgetMs"), 25000, 1000, 50000)
  const recoverStale = booleanParam(url.searchParams.get("recoverStale"), true)
  const recoverOnly = booleanParam(url.searchParams.get("recoverOnly"), false)

  try {
    if (recoverOnly) {
      const recovered = await recoverStaleAnalysisBatches({ analysisId })
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

    return NextResponse.json({ ok: true, analysisId, ...result })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for queue worker" }, { status: 503 })
    }
    throw error
  }
}
