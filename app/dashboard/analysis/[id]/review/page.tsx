import Link from "next/link"

import { TeamReviewDashboard } from "@/components/analysis/team-review-dashboard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { getCurrentUser } from "@/lib/auth/session"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { attachFundingProvenanceDecisionEvidence } from "@/lib/campaign-security/funding-provenance-evidence"
import { loadDecisionFundingRelationships } from "@/lib/campaign-security/funding-provenance-evidence-server"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

async function loadReviewAnalysis(id: string, userId: string) {
  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId } },
      include: {
        project: true,
        wallets: { orderBy: [{ status: "desc" }, { riskScore: "desc" }, { walletAddress: "asc" }] },
        clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
        teamReviews: { include: { reviewer: { select: { name: true } } } },
        feedbackEvents: true,
      },
    })
    return { analysis, databaseRequired: false }
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error
    return { analysis: null, databaseRequired: true }
  }
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Login required</CardTitle>
            <CardDescription>Team review is available to authenticated dashboard users.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className={buttonVariants()}>Login</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const { analysis, databaseRequired } = await loadReviewAnalysis(id, user.id)

  if (databaseRequired) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Database required</CardTitle>
            <CardDescription>Team review requires the production database connection.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/dashboard/analysis/${id}`} className={buttonVariants({ variant: "outline" })}>Back to analysis</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  if (!analysis) {
    return (
      <main className="premium-page min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
        <Card className="glass-panel mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Analysis not found</CardTitle>
            <CardDescription>This review dashboard could not find the requested analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  const relationships = await loadDecisionFundingRelationships(id)
  const reviewAnalysis = attachFundingProvenanceDecisionEvidence(
    serializeAnalysis(analysis),
    relationships,
  )

  return (
    <main className="premium-page min-h-screen bg-background text-foreground">
      <TeamReviewDashboard initialAnalysis={reviewAnalysis} />
    </main>
  )
}
