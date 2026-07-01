import { AnalysisDetail } from "@/components/analysis/analysis-detail"
import { AnalysisProcessing } from "@/components/analysis/analysis-processing"
import { getCurrentUser } from "@/lib/auth/session"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { getDevAnalysisForUser } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import type { AnalysisDetail as AnalysisDetailData } from "@/types"

async function getInitialAnalysis(
  id: string,
  userId: string
): Promise<AnalysisDetailData | undefined> {
  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId } },
      include: {
        project: true,
        wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
        clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
        teamReviews: { include: { reviewer: { select: { name: true } } } },
        feedbackEvents: true,
      },
    })

    return analysis ? serializeAnalysis(analysis) : undefined
  } catch (error) {
    if (!isDatabaseConnectionError(error)) {
      throw error
    }

    return (await getDevAnalysisForUser(userId, id)) ?? undefined
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user) {
    return <AnalysisDetail analysisId={id} />
  }

  const initialAnalysis = await getInitialAnalysis(id, user.id)

  if (
    initialAnalysis &&
    initialAnalysis.status !== "completed" &&
    initialAnalysis.status !== "failed"
  ) {
    return (
      <AnalysisProcessing
        analysisId={id}
        initialStatus={{
          analysisId: id,
          status: initialAnalysis.status,
          totalWallets: initialAnalysis.totalWallets,
          processedWalletCount: 0,
          progressPercent: 0,
          batchCount: 0,
          completedBatchCount: 0,
          processingBatchCount: 0,
          failedBatchCount: 0,
          failedEnrichmentCount: 0,
        }}
      />
    )
  }

  return <AnalysisDetail analysisId={id} initialAnalysis={initialAnalysis} />
}
