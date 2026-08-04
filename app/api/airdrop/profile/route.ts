import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/auth/session"
import { db } from "@/lib/db/prisma"
import { normalizeXHandle } from "@/lib/airdrop/tasks"
import { creditPendingThreatRewards } from "@/lib/airdrop/threat-rewards"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    xHandle?: string
    rewardWallet?: string
  } | null

  const xHandle = normalizeXHandle(body?.xHandle ?? "")
  const rewardWallet = body?.rewardWallet?.trim() ?? ""

  if (xHandle.length < 2 || xHandle.length > 32) {
    return NextResponse.json({ error: "Enter a valid X handle." }, { status: 400 })
  }

  if (rewardWallet.length < 10 || rewardWallet.length > 128) {
    return NextResponse.json({ error: "Enter the wallet you want tied to this contribution profile." }, { status: 400 })
  }

  const profile = await db.airdropProfile.upsert({
    where: { userId: user.id },
    update: { xHandle, rewardWallet },
    create: {
      userId: user.id,
      xHandle,
      rewardWallet,
      eligibilityStatus: "registered",
    },
  })
  const creditedThreatPoints = await creditPendingThreatRewards(user.id, profile.id)
  const refreshedProfile = creditedThreatPoints
    ? await db.airdropProfile.findUniqueOrThrow({ where: { id: profile.id } })
    : profile

  return NextResponse.json({
    profile: {
      id: refreshedProfile.id,
      xHandle: refreshedProfile.xHandle,
      rewardWallet: refreshedProfile.rewardWallet,
      totalPoints: refreshedProfile.totalPoints,
      eligibilityStatus: refreshedProfile.eligibilityStatus,
    },
    creditedThreatPoints,
  })
}
