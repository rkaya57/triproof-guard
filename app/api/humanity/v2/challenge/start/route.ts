import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import { generateChallengeSequence, normalizeWalletAddress } from "@/lib/humanity/v2/core"
import { deriveTriProofLightChallenge } from "@/lib/humanity/v2/liveness-engine"

export const runtime = "nodejs"

const requestSchema = z.object({
  campaignId: z.string().trim().min(1).max(200),
  walletAddress: z.string().trim().min(10).max(200),
  walletChain: z.string().trim().min(1).max(32).optional(),
})

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Humanity V2 challenge request", issues: parsed.error.issues }, { status: 400 })
  }

  const { campaignId, walletChain } = parsed.data
  const walletAddress = normalizeWalletAddress(parsed.data.walletAddress, walletChain)

  try {
    const campaign = await db.humanityCampaign.findFirst({
      where: { OR: [{ id: campaignId }, { slug: campaignId }] },
    })
    if (!campaign) return NextResponse.json({ error: "Humanity campaign not found" }, { status: 404 })
    if (!campaign.humanityGateEnabled) return NextResponse.json({ error: "Humanity campaign is disabled" }, { status: 403 })

    const now = new Date()
    await db.humanityChallengeSession.updateMany({
      where: {
        campaignId: campaign.id,
        walletAddress,
        status: "PENDING",
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    })

    const activeSession = await db.humanityChallengeSession.findFirst({
      where: {
        campaignId: campaign.id,
        walletAddress,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    })
    if (activeSession) {
      return NextResponse.json(
        {
          error: "An active Humanity V2 challenge already exists for this wallet",
          sessionId: activeSession.id,
          expiresAt: activeSession.expiresAt.toISOString(),
        },
        { status: 409 }
      )
    }

    const attemptsUsed = await db.humanityChallengeSession.count({
      where: { campaignId: campaign.id, walletAddress },
    })
    if (attemptsUsed >= campaign.maxAttemptsPerWallet) {
      return NextResponse.json(
        {
          error: "Humanity V2 attempt limit reached for this wallet",
          attemptsUsed,
          maxAttempts: campaign.maxAttemptsPerWallet,
        },
        { status: 429 }
      )
    }

    const challengeSequence = generateChallengeSequence(campaign.challengeLevel)
    const nonce = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    const session = await db.humanityChallengeSession.create({
      data: {
        campaignId: campaign.id,
        walletAddress,
        walletChain: walletChain?.toLowerCase() ?? null,
        nonce,
        challengeSequence,
        status: "PENDING",
        expiresAt,
      },
    })

    const livenessChallenge = deriveTriProofLightChallenge(session.nonce, getHumanityNullifierSecret())

    return NextResponse.json(
      {
        sessionId: session.id,
        nonce: session.nonce,
        challengeSequence,
        livenessChallenge,
        expiresAt: session.expiresAt.toISOString(),
        level: campaign.challengeLevel,
        attemptsUsed: attemptsUsed + 1,
        attemptsRemaining: Math.max(0, campaign.maxAttemptsPerWallet - attemptsUsed - 1),
        trustMode: "TRIPROOF_LIVENESS_V1_EXPERIMENTAL",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Humanity V2 challenge start failed", error)
    return NextResponse.json({ error: "Could not start Humanity V2 challenge" }, { status: 500 })
  }
}
