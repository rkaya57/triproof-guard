import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText } from "lucide-react"

import { ClusterArchetypePanel } from "@/components/analysis/cluster-archetype-panel"
import { ClusterForensicGraphPanel } from "@/components/analysis/cluster-forensic-graph-panel"
import { ClusterInvestigationWorkspace } from "@/components/analysis/cluster-investigation-workspace"
import { ClusterReviewExportPanel } from "@/components/analysis/cluster-review-export-panel"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { loadClusterInvestigation } from "@/lib/cluster-investigation/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export default async function ClusterInvestigationPage({
  params,
}: {
  params: Promise<{ id: string; clusterLabel: string }>
}) {
  const { id, clusterLabel } = await params
  const user = await requirePageUser(`/dashboard/analysis/${id}/clusters/${clusterLabel}`)
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()

  try {
    const result = await loadClusterInvestigation(id, user.id, normalizedClusterLabel)
    if (!result || !result.report) notFound()
    const briefPath = `/dashboard/analysis/${id}/clusters/${encodeURIComponent(normalizedClusterLabel)}/brief`
    return (
      <>
        <ClusterInvestigationWorkspace report={result.report} />
        <ClusterArchetypePanel report={result.report} />
        <ClusterForensicGraphPanel report={result.report} />
        <div className="mx-auto max-w-7xl px-5 pb-5 sm:px-8">
          <Card className="glass-panel premium-card border-primary/25 bg-primary/5">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 font-medium"><FileText className="size-4 text-primary" /> Customer decision package</p>
                <p className="mt-1 text-sm text-muted-foreground">Turn this technical investigation into a concise case brief with stored decisions, reviewer disposition, matching campaign policy, and explicit decision boundaries.</p>
              </div>
              <Link href={briefPath} className={buttonVariants({ variant: "default" })}>Open Case Brief</Link>
            </CardContent>
          </Card>
        </div>
        <ClusterReviewExportPanel report={result.report} />
      </>
    )
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader>
          <CardTitle>Cluster investigation temporarily unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No cluster membership or wallet decision was changed. Retry when the database connection is available.
        </CardContent>
      </Card>
    )
  }
}
