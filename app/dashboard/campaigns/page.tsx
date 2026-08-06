import Link from "next/link"

import { CampaignsWorkspace, type CampaignWorkspaceProject } from "@/components/dashboard/campaigns-workspace"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { db } from "@/lib/db/prisma"
import { isDatabaseConnectionError } from "@/lib/db/errors"

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

  return (
    <div className="flex flex-col gap-6">
      {!loadError && projects.length > 0 && (
        <Card className="glass-panel border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Campaign intelligence pages</CardTitle>
            <CardDescription>
              Open campaign-level Gray Zone, evidence confidence and analysis history metrics.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/campaigns/${project.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {project.name}
                <Badge variant="secondary" className="ml-1">{project.chain}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      <CampaignsWorkspace projects={projects} loadError={loadError} />
    </div>
  )
}
