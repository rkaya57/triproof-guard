import { notFound } from "next/navigation"

import { CampaignBenchmarkDashboard } from "@/components/dashboard/campaign-benchmark-dashboard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { loadCampaignBenchmarkReport } from "@/lib/campaign-benchmark/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export default async function CampaignMetricsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requirePageUser(`/dashboard/campaigns/${id}/metrics`)

  try {
    const result = await loadCampaignBenchmarkReport(id, user.id)
    if (!result) notFound()
    if (!result.report) {
      return (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle>No completed campaign analysis</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Run or complete an analysis before benchmark and outcome metrics can be calculated.
          </CardContent>
        </Card>
      )
    }
    return <CampaignBenchmarkDashboard report={result.report} />
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <Card className="glass-panel premium-card border-amber-400/30">
        <CardHeader>
          <CardTitle>Campaign metrics temporarily unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Existing campaign data and decisions were not changed. Retry when the database connection is available.
        </CardContent>
      </Card>
    )
  }
}
