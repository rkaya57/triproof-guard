import Link from "next/link"

import { TeamReviewDashboard } from "@/components/analysis/team-review-dashboard"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { getCurrentUser } from "@/lib/auth/session"
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

function StateCard({ title, description, action }: { title: string; description: string; action: React.ReactNode }) {
  return (
    <Card className="glass-panel mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{action}</CardContent>
    </Card>
  )
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user) {
    return <StateCard title="Login required" description="Team review is available to authenticated dashboard users." action={<Link href="/login" className={buttonVariants()}>Login</Link>} />
  }

  const { analysis, databaseRequired } = await loadReviewAnalysis(id, user.id)

  if (databaseRequired) {
    return <StateCard title="Database required" description="Team review requires the production database connection." action={<Link href={`/dashboard/analysis/${id}`} className={buttonVariants({ variant: "outline" })}>Back to analysis</Link>} />
  }

  if (!analysis) {
    return <StateCard title="Analysis not found" description="This review dashboard could not find the requested analysis." action={<Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>Back to dashboard</Link>} />
  }

  const relationships = await loadDecisionFundingRelationships(id)
  const reviewAnalysis = attachFundingProvenanceDecisionEvidence(
    serializeAnalysis(analysis),
    relationships,
  )

  return <TeamReviewDashboard initialAnalysis={reviewAnalysis} />
}
