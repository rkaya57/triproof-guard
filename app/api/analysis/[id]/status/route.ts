import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { dispatchAnalysisWorkerContinuation } from "@/lib/analysis/worker-dispatch"
import { db } from "@/lib/db/prisma"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

const staleBatchMinutes = Math.min(
  3,
  Math.max(1, Number.parseInt(process.env.ANALYSIS_BATCH_STALE_MINUTES ?? "3", 10))
)

type BatchStatusRow = {
  batchCount: number
  pendingBatchCount: number
  completedBatchCount: number
  failedBatchCount: number
  processingBatchCount: number
  staleProcessingBatchCount: number
  processedWalletCount: number
  failedWalletCount: number
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      include: { project: true },
    })

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
    }

    const rows = await db.$queryRaw<BatchStatusRow[]>`
      SELECT
        COUNT(*)::int AS "batchCount",
        COUNT(*) FILTER (WHERE "status" = 'pending')::int AS "pendingBatchCount",
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS "completedBatchCount",
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failedBatchCount",
        COUNT(*) FILTER (WHERE "status" = 'processing')::int AS "processingBatchCount",
        COUNT(*) FILTER (
          WHERE "status" = 'processing'
            AND "updatedAt" < NOW() - (${staleBatchMinutes} * INTERVAL '1 minute')
        )::int AS "staleProcessingBatchCount",
        COALESCE(SUM("processedCount"), 0)::int AS "processedWalletCount",
        COALESCE(SUM("failedCount"), 0)::int AS "failedWalletCount"
      FROM "AnalysisBatch"
      WHERE "analysisId" = ${id}
    `

    const batchStatus = rows[0] ?? {
      batchCount: 0,
      pendingBatchCount: 0,
      completedBatchCount: 0,
      failedBatchCount: 0,
      processingBatchCount: 0,
      staleProcessingBatchCount: 0,
      processedWalletCount: 0,
      failedWalletCount: 0,
    }

    const totalWallets = analysis.totalWallets || batchStatus.processedWalletCount
    const progressPercent = totalWallets
      ? Math.min(100, Math.round((batchStatus.processedWalletCount / totalWallets) * 100))
      : analysis.status === "completed"
        ? 100
        : 0
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - analysis.createdAt.getTime()) / 1_000))
    const canEstimateRemaining =
      analysis.status !== "completed" &&
      batchStatus.processedWalletCount >= 10 &&
      elapsedSeconds >= 10 &&
      batchStatus.processedWalletCount < totalWallets
    const estimatedRemainingSeconds = canEstimateRemaining
      ? Math.max(
          1,
          Math.ceil(
            ((totalWallets - batchStatus.processedWalletCount) * elapsedSeconds) /
              batchStatus.processedWalletCount
          )
        )
      : null
    const estimatedCompletionAt = estimatedRemainingSeconds
      ? new Date(Date.now() + estimatedRemainingSeconds * 1_000).toISOString()
      : null

    if (
      analysis.status !== "completed" &&
      analysis.status !== "failed" &&
      (batchStatus.staleProcessingBatchCount > 0 ||
        (batchStatus.pendingBatchCount > 0 && batchStatus.processingBatchCount === 0))
    ) {
      dispatchAnalysisWorkerContinuation({
        analysisId: analysis.id,
        queue: {
          pending: batchStatus.pendingBatchCount,
          processing: batchStatus.processingBatchCount,
          staleProcessing: batchStatus.staleProcessingBatchCount,
        },
        reason: "status-poll",
      })
    }

    return NextResponse.json({
      analysisId: analysis.id,
      status: analysis.status,
      analysisMode: analysis.analysisMode,
      projectName: analysis.project.name,
      totalWallets,
      processedWalletCount: batchStatus.processedWalletCount,
      progressPercent,
      estimatedRemainingSeconds,
      estimatedCompletionAt,
      pendingBatchCount: batchStatus.pendingBatchCount,
      enrichedWalletCount: analysis.enrichedWalletCount,
      failedEnrichmentCount: analysis.failedEnrichmentCount || batchStatus.failedWalletCount,
      batchCount: batchStatus.batchCount,
      completedBatchCount: batchStatus.completedBatchCount,
      processingBatchCount: batchStatus.processingBatchCount,
      staleProcessingBatchCount: batchStatus.staleProcessingBatchCount,
      failedBatchCount: batchStatus.failedBatchCount,
      warnings: analysis.enrichmentWarnings ?? [],
      completedAt: analysis.completedAt?.toISOString() ?? null,
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }
}
