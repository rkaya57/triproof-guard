import { NextResponse } from "next/server"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import {
  buildSignMessage,
  computeHumanityDecision,
  nullifierHash,
  type HumanityScoreInput,
} from "@/lib/humanity/admin-gate"

export const runtime = "nodejs"

type SessionRow = {
  id: string
  campaignId: string
  walletAddress: string
  walletChain: string | null
  nonce: string
  status: string
  expiresAt: Date
  proofExpiresInDays: number
}

type VerificationRow = {
  id: string
  decision: string
  humanSessionScore: number
  reasonCodes: unknown
  proofExpiresAt: Date
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const body = (await request.json().catch(() => null)) as {
    sessionId?: string
    walletAddress?: string
    walletChain?: string
    scores?: HumanityScoreInput
  } | null

  const sessionId = body?.sessionId?.trim()
  const walletAddress = body?.walletAddress?.trim().toLowerCase()
  if (!sessionId || !walletAddress) {
    return NextResponse.json({ error: "sessionId and walletAddress are required" }, { status: 400 })
  }

  try {
    const sessions = await db.$queryRaw<SessionRow[]>`
      SELECT s."id", s."campaignId", s."walletAddress", s."walletChain", s."nonce", s."status", s."expiresAt", c."proofExpiresInDays"
      FROM "HumanityChallengeSession" s
      JOIN "HumanityCampaign" c ON c."id" = s."campaignId"
      WHERE s."id" = ${sessionId}
      LIMIT 1
    `
    const session = sessions[0]
    if (!session) return NextResponse.json({ error: "Challenge session not found" }, { status: 404 })
    if (session.walletAddress.toLowerCase() !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match session" }, { status: 403 })
    }
    if (session.status !== "PENDING") {
      return NextResponse.json({ error: "Session already submitted or closed" }, { status: 409 })
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await db.$executeRaw`
        UPDATE "HumanityChallengeSession" SET "status" = 'EXPIRED', "updatedAt" = NOW() WHERE "id" = ${session.id}
      `
      return NextResponse.json({ error: "Challenge session expired" }, { status: 410 })
    }

    const decision = computeHumanityDecision(body?.scores ?? {})
    const proofExpiresAt = new Date(Date.now() + session.proofExpiresInDays * 24 * 60 * 60 * 1000)
    const hash = nullifierHash(session.campaignId, walletAddress, session.nonce)
    const rows = await db.$queryRaw<VerificationRow[]>`
      INSERT INTO "HumanityVerification" (
        "id", "campaignId", "sessionId", "walletAddress", "walletChain", "nullifierHash",
        "humanSessionScore", "facePresenceScore", "headPoseScore", "eyeBlinkScore", "handGestureScore",
        "motionTimingScore", "frameConsistencyScore", "replayRiskScore", "injectionRiskScore", "decision",
        "reasonCodes", "signatureVerified", "proofExpiresAt", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid()::text, ${session.campaignId}, ${session.id}, ${walletAddress}, ${body?.walletChain ?? session.walletChain}, ${hash},
        ${decision.humanSessionScore}, ${decision.normalized.facePresenceScore}, ${decision.normalized.headPoseScore}, ${decision.normalized.eyeBlinkScore}, ${decision.normalized.handGestureScore},
        ${decision.normalized.motionTimingScore}, ${decision.normalized.frameConsistencyScore}, ${decision.normalized.replayRiskScore}, ${decision.normalized.injectionRiskScore}, ${decision.decision}::"HumanityDecision",
        ${JSON.stringify(decision.reasonCodes)}::jsonb, false, ${proofExpiresAt}, NOW(), NOW()
      )
      RETURNING "id", "decision", "humanSessionScore", "reasonCodes", "proofExpiresAt"
    `

    await db.$executeRaw`
      UPDATE "HumanityChallengeSession"
      SET "status" = ${decision.decision === "REJECTED" ? "FAILED" : "COMPLETED"}::"HumanitySessionStatus", "updatedAt" = NOW()
      WHERE "id" = ${session.id}
    `

    return NextResponse.json(
      {
        verificationId: rows[0].id,
        decision: rows[0].decision,
        humanSessionScore: rows[0].humanSessionScore,
        reasonCodes: rows[0].reasonCodes,
        proofExpiresAt: rows[0].proofExpiresAt.toISOString(),
        signMessage: buildSignMessage({ campaignId: session.campaignId, walletAddress, nonce: session.nonce }),
        nonce: session.nonce,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Humanity challenge submit failed", error)
    return NextResponse.json({ error: "Could not submit Humanity challenge" }, { status: 500 })
  }
}
