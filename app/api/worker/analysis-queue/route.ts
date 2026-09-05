import { NextResponse } from "next/server"

import { recoverStaleAnalysisBatches } from "@/lib/analysis/batch-lease"
import { finalizeAnalysisIfReady, finalizeReadyAnalyses } from "@/lib/analysis/batch-worker"
import { ensureProduction50KValidationQueued } from "@/lib/analysis/production-50k-validation"
import {
  getAnalysisQueueStatus,
  processAnalysisQueue,
} from "@/lib/analysis/queue-optimizer"
import { dispatchAnalysisWorker, dispatchAnalysisWorkerContinuation } from "@/lib/analysis/worker-dispatch"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import {
  boundedNumber,
  isWorkerAuthorized,
  workerUnauthorized,
} from "@/lib/worker/auth"

export const runtime = "nodejs"
export const maxDuration = 300

const WORKER_RUNTIME_PROFILE = "50k-real-v1"
const HARD_FUNCTION_BUDGET_MS = 280_000
const RESPONSE_RESERVE_MS = 12_000
const MAX_BATCHES_PER_INVOCATION = 2

function booleanParam(value: string | null, fallback: boolean) {
  if (value === null) return fallback
  return value === "true" || value === "1" || value === "yes"
}

function remainingQueueBudget(startedAt: number, requested: number) {
  const remaining =
    HARD_FUNCTION_BUDGET_MS - (Date.now() - startedAt) - RESPONSE_RESERVE_MS
  return Math.max(0, Math.min(requested, remaining))
}

async function bootstrapProductionValidation(analysisId: string | null) {
  return analysisId ? null : ensureProduction50KValidationQueued()
}

export async function GET(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const startedAt = Date.now()
  const url = new URL(request.url)
  const requestedAnalysisId = url.searchParams.get("analysisId")
  const maxBatches = boundedNumber(
    url.searchParams.get("maxBatches"),
    MAX_BATCHES_PER_INVOCATION,
    1,
    MAX_BATCHES_PER_INVOCATION
  )
  const requestedBudget = boundedNumber(
    url.searchParams.get("timeBudgetMs"),
    240_000,
    1_000,
    280_000
  )

  try {
    const validation = await bootstrapProductionValidation(requestedAnalysisId)
    const validationAnalysisId =
      validation?.state === "queued" ||
      validation?.state === "already_queued"
        ? validation.analysisId
        : null
    const analysisId = requestedAnalysisId ?? validationAnalysisId
    const timeBudgetMs = remainingQueueBudget(startedAt, requestedBudget)

    if (timeBudgetMs < 1_000) {
      const queue = await getAnalysisQueueStatus({ analysisId, activeOnly: true })
      dispatchAnalysisWorkerContinuation({ analysisId, queue, reason: "worker-budget-exhausted" })
      return NextResponse.json({
        ok: true,
        source: "get",
        runtimeProfile: WORKER_RUNTIME_PROFILE,
        analysisId,
        validation,
        processedBatches: 0,
        elapsedMs: Date.now() - startedAt,
        queue,
        message:
          "The invocation budget was used to collect and queue real wallets. Remaining work has been considered for a separate worker invocation.",
      })
    }

    const result = await processAnalysisQueue({
      analysisId,
      maxBatches,
      timeBudgetMs,
      recoverStale: true,
    })
    dispatchAnalysisWorkerContinuation({
      analysisId,
      queue: result.queue,
      workerLockAcquired: result.workerLockAcquired,
      reason: "worker-get",
    })

    return NextResponse.json({
      ok: true,
      source: "get",
      runtimeProfile: WORKER_RUNTIME_PROFILE,
      analysisId,
      validation,
      ...result,
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Database is required for queue worker" },
        { status: 503 }
      )
    }
    throw error
  }
}

export async function POST(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const startedAt = Date.now()
  const url = new URL(request.url)
  const requestedAnalysisId = url.searchParams.get("analysisId")
  const maxBatches = boundedNumber(
    url.searchParams.get("maxBatches"),
    MAX_BATCHES_PER_INVOCATION,
    1,
    MAX_BATCHES_PER_INVOCATION
  )
  const requestedBudget = boundedNumber(
    url.searchParams.get("timeBudgetMs"),
    240_000,
    1_000,
    280_000
  )
  const recoverStale = booleanParam(
    url.searchParams.get("recoverStale"),
    true
  )
  const recoverOnly = booleanParam(
    url.searchParams.get("recoverOnly"),
    false
  )

  try {
    if (booleanParam(url.searchParams.get("defer"), false) && !recoverOnly) {
      dispatchAnalysisWorker({ analysisId: requestedAnalysisId, maxBatches, timeBudgetMs: requestedBudget, reason: "worker-deferred" })
      return NextResponse.json({ accepted: true, analysisId: requestedAnalysisId }, { status: 202 })
    }
    if (recoverOnly) {
      const recovered = await recoverStaleAnalysisBatches(
        requestedAnalysisId ?? undefined
      )
      if (requestedAnalysisId) await finalizeAnalysisIfReady(requestedAnalysisId)
      const finalizedReadyAnalyses = requestedAnalysisId
        ? { checked: 0, finalized: 0 }
        : await finalizeReadyAnalyses(maxBatches)
      const queue = await getAnalysisQueueStatus({
        analysisId: requestedAnalysisId,
      })
      return NextResponse.json({
        runtimeProfile: WORKER_RUNTIME_PROFILE,
        recoveredStaleBatches: recovered,
        finalizedReadyAnalyses,
        queue,
        analysisId: requestedAnalysisId,
      })
    }

    const validation = await bootstrapProductionValidation(
      requestedAnalysisId
    )
    const validationAnalysisId =
      validation?.state === "queued" ||
      validation?.state === "already_queued"
        ? validation.analysisId
        : null
    const analysisId = requestedAnalysisId ?? validationAnalysisId
    const timeBudgetMs = remainingQueueBudget(startedAt, requestedBudget)

    if (timeBudgetMs < 1_000) {
      const queue = await getAnalysisQueueStatus({ analysisId, activeOnly: true })
      dispatchAnalysisWorkerContinuation({ analysisId, queue, reason: "worker-budget-exhausted" })
      return NextResponse.json({
        ok: true,
        runtimeProfile: WORKER_RUNTIME_PROFILE,
        analysisId,
        validation,
        processedBatches: 0,
        elapsedMs: Date.now() - startedAt,
        queue,
        message:
          "The invocation budget was used to collect and queue real wallets. Remaining work has been considered for a separate worker invocation.",
      })
    }

    const result = await processAnalysisQueue({
      analysisId,
      maxBatches,
      timeBudgetMs,
      recoverStale,
    })
    dispatchAnalysisWorkerContinuation({
      analysisId,
      queue: result.queue,
      workerLockAcquired: result.workerLockAcquired,
      reason: "worker-post",
    })

    return NextResponse.json({
      ok: true,
      runtimeProfile: WORKER_RUNTIME_PROFILE,
      analysisId,
      validation,
      ...result,
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json(
        { error: "Database is required for queue worker" },
        { status: 503 }
      )
    }
    throw error
  }
}
