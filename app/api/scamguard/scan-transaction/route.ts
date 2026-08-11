import { NextResponse } from "next/server"

import { scanScamGuard, type ScamGuardChain } from "@/lib/scamguard/engine"
import { scanAccess } from "@/lib/scamguard/scan-access"
import { applyScamGuardV11TransactionHardening } from "@/lib/scamguard/v1_1-postprocess"
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

  const baseResult = await scanScamGuard({
    type: "transaction",
    value,
    walletAddress: body?.walletAddress,
    chain: body?.chain,
    sourceUrl: body?.sourceUrl,
  })
  const result = await applyScamGuardV11TransactionHardening(baseResult, value, body?.sourceUrl)

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
      "X-ScamGuard-Plan": access.plan.name,
      "X-ScamGuard-Daily-Limit": String(access.plan.dailyScanLimit),
      "X-ScamGuard-Scans-Used": String(access.scanCount),
    },
  })
}
