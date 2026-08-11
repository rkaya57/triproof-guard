import Link from "next/link"
import { Activity, Layers3, Plus, ShieldCheck } from "lucide-react"

import { CampaignsWorkspace, type CampaignWorkspaceProject } from "@/components/dashboard/campaigns-workspace"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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

  const totalRuns = projects.reduce((sum, project) => sum + project.analysisCount, 0)

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-[linear-gradient(120deg,rgba(8,47,73,.38),rgba(15,23,42,.84)_58%,rgba(76,29,149,.12))] p-6 sm:p-7">
        <div className="relative z-10 grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <Badge variant="outline" className="mb-3 border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200"><Layers3 className="mr-1 size-3" /> Campaign intelligence</Badge>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Security operations by campaign</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Keep analyses, Gray Zone decisions, evidence confidence and wallet outcomes grouped around the campaign they belong to.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-2.5 text-xs text-slate-400"><span className="mr-2 text-lg font-semibold text-white">{projects.length}</span> campaigns</div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-2.5 text-xs text-slate-400"><span className="mr-2 text-lg font-semibold text-white">{totalRuns}</span> analysis runs</div>
            <Link href="/dashboard/new-analysis" className={`${buttonVariants({ size: "sm" })} border border-cyan-300/20 bg-cyan-400/90 text-slate-950 hover:bg-cyan-300`}><Plus className="size-4" /> New analysis</Link>
          </div>
        </div>
      </section>

      {!loadError && projects.length > 0 && (
        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500"><Activity className="size-3.5 text-cyan-300" /> Quick access</div>
          <div className="flex flex-wrap gap-2">
            {projects.slice(0, 12).map((project) => (
              <Link key={project.id} href={`/dashboard/campaigns/${project.id}`} className={`${buttonVariants({ variant: "outline", size: "sm" })} border-white/[0.08] bg-white/[0.02] text-slate-300 hover:border-cyan-400/25 hover:bg-cyan-400/[0.04]`}>
                {project.name}<Badge variant="secondary" className="ml-1 border-cyan-400/10 bg-cyan-400/[0.06] text-cyan-200">{project.chain}</Badge>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loadError && <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-4 text-sm text-amber-100"><ShieldCheck className="mr-2 inline size-4" /> Campaign data is temporarily unavailable. Existing records are unchanged.</div>}
      <CampaignsWorkspace projects={projects} loadError={loadError} />
    </div>
  )
}
