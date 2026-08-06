import { serializeAnalysis } from "@/lib/analysis/serializers"
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
  const latest = latestId
    ? await db.analysis.findFirst({
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
    : null

  return {
    campaign: {
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      analyses: project.analyses.map((analysis) => ({
        ...analysis,
        status: String(analysis.status),
        createdAt: analysis.createdAt.toISOString(),
        completedAt: analysis.completedAt?.toISOString() ?? null,
      })),
    },
    latestAnalysis: latest ? serializeAnalysis(latest) : null,
  }
}
