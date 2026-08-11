import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { assertTrustedAuthOrigin } from "@/lib/auth/security"
import { requestUnstake, withdrawPosition } from "@/lib/staking/service"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  try {
    assertTrustedAuthOrigin(request)
    const body = (await request.json()) as Record<string, unknown>
    const positionId = String(body.positionId ?? "")
    if (body.action === "withdraw") {
      const result = await withdrawPosition({ userId: admin.id, positionId })
      return NextResponse.json({ ok: true, action: "withdraw", ...result }, { headers: { "Cache-Control": "private, no-store" } })
    }
    await requestUnstake({ userId: admin.id, positionId })
    return NextResponse.json({ ok: true, action: "request" }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update unstake request." }, { status: 400 })
  }
}
