import { notFound } from "next/navigation"

import { ClusterInvestigationWorkspace } from "@/components/analysis/cluster-investigation-workspace"
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
    return <ClusterInvestigationWorkspace report={result.report} />
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
