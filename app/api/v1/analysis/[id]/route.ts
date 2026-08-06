import { NextResponse } from "next/server"

import { getV1ApiUser, apiError } from "@/lib/api/v1-auth"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { apiDecisionValue, decisionExplanation, decisionLabel, decisionLegendForApi } from "@/lib/decision-labels"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getV1ApiUser(request)
  if (auth.error) return auth.error

  const { id } = await context.params

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: auth.user.id } },
      include: {
        project: true,
        wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
        clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
        graphSummary: true,
      },
    })

    if (!analysis) {
      return apiError("Analysis not found", 404)
    }

    const serialized = serializeAnalysis(analysis)
    const baseUrl = new URL(request.url).origin

    return NextResponse.json({
      analysisId: serialized.id,
      status: serialized.status,
      project: serialized.project,
      createdAt: serialized.createdAt,
      completedAt: serialized.completedAt,
      totals: {
        totalWallets: serialized.totalWallets,
        approved: serialized.approvedCount,
        grayZone: serialized.manualReviewCount,
        rejectedNotEligible: serialized.rejectedCount,
        averageRiskScore: serialized.averageRiskScore,
        suspiciousClusters: serialized.suspiciousClustersCount,
      },
      enrichment: serialized.enrichment,
      exports: {
        approved: `${baseUrl}/api/analysis/${serialized.id}/export?type=approved`,
        grayZone: `${baseUrl}/api/analysis/${serialized.id}/export?type=manual_review`,
        rejectedNotEligible: `${baseUrl}/api/analysis/${serialized.id}/export?type=rejected`,
        fullCsv: `${baseUrl}/api/analysis/${serialized.id}/export?type=full`,
        pdf: `${baseUrl}/api/analysis/${serialized.id}/export?type=pdf`,
      },
      decisionLegend: decisionLegendForApi(),
      topWallets: serialized.wallets.slice(0, 25).map((wallet) => ({
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        riskScore: wallet.riskScore,
        riskLevel: wallet.riskLevel,
        decision: apiDecisionValue(wallet.status),
        decisionLabel: decisionLabel(wallet.status),
        decisionExplanation: decisionExplanation(wallet.status),
        status: wallet.status,
        statusExplanation: wallet.statusExplanation,
        clusterId: wallet.clusterId,
        graphComponentId: wallet.graphComponentId,
        graphRiskScore: wallet.graphRiskScore,
        reasons: wallet.reasons.slice(0, 6),
        explainableDecision: buildExplainableDecision(wallet),
      })),
      clusters: serialized.clusters.slice(0, 20),
      graphIntelligence: serialized.graph,
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return apiError("Database is required for API usage", 503)
    }
    throw error
  }
}
