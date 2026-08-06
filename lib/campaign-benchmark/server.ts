import { buildCampaignBenchmarkReport } from "@/lib/campaign-benchmark/engine"
import type {
  CampaignBenchmarkReport,
  CampaignBenchmarkWorkspaceSnapshot,
} from "@/lib/campaign-benchmark/types"
import { buildCampaignPolicyReport } from "@/lib/campaign-policy/engine"
import { loadCampaignDetail } from "@/lib/campaigns/load-campaign-detail"
import { db } from "@/lib/db/prisma"
import { loadCrossCampaignRiskMemory } from "@/lib/risk-memory/server"

const WORKSPACE_CAMPAIGN_LIMIT = 50

export type CampaignBenchmarkLoadResult = {
  campaignId: string
  campaignName: string
  report: CampaignBenchmarkReport | null
}

function currentSnapshot(
  campaignId: string,
  campaignName: string,
  analysis: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>["latestAnalysis"]
): CampaignBenchmarkWorkspaceSnapshot | null {
  if (!analysis) return null
  return {
    campaignId,
    campaignName,
    analysisId: analysis.id,
    createdAt: analysis.createdAt,
    completedAt: analysis.completedAt,
    totalWallets: analysis.totalWallets,
    approvedCount: analysis.approvedCount,
    manualReviewCount: analysis.manualReviewCount,
    rejectedCount: analysis.rejectedCount,
    averageRiskScore: analysis.averageRiskScore,
    suspiciousClustersCount: analysis.suspiciousClustersCount,
  }
}

export async function loadCampaignBenchmarkReport(
  campaignId: string,
  userId: string
): Promise<CampaignBenchmarkLoadResult | null> {
  const [detail, memory, rawOtherProjects] = await Promise.all([
    loadCampaignDetail(campaignId, userId),
    loadCrossCampaignRiskMemory(campaignId, userId),
    db.project.findMany({
      where: { userId, id: { not: campaignId } },
      orderBy: { updatedAt: "desc" },
      take: WORKSPACE_CAMPAIGN_LIMIT,
      select: {
        id: true,
        name: true,
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            createdAt: true,
            completedAt: true,
            totalWallets: true,
            approvedCount: true,
            manualReviewCount: true,
            rejectedCount: true,
            averageRiskScore: true,
            suspiciousClustersCount: true,
          },
        },
      },
    }),
  ])

  if (!detail) return null
  if (!detail.latestAnalysis) {
    return {
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      report: null,
    }
  }

  const selectedSnapshot = currentSnapshot(
    detail.campaign.id,
    detail.campaign.name,
    detail.latestAnalysis
  )
  if (!selectedSnapshot) {
    return {
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      report: null,
    }
  }

  const workspaceCampaignsTruncated =
    rawOtherProjects.length > WORKSPACE_CAMPAIGN_LIMIT - 1
  const otherSnapshots = rawOtherProjects
    .slice(0, WORKSPACE_CAMPAIGN_LIMIT - 1)
    .flatMap((project) => {
      const analysis = project.analyses[0]
      if (!analysis) return []
      return [
        {
          campaignId: project.id,
          campaignName: project.name,
          analysisId: analysis.id,
          createdAt: analysis.createdAt.toISOString(),
          completedAt: analysis.completedAt?.toISOString() ?? null,
          totalWallets: analysis.totalWallets,
          approvedCount: analysis.approvedCount,
          manualReviewCount: analysis.manualReviewCount,
          rejectedCount: analysis.rejectedCount,
          averageRiskScore: analysis.averageRiskScore,
          suspiciousClustersCount: analysis.suspiciousClustersCount,
        } satisfies CampaignBenchmarkWorkspaceSnapshot,
      ]
    })

  const campaignHistory: CampaignBenchmarkWorkspaceSnapshot[] =
    detail.campaign.analyses.map((analysis) => ({
      campaignId: detail.campaign.id,
      campaignName: detail.campaign.name,
      analysisId: analysis.id,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
      totalWallets: analysis.totalWallets,
      approvedCount: analysis.approvedCount,
      manualReviewCount: analysis.manualReviewCount,
      rejectedCount: analysis.rejectedCount,
      averageRiskScore: analysis.averageRiskScore,
      suspiciousClustersCount: analysis.suspiciousClustersCount,
    }))

  const policy = buildCampaignPolicyReport({
    analysis: detail.latestAnalysis,
    memory,
  })

  return {
    campaignId: detail.campaign.id,
    campaignName: detail.campaign.name,
    report: buildCampaignBenchmarkReport({
      analysis: detail.latestAnalysis,
      policy,
      memory,
      workspaceSnapshots: [selectedSnapshot, ...otherSnapshots],
      campaignHistory,
      workspaceCampaignLimit: WORKSPACE_CAMPAIGN_LIMIT,
      workspaceCampaignsTruncated,
    }),
  }
}
