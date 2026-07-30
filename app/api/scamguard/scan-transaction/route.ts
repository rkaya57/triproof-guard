import { NextResponse } from "next/server"

import { scanScamGuard, type ScamGuardChain } from "@/lib/scamguard/engine"
import { scanAccess } from "@/lib/scamguard/scan-access"

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
  const access = await scanAccess(false)
  if (access.error) return access.error

  return NextResponse.json(
    await scanScamGuard({ type: "transaction", value, walletAddress: body?.walletAddress, chain: body?.chain, sourceUrl: body?.sourceUrl }),
    { headers: { "Cache-Control": "no-store" } }
  )
}
