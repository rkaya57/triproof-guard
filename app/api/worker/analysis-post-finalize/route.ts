import { after, NextResponse } from "next/server"

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

  after(async () => {
    try {
      const result = await deliverAnalysisCompletedWebhookNow(analysisId)
      console.info("Analysis post-finalize worker completed", {
        analysisId,
        delivered: result.delivered,
        skipped: result.skipped,
      })
    } catch (error) {
      console.error("Analysis post-finalize worker failed", {
        analysisId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return NextResponse.json(
    {
      ok: true,
      source: "analysis-post-finalize",
      analysisId,
      scheduled: true,
    },
    { status: 202 }
  )
}
