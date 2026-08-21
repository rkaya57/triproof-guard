import { notFound } from "next/navigation"

import { CampaignPolicyExplorer } from "@/components/dashboard/campaign-policy-explorer"
import { CampaignPolicySimulator } from "@/components/dashboard/campaign-policy-simulator"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { loadCampaignPolicyReport } from "@/lib/campaign-policy/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import type { RiskPolicy } from "@/types"

function policyPreset(value: string | string[] | undefined): RiskPolicy | undefined {
  const normalized = Array.isArray(value) ? value[0] : value
  if (normalized === "conservative" || normalized === "balanced" || normalized === "strict") {
    return normalized
  }
  return undefined
}

export default async function CampaignPolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ preset?: string | string[] }>
}) {
  const { id } = await params
  const query = await searchParams
  const user = await requirePageUser(`/dashboard/campaigns/${id}/policy`)
  let result: Awaited<ReturnType<typeof loadCampaignPolicyReport>> = null
  let unavailable = false

  try {
    result = await loadCampaignPolicyReport(id, user.id, policyPreset(query.preset))
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    unavailable = true
  }

  if (unavailable) {
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader>
          <CardTitle>Campaign policy temporarily unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No wallet decision or campaign data was changed. Retry when the database connection is available.
        </CardContent>
      </Card>
    )
  }

  if (!result) notFound()
  if (!result.report) {
    return (
      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle>No analysis available for {result.campaignName}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Run a campaign analysis first. The policy engine remains read-only and will not create decisions without analysis evidence.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <CampaignPolicySimulator report={result.report} />
      <CampaignPolicyExplorer report={result.report} />
    </div>
  )
}
