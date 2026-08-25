import { apiError, getApiUser } from "@/lib/api/auth"
import {
  buildClusterMemberListResource,
  decodeClusterMemberCursor,
  parseClusterMemberPageSize,
} from "@/lib/campaigns/cluster-members-api"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; analysisId: string; clusterLabel: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const { id, analysisId, clusterLabel } = await context.params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  if (!normalizedClusterLabel) return apiError("Cluster label is required", 400)

  const url = new URL(request.url)
  const pageSize = parseClusterMemberPageSize(url.searchParams.get("limit"))
  if (pageSize === null) return apiError("Cluster member limit must be a positive integer", 400)

  const cursor = decodeClusterMemberCursor(url.searchParams.get("cursor"))
  if (!cursor.ok) return apiError(cursor.error, 400)

  try {
    const cluster = await db.cluster.findFirst({
      where: {
        analysisId,
        clusterLabel: normalizedClusterLabel,
        analysis: {
          projectId: id,
          project: { userId: auth.user.id },
        },
      },
      select: { walletCount: true },
    })
    if (!cluster) return apiError("Cluster not found", 404)

    const rows = await db.walletAnalysis.findMany({
      where: {
        analysisId,
        clusterId: normalizedClusterLabel,
        ...(cursor.id ? { id: { gt: cursor.id } } : {}),
      },
      orderBy: { id: "asc" },
      take: pageSize + 1,
      select: {
        id: true,
        walletAddress: true,
        chain: true,
        entityLabel: true,
        entityType: true,
        entityRiskReason: true,
        riskScore: true,
        riskLevel: true,
        status: true,
        recommendedAction: true,
        statusExplanation: true,
        fundingSource: true,
        txCount: true,
        walletAgeDays: true,
        totalVolume: true,
        contractsCount: true,
        campaignActionsCount: true,
        graphComponentId: true,
        graphRiskScore: true,
        reasons: true,
        firstSeen: true,
        lastSeen: true,
        teamReviews: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            finalStatus: true,
            feedbackLabel: true,
            notes: true,
            source: true,
            updatedAt: true,
            reviewer: { select: { name: true } },
          },
        },
      },
    })

    return Response.json(
      buildClusterMemberListResource({
        campaignId: id,
        analysisId,
        clusterLabel: normalizedClusterLabel,
        storedTotalMembers: cluster.walletCount,
        rows,
        pageSize,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Campaign cluster member list API failed", error)
    return apiError("Cluster members could not be loaded", 500)
  }
}
