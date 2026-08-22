import { apiError, getApiUser } from "@/lib/api/auth"
import {
  buildCampaignClusterCaseExport,
  campaignClusterCaseExportHeaders,
  parseCampaignClusterCaseExportFormat,
} from "@/lib/campaigns/cluster-case-export-api"
import { loadInvestigationCaseBrief } from "@/lib/cluster-investigation/case-brief-server"
import { loadLatestClusterReview } from "@/lib/cluster-investigation/review-server"
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
  const label = decodeURIComponent(clusterLabel).trim()
  if (!label) return apiError("Cluster label is required", 400)

  const format = parseCampaignClusterCaseExportFormat(new URL(request.url).searchParams.get("format"))
  if (!format) return apiError("format must be json, csv, or markdown", 400)

  try {
    const ownedRun = await db.analysis.findFirst({
      where: { id: analysisId, projectId: id, project: { userId: auth.user.id } },
      select: { id: true },
    })
    if (!ownedRun) return apiError("Campaign analysis run not found", 404)

    const investigation = await loadClusterInvestigation(analysisId, auth.user.id, label)
    if (!investigation?.report) return apiError("Cluster not found", 404)

    const latestReview = await loadLatestClusterReview(analysisId, label).catch(() => null)
    const caseBriefResult = format === "markdown"
      ? await loadInvestigationCaseBrief(analysisId, auth.user.id, label)
      : null

    const exported = buildCampaignClusterCaseExport({
      format,
      report: investigation.report,
      latestReview,
      caseBrief: caseBriefResult?.brief ?? null,
    })
    if (!exported) return apiError("Cluster case export could not be generated", 500)

    return new Response(exported.body, {
      headers: campaignClusterCaseExportHeaders(exported),
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    console.error("Campaign cluster case export API failed", error)
    return apiError("Cluster case export could not be loaded", 500)
  }
}
