import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { isDatabaseConnectionError } from "@/lib/db/errors"
import { getAnalysisQueueStatus } from "@/lib/analysis/queue-optimizer"
import { boundedNumber } from "@/lib/worker/auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(request.url)
  const analysisId = url.searchParams.get("analysisId")
  const staleMinutes = boundedNumber(url.searchParams.get("staleMinutes"), 15, 1, 120)

  try {
    const queue = await getAnalysisQueueStatus({
      analysisId,
      userId: user.id,
      staleMinutes,
    })

    return NextResponse.json({ queue, analysisId })
  } catch (error) {
    if (isDatabaseConnectionError(error)) {
      return NextResponse.json({ error: "Database is required for queue status" }, { status: 503 })
    }
    throw error
  }
}
