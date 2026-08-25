import { apiError, getApiUser } from "@/lib/api/auth"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { buildExplainableDecision } from "@/lib/campaign-security/decision-evidence"
import { apiDecisionValue, decisionExplanation, decisionLabel } from "@/lib/decision-labels"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; analysisId: string }> },
) {
  const auth = await getApiUser(request)
  if (auth.error) return auth.error
  const { id, analysisId } = await context.params

  try {
    const analysis = await db.analysis.findFirst({
      where: {
        id: analysisId,
        projectId: id,
        project: { userId: auth.user.id },
      },
      include: {
        project: true,
        wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
        clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
        graphSummary: true,
      },
    })
    if (!analysis) return apiError("Campaign analysis run not found", 404)

    const run = await db.campaignAnalysisRun.findUnique({
      where: { legacyAnalysisId: analysis.id },
      select: {
        inputHash: true,
        modelVersion: true,
        policyVersion: true,
        policy: { select: { id: true, preset: true, version: true } },
      },
    })
    const serialized = serializeAnalysis(analysis)

    return Response.json({
      id: serialized.id,
      object: "analysis_run",
      apiVersion: "v2",
      campaignId: id,
      analysisId: serialized.id,
      status: serialized.status,
      chain: serialized.project.chain,
      inputHash: run?.inputHash ?? null,
      modelVersion: run?.modelVersion ?? null,
      riskPolicy: run?.policy?.preset ?? null,
      policyId: run?.policy?.id ?? null,
      policyVersion: run?.policy?.version ?? null,
      totals: {
        wallets: serialized.totalWallets,
        allow: serialized.approvedCount,
        review: serialized.manualReviewCount,
        exclude: serialized.rejectedCount,
        averageRiskScore: serialized.averageRiskScore,
        suspiciousClusters: serialized.suspiciousClustersCount,
      },
      enrichment: serialized.enrichment,
      topWallets: serialized.wallets.slice(0, 25).map((wallet) => ({
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        riskScore: wallet.riskScore,
        riskLevel: wallet.riskLevel,
        decision: apiDecisionValue(wallet.status),
        decisionLabel: decisionLabel(wallet.status),
        decisionExplanation: decisionExplanation(wallet.status),
        storedStatus: wallet.status,
        clusterId: wallet.clusterId,
        graphComponentId: wallet.graphComponentId,
        reasons: wallet.reasons.slice(0, 6),
        explainableDecision: wallet.decisionEvidence ?? buildExplainableDecision(wallet),
      })),
      clusters: serialized.clusters.slice(0, 20).map((cluster) => ({
        ...cluster,
        intelligenceUrl: `/api/v2/campaigns/${encodeURIComponent(id)}/analyses/${encodeURIComponent(analysisId)}/clusters/${encodeURIComponent(cluster.clusterLabel)}`,
      })),
      links: {
        campaign: `/api/v2/campaigns/${id}`,
        decisions: `/api/v2/campaigns/${id}/decisions`,
        legacyFullExport: `/api/analysis/${analysisId}/export?type=full`,
        legacyPdfExport: `/api/analysis/${analysisId}/export?type=pdf`,
        dashboard: `/dashboard/analysis/${analysisId}`,
      },
      createdAt: serialized.createdAt,
      completedAt: serialized.completedAt,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) return apiError("Database is required for API usage", 503)
    throw error
  }
}
