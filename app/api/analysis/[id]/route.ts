import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { attachFundingProvenanceDecisionEvidence } from "@/lib/campaign-security/funding-provenance-evidence"
import { loadDecisionFundingRelationships } from "@/lib/campaign-security/funding-provenance-evidence-server"
import { getDevAnalysisForUser } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

async function getAnalysisWithReviewData(id: string, userId: string) {
  return db.analysis.findFirst({
    where: { id, project: { userId } },
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
}

async function getAnalysisWithoutReviewData(id: string, userId: string) {
  return db.analysis.findFirst({
    where: { id, project: { userId } },
    include: {
      project: true,
      wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
      clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
      graphSummary: true,
      aiBrief: true,
    },
  })
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  let analysis
  try {
    try {
      analysis = await getAnalysisWithReviewData(id, user.id)
    } catch {
      analysis = await getAnalysisWithoutReviewData(id, user.id)
    }
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      const devAnalysis = await getDevAnalysisForUser(user.id, id)
      if (!devAnalysis) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
      }

      return NextResponse.json({ analysis: devAnalysis })
    }

    console.error("Analysis API load failed", error)
    return NextResponse.json({ error: "Analysis could not be loaded" }, { status: 500 })
  }

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  }

  const fundingRelationships = await loadDecisionFundingRelationships(id)
  const serialized = attachFundingProvenanceDecisionEvidence(
    serializeAnalysis(analysis),
    fundingRelationships,
  )

  return NextResponse.json({ analysis: serialized })
}
