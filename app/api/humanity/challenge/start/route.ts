import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { generateChallengeSequence, generateNonce, type HumanityChallengeLevel } from "@/lib/humanity/admin-gate"

export const runtime = "nodejs"

type CampaignRow = {
  id: string
  challengeLevel: HumanityChallengeLevel
  humanityGateEnabled: boolean
  maxAttemptsPerWallet: number
}

type SessionRow = {
  id: string
  nonce: string
  expiresAt: Date
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    campaignId?: string
    walletAddress?: string
    walletChain?: string
  } | null

  const campaignId = body?.campaignId?.trim()
  const walletAddress = body?.walletAddress?.trim().toLowerCase()
  const walletChain = body?.walletChain?.trim() || null

  if (!campaignId || !walletAddress || walletAddress.length < 10) {
    return NextResponse.json({ error: "campaignId and walletAddress are required" }, { status: 400 })
  }

  try {
    const campaigns = await db.$queryRaw<CampaignRow[]>`
      SELECT "id", "challengeLevel", "humanityGateEnabled", "maxAttemptsPerWallet"
      FROM "HumanityCampaign"
      WHERE "id" = ${campaignId} OR "slug" = ${campaignId}
      LIMIT 1
    `
    const campaign = campaigns[0]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    if (!campaign.humanityGateEnabled) return NextResponse.json({ error: "Humanity gate disabled" }, { status: 403 })

    const challengeSequence = generateChallengeSequence(campaign.challengeLevel)
    const nonce = generateNonce()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    const rows = await db.$queryRaw<SessionRow[]>`
      INSERT INTO "HumanityChallengeSession" (
        "id", "campaignId", "walletAddress", "walletChain", "nonce", "challengeSequence", "status", "expiresAt", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid()::text, ${campaign.id}, ${walletAddress}, ${walletChain}, ${nonce}, ${JSON.stringify(challengeSequence)}::jsonb, 'PENDING', ${expiresAt}, NOW(), NOW()
      )
      RETURNING "id", "nonce", "expiresAt"
    `

    return NextResponse.json(
      {
        sessionId: rows[0].id,
        nonce: rows[0].nonce,
        challengeSequence,
        expiresAt: rows[0].expiresAt.toISOString(),
        level: campaign.challengeLevel,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Humanity challenge start failed", error)
    return NextResponse.json({ error: "Could not start Humanity challenge" }, { status: 500 })
  }
}
