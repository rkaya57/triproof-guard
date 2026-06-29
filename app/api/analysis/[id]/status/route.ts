import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

type BatchStatusRow = {
  batchCount: number
  completedBatchCount: number
  failedBatchCount: number
  processingBatchCount: number
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
        COUNT(*) FILTER (WHERE "status" = 'completed')::int AS "completedBatchCount",
        COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failedBatchCount",
        COUNT(*) FILTER (WHERE "status" = 'processing')::int AS "processingBatchCount",
        COALESCE(SUM("processedCount"), 0)::int AS "processedWalletCount",
        COALESCE(SUM("failedCount"), 0)::int AS "failedWalletCount"
      FROM "AnalysisBatch"
      WHERE "analysisId" = ${id}
    `

    const batchStatus = rows[0] ?? {
      batchCount: 0,
      completedBatchCount: 0,
      failedBatchCount: 0,
      processingBatchCount: 0,
      processedWalletCount: 0,
      failedWalletCount: 0,
    }

    const totalWallets = analysis.totalWallets || batchStatus.processedWalletCount
    const progressPercent = totalWallets
      ? Math.min(100, Math.round((batchStatus.processedWalletCount / totalWallets) * 100))
      : analysis.status === "completed"
        ? 100
        : 0

    return NextResponse.json({
      analysisId: analysis.id,
      status: analysis.status,
      analysisMode: analysis.analysisMode,
      projectName: analysis.project.name,
      totalWallets,
      processedWalletCount: batchStatus.processedWalletCount,
      progressPercent,
      enrichedWalletCount: analysis.enrichedWalletCount,
      failedEnrichmentCount: analysis.failedEnrichmentCount || batchStatus.failedWalletCount,
      batchCount: batchStatus.batchCount,
      completedBatchCount: batchStatus.completedBatchCount,
      processingBatchCount: batchStatus.processingBatchCount,
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
