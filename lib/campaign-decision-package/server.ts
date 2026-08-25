import { loadCampaignPolicyReport } from "@/lib/campaign-policy/server"
import {
  buildCampaignDecisionPackage,
  type CampaignDecisionPackage,
} from "@/lib/campaign-decision-package"
import { loadCampaignDetail } from "@/lib/campaigns/load-campaign-detail"
import { loadLatestClusterReviewsForAnalysis } from "@/lib/cluster-investigation/review-server"

export type CampaignDecisionPackageLoadResult = {
  campaignId: string
  campaignName: string
  analysisId: string | null
  package: CampaignDecisionPackage | null
}

async function safePolicyReport(campaignId: string, userId: string) {
  try {
    const loaded = await loadCampaignPolicyReport(campaignId, userId)
    return loaded?.report ?? null
  } catch (error) {
    console.warn("Campaign Decision Package policy context unavailable", {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function safeClusterReviews(analysisId: string) {
  try {
    return await loadLatestClusterReviewsForAnalysis(analysisId)
  } catch (error) {
    console.warn("Campaign Decision Package cluster reviews unavailable", {
      analysisId,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export async function loadCampaignDecisionPackage(
  campaignId: string,
  userId: string,
): Promise<CampaignDecisionPackageLoadResult | null> {
  const detail = await loadCampaignDetail(campaignId, userId)
  if (!detail) return null
  if (!detail.latestAnalysis) {
    return {
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      analysisId: null,
      package: null,
    }
  }

  const analysis = detail.latestAnalysis
  const [policyReport, clusterReviews] = await Promise.all([
    safePolicyReport(campaignId, userId),
    safeClusterReviews(analysis.id),
  ])

  return {
    campaignId: detail.campaign.id,
    campaignName: detail.campaign.name,
    analysisId: analysis.id,
    package: buildCampaignDecisionPackage({
      analysis,
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      policyReport,
      clusterReviews,
    }),
  }
}
