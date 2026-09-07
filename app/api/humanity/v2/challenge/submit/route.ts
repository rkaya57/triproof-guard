import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import { enforceHumanityRateLimits, humanityRateLimitResponse } from "@/lib/humanity/v2/abuse-defense"
import { verifyHumanityAttestationToken } from "@/lib/humanity/v2/attestation"
import {
  buildNullifierHash,
  buildProofMessage,
  computeHumanityDecision,
  normalizeWalletAddress,
  validateStepEvidence,
} from "@/lib/humanity/v2/core"
import { verifyTriProofLivenessV24Token } from "@/lib/humanity/v2/liveness-chain"
import { expireHumanitySession } from "@/lib/humanity/v2/session-lifecycle"

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
  attestationToken: z.string().trim().min(64).max(16_000).optional(),
  triproofLivenessToken: z.string().trim().min(64).max(16_000).optional(),
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

function normalizedChain(value?: string | null) {
  return (value ?? "").trim().toLowerCase()
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Humanity V2 submission", issues: parsed.error.issues }, { status: 400 })
  }

  const { sessionId, walletChain, scores, stepEvidence, attestationToken, triproofLivenessToken } = parsed.data

  try {
    const secret = getHumanityNullifierSecret()
    const limited = await enforceHumanityRateLimits({
      request,
      action: "SUBMIT",
      principal: admin.id,
      secret,
      sessionId,
    })
    if (limited) return humanityRateLimitResponse(limited)

    const session = await db.humanityChallengeSession.findUnique({
      where: { id: sessionId },
      include: { campaign: true },
    })
    if (!session) return NextResponse.json({ error: "Humanity V2 challenge session not found" }, { status: 404 })

    if (walletChain && session.walletChain && normalizedChain(walletChain) !== normalizedChain(session.walletChain)) {
      return NextResponse.json({
        error: "Wallet chain does not match Humanity V2 session",
        reasonCodes: ["HUMANITY_WALLET_CHAIN_MISMATCH"],
      }, { status: 403 })
    }

    const effectiveWalletChain = session.walletChain ?? walletChain
    const walletAddress = normalizeWalletAddress(parsed.data.walletAddress, effectiveWalletChain)
    const sessionWallet = normalizeWalletAddress(session.walletAddress, effectiveWalletChain)
    if (sessionWallet !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match Humanity V2 session" }, { status: 403 })
    }
    if (session.status !== "PENDING") {
      return NextResponse.json({ error: "Humanity V2 session is already closed" }, { status: 409 })
    }
    if (session.expiresAt.getTime() < Date.now()) {
      await expireHumanitySession(session.id)
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

    const expectedAttestation = {
      sessionId: session.id,
      campaignId: session.campaignId,
      nonce: session.nonce,
      walletAddress,
      walletChain: effectiveWalletChain,
    }

    let attestation = null
    let trustMode = "CLIENT_TELEMETRY_REVIEW_ONLY_V2_5_RATE_LIMITED"

    if (triproofLivenessToken) {
      try {
        attestation = await verifyTriProofLivenessV24Token({
          token: triproofLivenessToken,
          expected: expectedAttestation,
          secret,
        })
        trustMode = "TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN_V2_5_ABUSE_DEFENSE_REVIEW"
      } catch (error) {
        return NextResponse.json(
          {
            error: "Tri-Proof Liveness V2.4 server-chain token could not be verified",
            reason: error instanceof Error ? error.message : "Invalid Tri-Proof V2.4 liveness token",
          },
          { status: 400 }
        )
      }
    } else if (attestationToken) {
      try {
        attestation = await verifyHumanityAttestationToken({
          token: attestationToken,
          expected: expectedAttestation,
        })
        trustMode = "SERVER_VERIFIED_PROVIDER_ATTESTATION_V2_5_ABUSE_DEFENSE"
      } catch (error) {
        return NextResponse.json(
          {
            error: "Humanity provider attestation could not be verified",
            reason: error instanceof Error ? error.message : "Invalid provider attestation",
          },
          { status: 400 }
        )
      }
    }

    const decision = computeHumanityDecision(scores, attestation)
    const nullifierHash = buildNullifierHash({
      secret,
      campaignId: session.campaignId,
      walletAddress,
      walletChain: effectiveWalletChain,
    })

    const existingProof = await db.humanityVerification.findUnique({ where: { nullifierHash } })
    if (existingProof) {
      return NextResponse.json(
        {
          error: "A Humanity V2 verification already exists for this campaign and wallet",
          verificationId: existingProof.id,
          decision: existingProof.decision,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      )
    }

    const proofExpiresAt = new Date(Date.now() + session.campaign.proofExpiresInDays * 24 * 60 * 60 * 1000)

    const [verification] = await db.$transaction([
      db.humanityVerification.create({
        data: {
          campaignId: session.campaignId,
          sessionId: session.id,
          walletAddress,
          walletChain: effectiveWalletChain?.toLowerCase() ?? null,
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
          reasonCodes: [...decision.reasonCodes, "TRIPROOF_ABUSE_DEFENSE_V2_5_ACTIVE"],
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
        trustMode,
        abuseDefenseVersion: "2.5",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("Humanity V2.5 challenge submit failed", error)
    return NextResponse.json({ error: "Could not submit Humanity V2.5 challenge" }, { status: 500 })
  }
}
