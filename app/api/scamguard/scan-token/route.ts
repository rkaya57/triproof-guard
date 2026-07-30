import { NextResponse } from "next/server"

import { scanScamGuard, type ScamGuardChain } from "@/lib/scamguard/engine"
import { scanAccess } from "@/lib/scamguard/scan-access"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { value?: string; chain?: ScamGuardChain } | null
  const value = body?.value?.trim()
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 })
  const access = await scanAccess(false)
  if (access.error) return access.error

  return NextResponse.json(await scanScamGuard({ type: "token", value, chain: body?.chain }), {
    headers: {
      "Cache-Control": "no-store",
      "X-ScamGuard-Plan": access.plan.name,
      "X-ScamGuard-Daily-Limit": String(access.plan.dailyScanLimit),
      "X-ScamGuard-Scans-Used": String(access.scanCount),
    },
  })
}
