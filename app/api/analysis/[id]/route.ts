import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { serializeAnalysis } from "@/lib/analysis/serializers"
import { getDevAnalysisForUser } from "@/lib/dev-store/store"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"

export const runtime = "nodejs"

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
    analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      include: {
        project: true,
        wallets: { orderBy: [{ riskScore: "desc" }, { walletAddress: "asc" }] },
        clusters: { orderBy: [{ averageRiskScore: "desc" }, { clusterLabel: "asc" }] },
      },
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      const devAnalysis = await getDevAnalysisForUser(user.id, id)
      if (!devAnalysis) {
        return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
      }

      return NextResponse.json({ analysis: devAnalysis })
    }

    throw error
  }

  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  }

  return NextResponse.json({ analysis: serializeAnalysis(analysis) })
}
