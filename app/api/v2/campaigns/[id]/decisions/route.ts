import {
  buildCampaignDecisionPackageCsv,
  buildCampaignDecisionPackageJson,
  safeCampaignDecisionPackageFileStem,
} from "@/lib/campaign-decision-package/export"
import { loadCampaignDecisionPackage } from "@/lib/campaign-decision-package/server"
import { apiError, getApiUser } from "@/lib/api/auth"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error

  const { id } = await context.params
  const url = new URL(request.url)
  const format = url.searchParams.get("format")?.trim().toLowerCase() || "json"
  if (format !== "json" && format !== "csv") {
    return apiError("format must be json or csv", 400)
  }

  try {
    const loaded = await loadCampaignDecisionPackage(id, auth.user.id)
    if (!loaded) return apiError("Campaign not found", 404)
    if (!loaded.package) {
      return Response.json({
        error: "Campaign analysis is required before a decision package is available",
        code: "CAMPAIGN_ANALYSIS_REQUIRED",
        campaignId: loaded.campaignId,
        analysisId: loaded.analysisId,
        links: {
          campaign: `/api/v2/campaigns/${loaded.campaignId}`,
          analyses: `/api/v2/campaigns/${loaded.campaignId}/analyses`,
        },
      }, {
        status: 409,
        headers: { "Cache-Control": "private, no-store" },
      })
    }

    const stem = safeCampaignDecisionPackageFileStem(loaded.campaignName)
    if (format === "csv") {
      return new Response(buildCampaignDecisionPackageCsv(loaded.package), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${stem}-decision-package.csv"`,
          "Cache-Control": "private, no-store",
          "X-Tri-Proof-API-Version": "v2",
          "X-Tri-Proof-Campaign-Id": loaded.campaignId,
          ...(loaded.analysisId ? { "X-Tri-Proof-Analysis-Id": loaded.analysisId } : {}),
        },
      })
    }

    return new Response(buildCampaignDecisionPackageJson(loaded.package), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `inline; filename="${stem}-decision-package.json"`,
        "Cache-Control": "private, no-store",
        "X-Tri-Proof-API-Version": "v2",
        "X-Tri-Proof-Campaign-Id": loaded.campaignId,
        ...(loaded.analysisId ? { "X-Tri-Proof-Analysis-Id": loaded.analysisId } : {}),
      },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return apiError("Campaign decision package is temporarily unavailable", 503)
    }
    console.error("API v2 campaign decision package load failed", { campaignId: id, error })
    return apiError("Campaign decision package could not be loaded", 500)
  }
}
