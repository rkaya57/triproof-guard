import { db } from "@/lib/db/prisma"
import {
  finalizeAnalysisIfReady,
  processAnalysisBatchForAnalysis,
  processNextAnalysisBatch,
} from "@/lib/analysis/batch-worker"

const MAX_BATCH_RETRIES = 3
const DEFAULT_STALE_MINUTES = Number.parseInt(process.env.ANALYSIS_BATCH_STALE_MINUTES ?? "15", 10)
const DEFAULT_MAX_BATCHES = Number.parseInt(process.env.WORKER_MAX_BATCHES ?? "5", 10)
const DEFAULT_TIME_BUDGET_MS = Number.parseInt(process.env.WORKER_TIME_BUDGET_MS ?? "25000", 10)

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
  if (!Number.isFinite(value)) return 5
  return Math.min(25, Math.max(1, value))
}

function safeTimeBudgetMs(value = DEFAULT_TIME_BUDGET_MS) {
  if (!Number.isFinite(value)) return 25000
  return Math.min(50000, Math.max(1000, value))
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
            AND b."startedAt" IS NOT NULL
            AND b."startedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
        )::int AS "staleProcessing",
        MIN(b."createdAt") FILTER (WHERE b."status" = 'pending') AS "oldestPendingAt",
        MIN(b."startedAt") FILTER (WHERE b."status" = 'processing') AS "oldestProcessingAt"
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
            AND "startedAt" IS NOT NULL
            AND "startedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
        )::int AS "staleProcessing",
        MIN("createdAt") FILTER (WHERE "status" = 'pending') AS "oldestPendingAt",
        MIN("startedAt") FILTER (WHERE "status" = 'processing') AS "oldestProcessingAt"
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
            AND b."startedAt" IS NOT NULL
            AND b."startedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
        )::int AS "staleProcessing",
        MIN(b."createdAt") FILTER (WHERE b."status" = 'pending') AS "oldestPendingAt",
        MIN(b."startedAt") FILTER (WHERE b."status" = 'processing') AS "oldestProcessingAt"
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
          AND "startedAt" IS NOT NULL
          AND "startedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
      )::int AS "staleProcessing",
      MIN("createdAt") FILTER (WHERE "status" = 'pending') AS "oldestPendingAt",
      MIN("startedAt") FILTER (WHERE "status" = 'processing') AS "oldestProcessingAt"
    FROM "AnalysisBatch"
  `
  return normalizeStatus(rows[0])
}

export async function recoverStaleAnalysisBatches({
  analysisId,
  staleMinutes = DEFAULT_STALE_MINUTES,
}: {
  analysisId?: string | null
  staleMinutes?: number
} = {}) {
  const minutes = safeStaleMinutes(staleMinutes)

  if (analysisId) {
    return db.$executeRaw`
      UPDATE "AnalysisBatch"
      SET
        "status" = CASE
          WHEN COALESCE("retryCount", 0) + 1 >= ${MAX_BATCH_RETRIES} THEN 'failed'
          ELSE 'pending'
        END,
        "retryCount" = COALESCE("retryCount", 0) + 1,
        "errorMessage" = 'V2.4 recovered stale processing batch',
        "updatedAt" = NOW()
      WHERE "analysisId" = ${analysisId}
        AND "status" = 'processing'
        AND "startedAt" IS NOT NULL
        AND "startedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
    `
  }

  return db.$executeRaw`
    UPDATE "AnalysisBatch"
    SET
      "status" = CASE
        WHEN COALESCE("retryCount", 0) + 1 >= ${MAX_BATCH_RETRIES} THEN 'failed'
        ELSE 'pending'
      END,
      "retryCount" = COALESCE("retryCount", 0) + 1,
      "errorMessage" = 'V2.4 recovered stale processing batch',
      "updatedAt" = NOW()
    WHERE "status" = 'processing'
      AND "startedAt" IS NOT NULL
      AND "startedAt" < NOW() - (${minutes} * INTERVAL '1 minute')
  `
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
  const startedAt = Date.now()
  const recovered = recoverStale
    ? await recoverStaleAnalysisBatches({ analysisId })
    : 0
  const results = []

  for (let index = 0; index < limit; index += 1) {
    if (Date.now() - startedAt >= budget) break

    const result = analysisId
      ? await processAnalysisBatchForAnalysis(analysisId)
      : await processNextAnalysisBatch()

    results.push(result)
    if (!result.processed) break
  }

  if (analysisId) {
    await finalizeAnalysisIfReady(analysisId)
  }

  const queue = await getAnalysisQueueStatus({ analysisId })

  return {
    recoveredStaleBatches: recovered,
    processedBatches: results.filter((result) => result.processed).length,
    maxBatches: limit,
    timeBudgetMs: budget,
    elapsedMs: Date.now() - startedAt,
    results,
    queue,
  }
}
