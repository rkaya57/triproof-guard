import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import {
  buildNullifierHash,
  buildProofMessage,
  computeClientTelemetryDecision,
  normalizeWalletAddress,
  validateStepEvidence,
} from "@/lib/humanity/v2/core"

export const runtime = "nodejs"

const challengeStepSchema = z.enum([
  "LOOK_CENTER",
  "TURN_LEFT",
  "TURN_RIGHT",
  "BLINK",
  "RAISE_HAND",
  "SMILE",
])

const scoreSchema = z.number().finite().min(0).max(100)
const requestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  walletAddress: z.string().trim().min(10).max(200),
  walletChain: z.string().trim().min(1).max(32).optional(),
  scores: z.object({
    facePresenceScore: scoreSchema,
    headPoseScore: scoreSchema,
    eyeBlinkScore: scoreSchema,
    handGestureScore: scoreSchema,
    motionTimingScore: scoreSchema,
    frameConsistencyScore: scoreSchema,
    replayRiskScore: scoreSchema,
    injectionRiskScore: scoreSchema,
  }),
  stepEvidence: z.array(
    z.object({
      step: challengeStepSchema,
      capturedAtMs: z.number().finite().nonnegative(),
      heldForMs: z.number().finite().nonnegative(),
    })
  ).min(1).max(10),
})

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Humanity V2 submission", issues: parsed.error.issues }, { status: 400 })
  }

  const { sessionId, walletChain, scores, stepEvidence } = parsed.data
  const walletAddress = normalizeWalletAddress(parsed.data.walletAddress, walletChain)

  try {
    const session = await db.humanityChallengeSession.findUnique({
      where: { id: sessionId },
      include: { campaign: true },
    })
    if (!session) return NextResponse.json({ error: "Humanity V2 challenge session not found" }, { status: 404 })

    const sessionWallet = normalizeWalletAddress(session.walletAddress, session.walletChain)
    if (sessionWallet !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match Humanity V2 session" }, { status: 403 })
    }
    if (session.status !== "PENDING") {
      return NextResponse.json({ error: "Humanity V2 session is already closed" }, { status: 409 })
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await db.humanityChallengeSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } })
      return NextResponse.json({ error: "Humanity V2 session expired" }, { status: 410 })
    }

    const sequenceResult = z.array(challengeStepSchema).safeParse(session.challengeSequence)
    if (!sequenceResult.success) {
      return NextResponse.json({ error: "Stored Humanity V2 challenge sequence is invalid" }, { status: 500 })
    }

    const stepValidation = validateStepEvidence(sequenceResult.data, stepEvidence)
    if (!stepValidation.ok) {
      return NextResponse.json(
        { error: "Humanity V2 challenge evidence does not match the issued sequence", reasonCodes: stepValidation.reasonCodes },
        { status: 400 }
      )
    }

    const decision = computeClientTelemetryDecision(scores)
    const nullifierHash = buildNullifierHash({
      secret: getHumanityNullifierSecret(),
      campaignId: session.campaignId,
      walletAddress,
      walletChain: walletChain ?? session.walletChain,
    })

    const existingProof = await db.humanityVerification.findUnique({ where: { nullifierHash } })
    if (existingProof) {
      return NextResponse.json(
        {
          error: "A Humanity V2 verification already exists for this campaign and wallet",
          verificationId: existingProof.id,
          decision: existingProof.decision,
        },
        { status: 409 }
      )
    }

    const proofExpiresAt = new Date(Date.now() + session.campaign.proofExpiresInDays * 24 * 60 * 60 * 1000)

    const [verification] = await db.$transaction([
      db.humanityVerification.create({
        data: {
          campaignId: session.campaignId,
          sessionId: session.id,
          walletAddress,
          walletChain: walletChain?.toLowerCase() ?? session.walletChain,
          nullifierHash,
          humanSessionScore: decision.humanSessionScore,
          facePresenceScore: decision.normalized.facePresenceScore,
          headPoseScore: decision.normalized.headPoseScore,
          eyeBlinkScore: decision.normalized.eyeBlinkScore,
          handGestureScore: decision.normalized.handGestureScore,
          motionTimingScore: decision.normalized.motionTimingScore,
          frameConsistencyScore: decision.normalized.frameConsistencyScore,
          replayRiskScore: decision.normalized.replayRiskScore,
          injectionRiskScore: decision.normalized.injectionRiskScore,
          decision: decision.decision,
          reasonCodes: decision.reasonCodes,
          signatureVerified: false,
          proofExpiresAt,
        },
      }),
      db.humanityChallengeSession.update({
        where: { id: session.id },
        data: { status: decision.decision === "REJECTED" ? "FAILED" : "COMPLETED" },
      }),
    ])

    const proofMessage = buildProofMessage({
      campaignId: session.campaignId,
      verificationId: verification.id,
      walletAddress,
      walletChain: verification.walletChain,
      nonce: session.nonce,
      decision: verification.decision,
      proofExpiresAt: verification.proofExpiresAt,
    })

    return NextResponse.json(
      {
        verificationId: verification.id,
        decision: verification.decision,
        humanSessionScore: verification.humanSessionScore,
        reasonCodes: verification.reasonCodes,
        proofExpiresAt: verification.proofExpiresAt.toISOString(),
        proofMessage,
        signatureRequired: true,
        trustMode: "CLIENT_TELEMETRY_REVIEW_ONLY",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Humanity V2 challenge submit failed", error)
    return NextResponse.json({ error: "Could not submit Humanity V2 challenge" }, { status: 500 })
  }
}
