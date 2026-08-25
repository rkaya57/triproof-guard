import { apiError, getApiUser } from "@/lib/api/auth"
import { buildCampaignClusterIntelligenceResource } from "@/lib/campaigns/cluster-intelligence-api"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"
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

    const result = await loadClusterInvestigation(analysisId, auth.user.id, normalizedClusterLabel)
    if (!result?.report || !result.intelligence) return apiError("Cluster not found", 404)

    return Response.json(
      buildCampaignClusterIntelligenceResource({
        campaignId: id,
        analysisId,
        report: result.report,
        intelligence: result.intelligence,
      }),
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Campaign cluster intelligence API failed", error)
    return apiError("Cluster intelligence could not be loaded", 500)
  }
}
