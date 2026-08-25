import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { assertTrustedAuthOrigin } from "@/lib/auth/security"
import { claimFaucet } from "@/lib/staking/service"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  try {
    assertTrustedAuthOrigin(request)
    const body = (await request.json()) as Record<string, unknown>
    const result = await claimFaucet({
      userId: admin.id,
      walletAddress: String(body.walletAddress ?? "").trim(),
      tokenAccount: String(body.tokenAccount ?? "").trim(),
    })
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send faucet TRI." }, { status: 400 })
  }
}
