import { db } from "@/lib/db/prisma"
import { acquireAnalysisWorkerLock } from "@/lib/analysis/analysis-worker-lock"
import { recoverStaleAnalysisBatches } from "@/lib/analysis/batch-lease"
import {
  finalizeReadyAnalyses,
  finalizeAnalysisIfReady,
  processAnalysisBatchForAnalysis,
  processNextAnalysisBatch,
} from "@/lib/analysis/batch-worker"

const DEFAULT_STALE_MINUTES = Number.parseInt(
  process.env.ANALYSIS_BATCH_STALE_MINUTES ?? "15",
  10
)
const DEFAULT_MAX_BATCHES = Number.parseInt(
  process.env.WORKER_MAX_BATCHES ?? "25",
  10
)
const DEFAULT_TIME_BUDGET_MS = Number.parseInt(
  process.env.WORKER_TIME_BUDGET_MS ?? "240000",
  10
)

type QueueStatusRow = {
  total: number
  pending: number
  processing: number
  completed: number
  failed: number
  staleProcessing: number
  oldestPendingAt: Date | null
  oldestProcessingAt: Date | null
}

function safeStaleMinutes(value = DEFAULT_STALE_MINUTES) {
  if (!Number.isFinite(value)) return 15
  return Math.min(120, Math.max(1, value))
}

function safeMaxBatches(value = DEFAULT_MAX_BATCHES) {
  if (!Number.isFinite(value)) return 25
  return Math.min(50, Math.max(1, value))
}

function safeTimeBudgetMs(value = DEFAULT_TIME_BUDGET_MS) {
  if (!Number.isFinite(value)) return 240000
  return Math.min(280000, Math.max(1000, value))
}

function normalizeStatus(row: QueueStatusRow | undefined) {
  return {
    total: row?.total ?? 0,
    pending: row?.pending ?? 0,
    processing: row?.processing ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    staleProcessing: row?.staleProcessing ?? 0,
    oldestPendingAt: row?.oldestPendingAt?.toISOString() ?? null,
    oldestProcessingAt: row?.oldestProcessingAt?.toISOString() ?? null,
  }
}

