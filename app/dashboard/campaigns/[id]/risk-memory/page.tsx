import { notFound } from "next/navigation"

import { RiskMemoryExplorer } from "@/components/dashboard/risk-memory-explorer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { loadCrossCampaignRiskMemory } from "@/lib/risk-memory/server"
import type { CrossCampaignRiskMemory } from "@/lib/risk-memory/types"

export default async function CampaignRiskMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requirePageUser(`/dashboard/campaigns/${id}/risk-memory`)
  let memory: CrossCampaignRiskMemory | null = null
  let unavailable = false

  try {
    memory = await loadCrossCampaignRiskMemory(id, user.id)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    unavailable = true
  }

  if (unavailable) {
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader>
          <CardTitle>Risk memory temporarily unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Existing campaigns, analyses and review decisions were not changed. Retry when the database connection is available.
        </CardContent>
      </Card>
    )
  }

  if (!memory) notFound()
  return <RiskMemoryExplorer memory={memory} />
}
