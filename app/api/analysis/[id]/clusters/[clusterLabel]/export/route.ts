import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import {
  buildClusterInvestigationCsvExport,
  buildClusterInvestigationJsonExport,
  safeClusterExportFileStem,
} from "@/lib/cluster-investigation/export"
import {
  normalizeClusterReviewDisposition,
  type ClusterReviewRecord,
} from "@/lib/cluster-investigation/review"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

function missingReviewTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021"
}

async function latestReview(analysisId: string, clusterLabel: string): Promise<ClusterReviewRecord | null> {
  try {
    const review = await db.clusterInvestigationReview.findFirst({
      where: { analysisId, clusterLabel },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    if (!review) return null
    return {
      id: review.id,
      analysisId: review.analysisId,
      clusterLabel: review.clusterLabel,
      reviewerId: review.reviewerId,
      reviewerName: review.reviewerName,
      disposition: normalizeClusterReviewDisposition(review.disposition) ?? "needs_more_data",
      notes: review.notes,
      source: review.source,
      createdAt: review.createdAt.toISOString(),
    }
  } catch (error) {
    if (missingReviewTable(error)) return null
    throw error
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const format = new URL(request.url).searchParams.get("format")?.trim().toLowerCase() || "json"
  if (format !== "json" && format !== "csv") {
    return NextResponse.json({ error: "format must be json or csv" }, { status: 400 })
  }

  const result = await loadClusterInvestigation(id, user.id, normalizedClusterLabel)
  if (!result?.report) return NextResponse.json({ error: "Cluster not found" }, { status: 404 })

  const review = await latestReview(id, normalizedClusterLabel)
  const fileStem = safeClusterExportFileStem(result.report.project.name, normalizedClusterLabel)

  if (format === "csv") {
    return new Response(buildClusterInvestigationCsvExport(result.report, review), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileStem}-investigation.csv"`,
        "Cache-Control": "private, no-store",
      },
    })
  }

  return new Response(buildClusterInvestigationJsonExport(result.report, review), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileStem}-investigation.json"`,
      "Cache-Control": "private, no-store",
    },
  })
}
