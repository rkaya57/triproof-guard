import { notFound } from "next/navigation"

import { CampaignDecisionPackageView } from "@/components/campaigns/campaign-decision-package"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePageUser } from "@/lib/auth/page"
import { loadCampaignDecisionPackage } from "@/lib/campaign-decision-package/server"
import { isDatabaseConnectionError } from "@/lib/db/errors"

export default async function CampaignDecisionPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePageUser(`/dashboard/campaigns/${id}/decisions`)

  let loaded: Awaited<ReturnType<typeof loadCampaignDecisionPackage>>
  try {
    loaded = await loadCampaignDecisionPackage(id, user.id)
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return (
      <Card className="glass-panel premium-card border-amber-400/30 bg-amber-400/5">
        <CardHeader>
          <CardTitle>Campaign Decision Package temporarily unavailable</CardTitle>
          <CardDescription>
            The database could not be reached. Existing wallet decisions, reviews, and campaign policy were not changed.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!loaded) notFound()
  if (!loaded.package) {
    return (
      <Card className="glass-panel premium-card border-dashed">
        <CardHeader>
          <CardTitle>Campaign analysis required</CardTitle>
          <CardDescription>
            A Decision Package is produced only after the campaign has a stored analysis run.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No wallet decision, campaign policy, or reward list was changed.
        </CardContent>
      </Card>
    )
  }
  return <CampaignDecisionPackageView pkg={loaded.package} />
}
