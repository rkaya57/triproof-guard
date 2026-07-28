import { NextResponse } from "next/server"

import { scanScamGuard, type ScamGuardChain } from "@/lib/scamguard/engine"
import { sandboxRateLimit } from "@/lib/scamguard/sandbox-rate-limit"

export const runtime = "nodejs"
export const maxDuration = 20

export async function POST(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const clientId = forwardedFor ?? request.headers.get("x-real-ip") ?? "anonymous"
  const rateLimit = sandboxRateLimit(clientId)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "URL sandbox rate limit reached. Try again shortly." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      }
    )
  }

  const body = (await request.json().catch(() => null)) as { value?: string; chain?: ScamGuardChain } | null
  const value = body?.value?.trim()
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  if (value.length > 4_096) return NextResponse.json({ error: "URL is too long" }, { status: 413 })

  return NextResponse.json(await scanScamGuard({ type: "url", value, chain: body?.chain, deepScan: true }), {
    headers: {
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  })
}
