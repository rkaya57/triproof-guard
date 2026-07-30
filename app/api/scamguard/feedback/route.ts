import { NextResponse } from "next/server"

import { saveScamGuardFeedback, type ScamGuardFeedbackVerdict } from "@/lib/scamguard/feedback"
import { scamGuardFeedbackRateLimit } from "@/lib/scamguard/feedback-rate-limit"

export const runtime = "nodejs"

const verdicts = new Set<ScamGuardFeedbackVerdict>([
  "reported_scam",
  "reported_safe",
  "false_positive",
  "false_negative",
])

export async function POST(request: Request) {
  const identifier = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "anonymous"
  const limit = scamGuardFeedbackRateLimit(identifier)
  if (!limit.allowed) return NextResponse.json({ error: "Feedback rate limit reached. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } })
  const body = (await request.json().catch(() => null)) as {
    scanId?: string
    verdict?: ScamGuardFeedbackVerdict
    value?: string
    chain?: string
    reason?: string
    source?: string
  } | null

  if (!body?.verdict || !verdicts.has(body.verdict)) {
    return NextResponse.json(
      { error: "verdict must be reported_scam, reported_safe, false_positive, or false_negative" },
      { status: 400 }
    )
  }

  const feedback = await saveScamGuardFeedback({
    scanId: body.scanId,
    verdict: body.verdict,
    value: body.value,
    chain: body.chain,
    reason: body.reason,
    source: body.source,
  })

  return NextResponse.json({ ok: true, feedback }, { headers: { "Cache-Control": "no-store" } })
}
