import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { assertTrustedAuthOrigin } from "@/lib/auth/security"
import { getStakingState, recordStake } from "@/lib/staking/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const headers = { "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate" }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers })
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)
  try {
    return json(await getStakingState(admin.id))
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not load staking pilot." }, 503)
  }
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return json({ error: "Admin access required" }, 403)
  try {
    assertTrustedAuthOrigin(request)
    const body = (await request.json()) as Record<string, unknown>
    const position = await recordStake({
      userId: admin.id,
      walletAddress: String(body.walletAddress ?? "").trim(),
      tokenAccount: String(body.tokenAccount ?? "").trim(),
      signature: String(body.signature ?? "").trim(),
      amountUnits: String(body.amountUnits ?? "").trim(),
    })
    return json({ ok: true, positionId: position.id }, 201)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not record Devnet stake." }, 400)
  }
}
