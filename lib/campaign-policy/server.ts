import { buildCampaignPolicyReport } from "@/lib/campaign-policy/engine"
import { buildCampaignPolicySimulation, type CampaignPolicySimulation, type CampaignPolicySimulationScenarioInput } from "@/lib/campaign-policy/simulator"
import type { CampaignPolicyReport } from "@/lib/campaign-policy/types"
import { loadCampaignDetail } from "@/lib/campaigns/load-campaign-detail"
import { loadCrossCampaignRiskMemory } from "@/lib/risk-memory/server"
import type { RiskPolicy } from "@/types"

export type CampaignPolicyLoadResult = {
  campaignId: string
  campaignName: string
  report: CampaignPolicyReport | null
}

export type CampaignPolicySimulationLoadResult = {
  campaignId: string
  campaignName: string
  simulation: CampaignPolicySimulation | null
}

async function loadCampaignPolicyInputs(campaignId: string, userId: string) {
  const [detail, memory] = await Promise.all([
    loadCampaignDetail(campaignId, userId),
    loadCrossCampaignRiskMemory(campaignId, userId),
  ])

  if (!detail) return null
  return { detail, memory }
}

export async function loadCampaignPolicyReport(
  campaignId: string,
  userId: string,
  preset?: RiskPolicy
): Promise<CampaignPolicyLoadResult | null> {
  const loaded = await loadCampaignPolicyInputs(campaignId, userId)
  if (!loaded) return null
  const { detail, memory } = loaded

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

export async function loadCampaignPolicySimulation(
  campaignId: string,
  userId: string,
  scenario?: CampaignPolicySimulationScenarioInput,
): Promise<CampaignPolicySimulationLoadResult | null> {
  const loaded = await loadCampaignPolicyInputs(campaignId, userId)
  if (!loaded) return null
  const { detail, memory } = loaded

  if (!detail.latestAnalysis) {
    return {
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      simulation: null,
    }
  }

  return {
    campaignId: detail.campaign.id,
    campaignName: detail.campaign.name,
    simulation: buildCampaignPolicySimulation({
      analysis: detail.latestAnalysis,
      memory,
      rewardPoolUsd: detail.campaign.rewardPoolUsd,
      scenario,
    }),
  }
}
