import { NextResponse } from "next/server"

import { getDailyScanStatus } from "@/lib/billing/subscription"
import { getExtensionSession } from "@/lib/extension/session"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const session = await getExtensionSession(request)
  if (!session) return NextResponse.json({ error: "Extension account connection is required." }, { status: 401 })

  const status = await getDailyScanStatus(session.user)
  return NextResponse.json(
    {
      account: { name: session.user.name },
      access: {
        planId: status.plan.id,
        planName: status.plan.name,
        dailyScanLimit: status.dailyScanLimit,
        scanCount: status.scanCount,
        deepUrlScamDna: status.plan.deepUrlScamDna,
        telegramGroupLimit: status.isAdmin ? null : status.plan.telegramGroupLimit,
        expiresAt: status.expiresAt?.toISOString() ?? null,
        isAdmin: status.isAdmin,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
