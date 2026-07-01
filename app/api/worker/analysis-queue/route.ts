import { NextResponse } from "next/server"

import { isDatabaseConnectionError } from "@/lib/db/errors"
import {
  getAnalysisQueueStatus,
  processAnalysisQueue,
  recoverStaleAnalysisBatches,
} from "@/lib/analysis/queue-optimizer"
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
  const staleMinutes = boundedNumber(url.searchParams.get("staleMinutes"), 15, 1, 120)

  try {
    const queue = await getAnalysisQueueStatus({ analysisId, staleMinutes })
    return NextResponse.json({ queue, analysisId })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for queue status" }, { status: 503 })
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
      const queue = await getAnalysisQueueStatus({ analysisId })
      return NextResponse.json({ recoveredStaleBatches: recovered, queue, analysisId })
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
