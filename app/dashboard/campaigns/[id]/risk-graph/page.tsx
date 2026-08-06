import { notFound } from "next/navigation"

import { RiskGraphExplorer } from "@/components/dashboard/risk-graph-explorer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { loadCampaignRiskGraph } from "@/lib/risk-graph/server"

export default async function CampaignRiskGraphPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requirePageUser(`/dashboard/campaigns/${id}/risk-graph`)

  try {
    const graph = await loadCampaignRiskGraph(id, user.id)
    if (!graph) notFound()
    const campaignName =
      graph.nodes.find((node) => node.kind === "campaign")?.label ?? "Campaign"
    return <RiskGraphExplorer graph={graph} campaignName={campaignName} />
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader>
          <CardTitle>Risk graph temporarily unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          The campaign and existing analyses were not changed. Retry when the database connection is available.
        </CardContent>
      </Card>
    )
  }
}
