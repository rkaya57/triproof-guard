import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { db } from "@/lib/db/prisma"
import { buildAccuracyMetrics } from "@/lib/metrics/accuracy"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      include: {
        project: true,
        teamReviews: true,
        feedbackEvents: true,
      },
    })

    if (!analysis) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

    const metrics = buildAccuracyMetrics({
      totalWallets: analysis.totalWallets,
      feedbackEvents: analysis.feedbackEvents,
      teamReviews: analysis.teamReviews,
    })

    return NextResponse.json({
      analysisId: analysis.id,
      project: {
        name: analysis.project.name,
        chain: analysis.project.chain,
        campaignType: analysis.project.campaignType,
      },
      metrics,
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for metrics" }, { status: 503 })
    }
    throw error
  }
}
