import { serializeAnalysis } from "@/lib/analysis/serializers"
import { attachFundingProvenanceDecisionEvidence } from "@/lib/campaign-security/funding-provenance-evidence"
import { loadDecisionFundingRelationships } from "@/lib/campaign-security/funding-provenance-evidence-server"
import {
  buildCrossClusterComparison,
  type CrossClusterComparisonReport,
} from "@/lib/cluster-investigation/comparison"
import { db } from "@/lib/db/prisma"

export type CrossClusterComparisonLoadResult = {
  analysisId: string
  report: CrossClusterComparisonReport
}

export async function loadCrossClusterComparison(
  analysisId: string,
  userId: string,
  clusterLabels: readonly string[],
): Promise<CrossClusterComparisonLoadResult | null> {
  const analysis = await db.analysis.findFirst({
    where: { id: analysisId, project: { userId } },
    include: {
      project: true,
      wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
      clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
      teamReviews: { include: { reviewer: { select: { name: true } } } },
      feedbackEvents: true,
      graphSummary: true,
      aiBrief: true,
    },
  })
  if (!analysis) return null

  const fundingRelationships = await loadDecisionFundingRelationships(analysisId)
  const serialized = attachFundingProvenanceDecisionEvidence(
    serializeAnalysis(analysis),
    fundingRelationships,
  )

  return {
    analysisId,
    report: buildCrossClusterComparison({
      analysis: serialized,
      clusterLabels,
      fundingRelationships,
    }),
  }
}
