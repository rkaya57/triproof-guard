import { NextResponse } from "next/server"

import { isWorkerAuthorized, workerUnauthorized } from "@/lib/worker/auth"
import { deliverAnalysisCompletedWebhookNow } from "@/lib/webhooks/deliver"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: Request) {
  if (!isWorkerAuthorized(request)) return workerUnauthorized()

  const analysisId = new URL(request.url).searchParams.get("analysisId")?.trim()
  if (!analysisId) {
    return NextResponse.json({ error: "analysisId is required" }, { status: 400 })
  }

  const result = await deliverAnalysisCompletedWebhookNow(analysisId)
  return NextResponse.json({
    ok: true,
    source: "analysis-post-finalize",
    analysisId,
    ...result,
  })
}
