import { NextResponse } from "next/server"

import { aiBriefRateLimit } from "@/lib/ai/brief-rate-limit"
import {
  generateAndStoreAnalysisReportBrief,
  getAnalysisReportBrief,
} from "@/lib/ai/analysis-report-service"
import { getCurrentUser } from "@/lib/auth/session"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await context.params
  const result = await getAnalysisReportBrief(id, { userId: user.id })
  if (!result) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })

  return NextResponse.json({
    brief: result.brief,
    evidenceMeta: result.evidenceMeta,
    cached: result.cached,
    message: result.cached
      ? undefined
      : result.evidenceMeta.walletAssessments > 0 || result.evidenceMeta.clusterAssessments > 0
        ? "Audited production AI evidence is available; refresh the AI report to synthesize it with Gemini."
        : "No production AI audit evidence is available for this analysis yet; a deterministic evidence brief is shown.",
  })
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const limit = aiBriefRateLimit(user.id)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "AI report rate limit reached. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  const { id } = await context.params
  const result = await generateAndStoreAnalysisReportBrief(id, { userId: user.id })
  if (!result) return NextResponse.json({ error: "Analysis not found" }, { status: 404 })
  if (result.status !== "ready" || !result.brief) {
    return NextResponse.json(
      { error: "AI reports are available after the analysis completes." },
      { status: 409 }
    )
  }

  return NextResponse.json(
    {
      brief: result.brief,
      evidenceMeta: result.evidenceMeta,
      cached: false,
    },
    { headers: { "X-RateLimit-Remaining": String(limit.remaining) } }
  )
}
