import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"
import {
  buildClusterReviewEvidenceSnapshot,
  normalizeClusterReviewDisposition,
  type ClusterReviewRecord,
} from "@/lib/cluster-investigation/review"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

const MAX_REVIEW_HISTORY = 20

function missingReviewTable(error: unknown) {
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

async function ownedReport(analysisId: string, userId: string, clusterLabel: string) {
  const result = await loadClusterInvestigation(analysisId, userId, clusterLabel)
  return result?.report ?? null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const report = await ownedReport(id, user.id, normalizedClusterLabel)
  if (!report) return NextResponse.json({ error: "Cluster not found" }, { status: 404 })

  try {
    const reviews = await db.clusterInvestigationReview.findMany({
      where: { analysisId: id, clusterLabel: normalizedClusterLabel },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_REVIEW_HISTORY,
    })
    return NextResponse.json({
      storageAvailable: true,
      latest: reviews[0] ? serializeReview(reviews[0]) : null,
      history: reviews.map(serializeReview),
    })
  } catch (error) {
    if (missingReviewTable(error)) {
      return NextResponse.json({ storageAvailable: false, latest: null, history: [] })
    }
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for cluster review" }, { status: 503 })
    }
    throw error
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; clusterLabel: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const body = (await request.json().catch(() => null)) as {
    disposition?: unknown
    notes?: unknown
    source?: unknown
  } | null
  const disposition = normalizeClusterReviewDisposition(body?.disposition)
  if (!disposition) {
    return NextResponse.json(
      { error: "disposition must be grouping_supported, grouping_not_supported, needs_more_data, or escalate" },
      { status: 400 },
    )
  }

  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 4000) || null : null
  const source = typeof body?.source === "string"
    ? body.source.trim().slice(0, 40) || "cluster_workspace"
    : "cluster_workspace"
  const report = await ownedReport(id, user.id, normalizedClusterLabel)
  if (!report) return NextResponse.json({ error: "Cluster not found" }, { status: 404 })

  const evidenceSnapshot = buildClusterReviewEvidenceSnapshot(report)

  try {
    const review = await db.clusterInvestigationReview.create({
      data: {
        analysisId: id,
        clusterLabel: normalizedClusterLabel,
        reviewerId: user.id,
        reviewerName: user.name,
        disposition,
        notes,
        source,
        evidenceSnapshot: evidenceSnapshot as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      ok: true,
      review: serializeReview(review),
      mutatedClusterMembership: false,
      mutatedWalletDecisionState: false,
    })
  } catch (error) {
    if (missingReviewTable(error)) {
      return NextResponse.json(
        { error: "Cluster review storage is not deployed yet" },
        { status: 503 },
      )
    }
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for cluster review" }, { status: 503 })
    }
    throw error
  }
}
