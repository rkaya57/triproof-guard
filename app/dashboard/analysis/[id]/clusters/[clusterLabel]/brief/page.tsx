import { notFound } from "next/navigation"

import { InvestigationCaseBriefView } from "@/components/analysis/investigation-case-brief"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { loadInvestigationCaseBrief } from "@/lib/cluster-investigation/case-brief-server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export default async function InvestigationCaseBriefPage({
  params,
}: {
  params: Promise<{ id: string; clusterLabel: string }>
}) {
  const { id, clusterLabel } = await params
  const normalizedClusterLabel = decodeURIComponent(clusterLabel).trim()
  const user = await requirePageUser(
    `/dashboard/analysis/${id}/clusters/${encodeURIComponent(normalizedClusterLabel)}/brief`,
  )

  let result: Awaited<ReturnType<typeof loadInvestigationCaseBrief>>
  try {
    result = await loadInvestigationCaseBrief(id, user.id, normalizedClusterLabel)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader><CardTitle>Investigation case brief temporarily unavailable</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The brief could not be assembled from stored evidence. No cluster or wallet decision was changed.
        </CardContent>
      </Card>
    )
  }

  if (!result?.brief) notFound()
  return <InvestigationCaseBriefView brief={result.brief} />
}
