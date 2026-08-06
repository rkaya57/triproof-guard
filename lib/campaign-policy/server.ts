import { buildCampaignPolicyReport } from "@/lib/campaign-policy/engine"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import { loadCampaignDetail } from "@/lib/campaigns/load-campaign-detail"
import { loadCrossCampaignRiskMemory } from "@/lib/risk-memory/server"
import type { RiskPolicy } from "@/types"

export type CampaignPolicyLoadResult = {
  campaignId: string
  campaignName: string
  report: CampaignPolicyReport | null
}

export async function loadCampaignPolicyReport(
  campaignId: string,
  userId: string,
  preset?: RiskPolicy
): Promise<CampaignPolicyLoadResult | null> {
  const [detail, memory] = await Promise.all([
    loadCampaignDetail(campaignId, userId),
    loadCrossCampaignRiskMemory(campaignId, userId),
  ])

  if (!detail) return null
  if (!detail.latestAnalysis) {
    return {
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      report: null,
    }
  }

  return {
    campaignId: detail.campaign.id,
    campaignName: detail.campaign.name,
    report: buildCampaignPolicyReport({
      analysis: detail.latestAnalysis,
      memory,
      preset,
    }),
  }
}
