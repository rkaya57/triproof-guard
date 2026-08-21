import { serializeAnalysis } from "@/lib/analysis/serializers"
import { buildCampaignRecord } from "@/lib/campaigns/model"
import { db } from "@/lib/db/prisma"

export async function loadCampaignDetail(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      name: true,
      campaignType: true,
      chain: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { analyses: true } },
      analyses: {
        select: {
          id: true,
          status: true,
          totalWallets: true,
          approvedCount: true,
          manualReviewCount: true,
          rejectedCount: true,
          averageRiskScore: true,
          suspiciousClustersCount: true,
          createdAt: true,
          completedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
    },
  })

  if (!project) return null

  const latestId = project.analyses[0]?.id
  const [latest, persistedCampaign] = await Promise.all([
    latestId
      ? db.analysis.findFirst({
          where: { id: latestId, project: { userId } },
          include: {
            project: true,
            wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
            clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
            teamReviews: { include: { reviewer: { select: { name: true } } } },
            feedbackEvents: true,
            graphSummary: true,
            aiBrief: true,
          },
        })
      : Promise.resolve(null),
    db.campaign.findUnique({
      where: { legacyProjectId: project.id },
      select: {
        networks: true,
        lifecycle: true,
        startsAt: true,
        endsAt: true,
        rewardPoolUsd: true,
        metadata: true,
      },
    }),
  ])

  return {
    campaign: buildCampaignRecord(project, {
      lifecycle: persistedCampaign?.lifecycle,
      networks: persistedCampaign?.networks,
      startsAt: persistedCampaign?.startsAt,
      endsAt: persistedCampaign?.endsAt,
      rewardPoolUsd: persistedCampaign?.rewardPoolUsd
        ? Number(persistedCampaign.rewardPoolUsd)
        : null,
      metadata: persistedCampaign?.metadata ?? null,
      analysisRunCount: project._count.analyses,
    }),
    latestAnalysis: latest ? serializeAnalysis(latest) : null,
  }
}
