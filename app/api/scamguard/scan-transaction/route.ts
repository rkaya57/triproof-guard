import { after, NextResponse } from "next/server"

import { scanScamGuard, type ScamGuardChain, type ScamGuardScanInput } from "@/lib/scamguard/engine"
import { scanAccess } from "@/lib/scamguard/scan-access"
import { emitRuntimeShadowTelemetry } from "@/lib/scamguard/v2/runtime-shadow"
import { getExtensionSession } from "@/lib/extension/session"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    value?: string
    walletAddress?: string
    chain?: ScamGuardChain
    sourceUrl?: string
  } | null
  const value = body?.value?.trim()
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  const extensionSession = await getExtensionSession(request)
  const access = await scanAccess(false, extensionSession?.user)
  if (access.error) return access.error

  const scanInput: ScamGuardScanInput = {
    type: "transaction",
    value,
    walletAddress: body?.walletAddress,
    chain: body?.chain,
    sourceUrl: body?.sourceUrl,
  }
  const result = await scanScamGuard(scanInput)

  // V2 stays observe-only. Run it after the V1 response has been produced so
  // shadow evidence cannot change the production decision or consume a second
  // user-facing scan quota. Telemetry intentionally excludes raw targets,
  // source URLs, and signing payloads.
  after(() => emitRuntimeShadowTelemetry(scanInput))

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "X-ScamGuard-Plan": access.plan.name,
      "X-ScamGuard-Daily-Limit": String(access.plan.dailyScanLimit),
      "X-ScamGuard-Scans-Used": String(access.scanCount),
    },
  })
}
