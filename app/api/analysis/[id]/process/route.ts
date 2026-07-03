import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { dispatchAnalysisWorker } from "@/lib/analysis/worker-dispatch"

export const runtime = "nodejs"

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params

  try {
    const analysis = await db.analysis.findFirst({
      where: { id, project: { userId: user.id } },
      select: { id: true, status: true },
    })

    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
    }

    if (analysis.status === "completed") {
      return NextResponse.json({ processed: false, status: "completed", analysisId: id })
    }

    dispatchAnalysisWorker({ analysisId: id, reason: "legacy-analysis-process-route" })
    return NextResponse.json({
      processed: false,
      status: "queued",
      analysisId: id,
      message: "Server-side worker dispatch queued for this analysis.",
    })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch processing failed" },
      { status: 500 }
    )
  }
}
