import { db } from "@/lib/db/prisma"

export const ANALYSIS_WORKER_ID =
  process.env.ANALYSIS_WORKER_ID?.trim() ||
  process.env.VERCEL_REGION?.trim() ||
  process.env.HOSTNAME?.trim() ||
  `worker-${process.pid}`

const MAX_BATCH_RETRIES = Math.max(
  3,
  Number.parseInt(process.env.ANALYSIS_MAX_BATCH_RETRIES ?? "5", 10) || 5
)
// Keep recovery inside the serverless runtime envelope. A live worker refreshes
// its lease, while a terminated worker can be retried without a long deadlock.
const BATCH_LEASE_TIMEOUT_MS = Math.min(
  180_000,
  Math.max(
    60_000,
    Number.parseInt(process.env.ANALYSIS_BATCH_LEASE_TIMEOUT_MS ?? "180000", 10) || 180_000
  )
)
const BATCH_HEARTBEAT_MS = Math.max(
  15_000,
  Math.min(
    Math.floor(BATCH_LEASE_TIMEOUT_MS / 3),
    Number.parseInt(process.env.ANALYSIS_BATCH_HEARTBEAT_MS ?? "120000", 10) || 120_000
  )
)

type RecoveredBatch = {
  id: string
  status: string
}

export function createAnalysisBatchLeaseToken() {
  return `Worker lease: ${ANALYSIS_WORKER_ID}:${crypto.randomUUID()}`
}

export async function recoverStaleAnalysisBatches(analysisId?: string) {
  const staleBefore = new Date(Date.now() - BATCH_LEASE_TIMEOUT_MS)
  const leaseMessage = `Recovered stale analysis worker lease after ${Math.round(
    BATCH_LEASE_TIMEOUT_MS / 60_000
  )} minute(s).`

  const rows = analysisId
    ? await db.$queryRaw<RecoveredBatch[]>`
        UPDATE "AnalysisBatch" b
        SET "status" = CASE
              WHEN COALESCE(b."retryCount", 0) + 1 >= ${MAX_BATCH_RETRIES}
                THEN 'failed'
              ELSE 'pending'
            END,
            "retryCount" = COALESCE(b."retryCount", 0) + 1,
            "startedAt" = NULL,
            "updatedAt" = NOW(),
            "completedAt" = CASE
              WHEN COALESCE(b."retryCount", 0) + 1 >= ${MAX_BATCH_RETRIES}
                THEN NOW()
              ELSE NULL
            END,
            "errorMessage" = ${leaseMessage}
        FROM "Analysis" a
        WHERE a."id" = b."analysisId"
          AND b."analysisId" = ${analysisId}
          AND b."status" = 'processing'
          AND b."updatedAt" < ${staleBefore}
          AND a."status" IN ('pending', 'processing', 'enriching', 'analyzing')
        RETURNING b."id", b."status"
      `
    : await db.$queryRaw<RecoveredBatch[]>`
        UPDATE "AnalysisBatch" b
        SET "status" = CASE
              WHEN COALESCE(b."retryCount", 0) + 1 >= ${MAX_BATCH_RETRIES}
                THEN 'failed'
              ELSE 'pending'
            END,
            "retryCount" = COALESCE(b."retryCount", 0) + 1,
            "startedAt" = NULL,
            "updatedAt" = NOW(),
            "completedAt" = CASE
              WHEN COALESCE(b."retryCount", 0) + 1 >= ${MAX_BATCH_RETRIES}
                THEN NOW()
              ELSE NULL
            END,
            "errorMessage" = ${leaseMessage}
        FROM "Analysis" a
        WHERE a."id" = b."analysisId"
          AND b."status" = 'processing'
          AND b."updatedAt" < ${staleBefore}
          AND a."status" IN ('pending', 'processing', 'enriching', 'analyzing')
        RETURNING b."id", b."status"
      `

  return {
    recovered: rows.filter((row) => row.status === "pending").length,
    failed: rows.filter((row) => row.status === "failed").length,
  }
}

export function startAnalysisBatchHeartbeat(
  batchId: string,
  leaseToken: string
) {
  let stopped = false

  const heartbeat = async () => {
    if (stopped) return
    try {
      await db.$executeRaw`
        UPDATE "AnalysisBatch"
        SET "updatedAt" = NOW()
        WHERE "id" = ${batchId}
          AND "status" = 'processing'
          AND "errorMessage" = ${leaseToken}
      `
    } catch (error) {
      console.error("Analysis batch heartbeat failed", { batchId, error })
    }
  }

  const timer = setInterval(() => {
    void heartbeat()
  }, BATCH_HEARTBEAT_MS)
  timer.unref?.()

  return () => {
    stopped = true
    clearInterval(timer)
  }
}
