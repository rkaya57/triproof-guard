import { NextResponse } from "next/server"

import { scanScamGuard, type ScamGuardChain } from "@/lib/scamguard/engine"
import { sandboxRateLimit } from "@/lib/scamguard/sandbox-rate-limit"
import { scanAccess } from "@/lib/scamguard/scan-access"
import { getExtensionSession } from "@/lib/extension/session"

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

  const body = (await request.json().catch(() => null)) as {
    value?: string
    chain?: ScamGuardChain
    clientSignals?: Array<{ code?: unknown; detail?: unknown }>
  } | null
  const value = body?.value?.trim()
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  if (value.length > 4_096) return NextResponse.json({ error: "URL is too long" }, { status: 413 })

  const extensionSession = await getExtensionSession(request)
  const access = await scanAccess(true, extensionSession?.user)
  if (access.error) return access.error

  const clientSignals = Array.isArray(body?.clientSignals)
    ? body.clientSignals.slice(0, 8).map((signal) => ({
      code: typeof signal?.code === "string" ? signal.code : undefined,
      detail: typeof signal?.detail === "string" ? signal.detail : undefined,
    }))
    : undefined

  return NextResponse.json(await scanScamGuard({ type: "url", value, chain: body?.chain, deepScan: access.deepScan, clientSignals }), {
    headers: {
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rateLimit.remaining),
      "X-ScamGuard-Deep-Scan": String(access.deepScan),
      "X-ScamGuard-Plan": access.plan.name,
      "X-ScamGuard-Daily-Limit": String(access.plan.dailyScanLimit),
      "X-ScamGuard-Scans-Used": String(access.scanCount),
    },
  })
}
