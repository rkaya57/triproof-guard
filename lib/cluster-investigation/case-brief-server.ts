import { loadCampaignPolicyReport } from "@/lib/campaign-policy/server"
import {
  buildInvestigationCaseBrief,
  type InvestigationCaseBrief,
} from "@/lib/cluster-investigation/case-brief"
import { loadLatestClusterReview } from "@/lib/cluster-investigation/review-server"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"

export type InvestigationCaseBriefLoadResult = {
  analysisId: string
  clusterLabel: string
  brief: InvestigationCaseBrief | null
}

async function safeCampaignPolicy(campaignId: string, userId: string) {
  try {
    const loaded = await loadCampaignPolicyReport(campaignId, userId)
    return loaded?.report ?? null
  } catch (error) {
    console.warn("Investigation case brief campaign policy unavailable", {
      campaignId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function safeLatestReview(analysisId: string, clusterLabel: string) {
  try {
    return await loadLatestClusterReview(analysisId, clusterLabel)
  } catch (error) {
    console.warn("Investigation case brief cluster review unavailable", {
      analysisId,
      clusterLabel,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export async function loadInvestigationCaseBrief(
  analysisId: string,
  userId: string,
  clusterLabel: string,
): Promise<InvestigationCaseBriefLoadResult | null> {
  const investigation = await loadClusterInvestigation(analysisId, userId, clusterLabel)
  if (!investigation) return null
  if (!investigation.report) {
    return { analysisId, clusterLabel, brief: null }
  }

  const [latestReview, policyReport] = await Promise.all([
    safeLatestReview(analysisId, clusterLabel),
    safeCampaignPolicy(investigation.report.project.id, userId),
  ])

  return {
    analysisId,
    clusterLabel,
    brief: buildInvestigationCaseBrief({
      report: investigation.report,
      latestReview,
      policyReport,
    }),
  }
}
