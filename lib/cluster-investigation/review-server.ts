import { Prisma } from "@prisma/client"

import {
  normalizeClusterReviewDisposition,
  type ClusterReviewRecord,
} from "@/lib/cluster-investigation/review"
import { db } from "@/lib/db/prisma"

export function isMissingClusterReviewTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021"
}

function serializeReview(review: {
  id: string
  analysisId: string
  clusterLabel: string
  reviewerId: string
  reviewerName: string
  disposition: string
  notes: string | null
  source: string
  createdAt: Date
}): ClusterReviewRecord {
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
}

export async function loadLatestClusterReview(
  analysisId: string,
  clusterLabel: string,
): Promise<ClusterReviewRecord | null> {
  try {
    const review = await db.clusterInvestigationReview.findFirst({
      where: { analysisId, clusterLabel },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    })
    return review ? serializeReview(review) : null
  } catch (error) {
    if (isMissingClusterReviewTable(error)) return null
    throw error
  }
}

export async function loadClusterReviewHistory(
  analysisId: string,
  clusterLabel: string,
  limit = 20,
): Promise<{ storageAvailable: boolean; reviews: ClusterReviewRecord[] }> {
  try {
    const rows = await db.clusterInvestigationReview.findMany({
      where: { analysisId, clusterLabel },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(Math.max(limit, 1), 100),
    })
    return { storageAvailable: true, reviews: rows.map(serializeReview) }
  } catch (error) {
    if (isMissingClusterReviewTable(error)) return { storageAvailable: false, reviews: [] }
    throw error
  }
}