export async function getAnalysisQueueStatus({
  analysisId,
  userId,
  staleMinutes = DEFAULT_STALE_MINUTES,
}: {
  analysisId?: string | null
  userId?: string | null
  staleMinutes?: number
} = {}) {
  const minutes = safeStaleMinutes(staleMinutes)

  if (analysisId && userId) {
    const rows = await db.$queryRaw<QueueStatusRow[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE b."status" = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE b."status" = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE b."status" = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE b."status" = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE b."status" = 'processing'
            AND b."updatedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
        )::int AS "staleProcessing",
        MIN(b."createdAt") FILTER (WHERE b."status" = 'pending') AS "oldestPendingAt",
        MIN(b."updatedAt") FILTER (WHERE b."status" = 'processing') AS "oldestProcessingAt"
      FROM "AnalysisBatch" b
      JOIN "Analysis" a ON a."id" = b."analysisId"
      JOIN "Project" p ON p."id" = a."projectId"
      WHERE b."analysisId" = ${analysisId} AND p."userId" = ${userId}
    `
    return normalizeStatus(rows[0])
  }

  if (analysisId) {
    const rows = await db.$queryRaw<QueueStatusRow[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "status" = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE "status" = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE "status" = 'processing'
            AND "updatedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
        )::int AS "staleProcessing",
        MIN("createdAt") FILTER (WHERE "status" = 'pending') AS "oldestPendingAt",
        MIN("updatedAt") FILTER (WHERE "status" = 'processing') AS "oldestProcessingAt"
      FROM "AnalysisBatch"
      WHERE "analysisId" = ${analysisId}
    `
    return normalizeStatus(rows[0])
  }

  if (userId) {
    const rows = await db.$queryRaw<QueueStatusRow[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE b."status" = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE b."status" = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE b."status" = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE b."status" = 'failed')::int AS failed,
        COUNT(*) FILTER (
          WHERE b."status" = 'processing'
            AND b."updatedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
        )::int AS "staleProcessing",
        MIN(b."createdAt") FILTER (WHERE b."status" = 'pending') AS "oldestPendingAt",
        MIN(b."updatedAt") FILTER (WHERE b."status" = 'processing') AS "oldestProcessingAt"
      FROM "AnalysisBatch" b
      JOIN "Analysis" a ON a."id" = b."analysisId"
      JOIN "Project" p ON p."id" = a."projectId"
      WHERE p."userId" = ${userId}
    `
    return normalizeStatus(rows[0])
  }

  const rows = await db.$queryRaw<QueueStatusRow[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "status" = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE "status" = 'processing')::int AS processing,
      COUNT(*) FILTER (WHERE "status" = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE "status" = 'failed')::int AS failed,
      COUNT(*) FILTER (
        WHERE "status" = 'processing'
          AND "updatedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
      )::int AS "staleProcessing",
      MIN("createdAt") FILTER (WHERE "status" = 'pending') AS "oldestPendingAt",
      MIN("updatedAt") FILTER (WHERE "status" = 'processing') AS "oldestProcessingAt"
    FROM "AnalysisBatch"
  `
  return normalizeStatus(rows[0])
}

async function processQueueLocked({
  analysisId,
  limit,
  budget,
  recoverStale,
}: {
  analysisId?: string | null
  limit: number
  budget: number
  recoverStale: boolean
}) {
  const startedAt = Date.now()
  const recovered = recoverStale
    ? await recoverStaleAnalysisBatches(analysisId ?? undefined)
    : { recovered: 0, failed: 0 }
  const results = []

  for (let index = 0; index < limit; index += 1) {
    if (Date.now() - startedAt >= budget) break

    const result = analysisId
      ? await processAnalysisBatchForAnalysis(analysisId)
      : await processNextAnalysisBatch()

    results.push(result)
    if (!result.processed) break
  }

  const finalizedReadyAnalyses = analysisId
    ? { checked: 0, finalized: 0 }
    : await finalizeReadyAnalyses(limit)

  if (analysisId) await finalizeAnalysisIfReady(analysisId)
  const queue = await getAnalysisQueueStatus({ analysisId })

  return {
    workerLockAcquired: true,
    recoveredStaleBatches: recovered,
    processedBatches: results.filter((result) => result.processed).length,
    maxBatches: limit,
    timeBudgetMs: budget,
    elapsedMs: Date.now() - startedAt,
    finalizedReadyAnalyses,
    results,
    queue,
  }
}

export async function processAnalysisQueue({
  analysisId,
  maxBatches = DEFAULT_MAX_BATCHES,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  recoverStale = true,
}: {
  analysisId?: string | null
  maxBatches?: number
  timeBudgetMs?: number
  recoverStale?: boolean
} = {}) {
  const limit = safeMaxBatches(maxBatches)
  const budget = safeTimeBudgetMs(timeBudgetMs)

  if (!analysisId) {
    return processQueueLocked({
      analysisId,
      limit,
      budget,
      recoverStale,
    })
  }

  const workerLock = await acquireAnalysisWorkerLock(analysisId)
  if (!workerLock.acquired) {
    return {
      workerLockAcquired: false,
      recoveredStaleBatches: { recovered: 0, failed: 0 },
      processedBatches: 0,
      maxBatches: limit,
      timeBudgetMs: budget,
      elapsedMs: 0,
      finalizedReadyAnalyses: { checked: 0, finalized: 0 },
      results: [],
      queue: await getAnalysisQueueStatus({ analysisId }),
      message:
        "Another worker already owns this analysis. The duplicate invocation exited without claiming an additional batch.",
    }
  }

  try {
    return await processQueueLocked({
      analysisId,
      limit,
      budget,
      recoverStale,
    })
  } finally {
    await workerLock.release()
  }
}
