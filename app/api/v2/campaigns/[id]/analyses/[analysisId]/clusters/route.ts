import { apiError, getApiUser } from "@/lib/api/auth"
import {
  buildClusterCatalogResource,
  decodeClusterCatalogCursor,
  parseClusterCatalogPageSize,
} from "@/lib/campaigns/cluster-catalog-api"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; analysisId: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const { id, analysisId } = await context.params
  const url = new URL(request.url)
  const pageSize = parseClusterCatalogPageSize(url.searchParams.get("limit"))
  if (pageSize === null) return apiError("Cluster list limit must be a positive integer", 400)

  const cursor = decodeClusterCatalogCursor(url.searchParams.get("cursor"))
  if (!cursor.ok) return apiError(cursor.error, 400)

  try {
    const ownedRun = await db.analysis.findFirst({
      where: {
        id: analysisId,
        projectId: id,
        project: { userId: auth.user.id },
      },
      select: { id: true },
    })
    if (!ownedRun) return apiError("Campaign analysis run not found", 404)

    const scope = { analysisId }
    const [storedClusterCount, rows] = await Promise.all([
      db.cluster.count({ where: scope }),
      db.cluster.findMany({
        where: {
          ...scope,
          ...(cursor.id ? { id: { gt: cursor.id } } : {}),
        },
        orderBy: { id: "asc" },
        take: pageSize + 1,
        select: {
          id: true,
          clusterLabel: true,
          walletCount: true,
          averageRiskScore: true,
          sharedFundingSource: true,
          behaviorSimilarityScore: true,
          suggestedAction: true,
          reasons: true,
          createdAt: true,
        },
      }),
    ])

    return Response.json(
      buildClusterCatalogResource({
        campaignId: id,
        analysisId,
        storedClusterCount,
        rows,
        pageSize,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Campaign cluster catalog API failed", error)
    return apiError("Cluster catalog could not be loaded", 500)
  }
}
