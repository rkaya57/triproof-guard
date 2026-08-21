import Link from "next/link"
import { Activity, ShieldCheck } from "lucide-react"

import { CampaignsWorkspace, type CampaignWorkspaceProject } from "@/components/dashboard/campaigns-workspace"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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

  return (
    <div className="flex flex-col gap-5">
      {!loadError && projects.length > 0 && (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            <Activity className="size-3.5 text-cyan-300" /> Quick access
          </div>
          <div className="flex flex-wrap gap-2">
            {projects.slice(0, 12).map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/campaigns/${project.id}`}
                className={`${buttonVariants({ variant: "outline", size: "sm" })} border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-cyan-400/25 hover:bg-cyan-400/[0.04]`}
              >
                {project.name}
                <Badge variant="secondary" className="ml-1 border-cyan-400/10 bg-cyan-400/[0.06] text-cyan-200">
                  {project.chain}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loadError && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm text-amber-100">
          <ShieldCheck className="mr-2 inline size-4" /> Campaign data is temporarily unavailable. Existing records are unchanged.
        </div>
      )}

      <CampaignsWorkspace projects={projects} loadError={loadError} />
    </div>
  )
}
