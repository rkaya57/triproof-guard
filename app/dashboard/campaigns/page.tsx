import { CampaignsWorkspace, type CampaignWorkspaceProject } from "@/components/dashboard/campaigns-workspace"
import { requirePageUser } from "@/lib/auth/page"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export default async function CampaignsPage() {
  const user = await requirePageUser("/dashboard/campaigns")
  let projects: CampaignWorkspaceProject[] = []
  let loadError = false

  try {
    const rows = await db.project.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        campaignType: true,
        chain: true,
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
          take: 5,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    })

    projects = rows.map((project) => ({
      id: project.id,
      name: project.name,
      campaignType: project.campaignType,
      chain: project.chain,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      analysisCount: project._count.analyses,
      analyses: project.analyses.map((analysis) => ({
        id: analysis.id,
        status: String(analysis.status),
        totalWallets: analysis.totalWallets,
        approvedCount: analysis.approvedCount,
        manualReviewCount: analysis.manualReviewCount,
        rejectedCount: analysis.rejectedCount,
        averageRiskScore: analysis.averageRiskScore,
        suspiciousClustersCount: analysis.suspiciousClustersCount,
        createdAt: analysis.createdAt.toISOString(),
        completedAt: analysis.completedAt?.toISOString() ?? null,
      })),
    }))
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    loadError = true
  }

  return <CampaignsWorkspace projects={projects} loadError={loadError} />
}
