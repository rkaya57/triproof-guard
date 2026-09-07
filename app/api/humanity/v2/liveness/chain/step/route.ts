import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import { enforceHumanityRateLimits, humanityRateLimitResponse } from "@/lib/humanity/v2/abuse-defense"
import { normalizeWalletAddress } from "@/lib/humanity/v2/core"
import {
  assertTriProofLivenessChainBinding,
  getTriProofServerPulseTimingWindow,
  issueTriProofLivenessChainState,
  issueTriProofLivenessV24Token,
  validateTriProofServerPulseTiming,
  verifyTriProofLivenessChainState,
} from "@/lib/humanity/v2/liveness-chain"
import {
  triProofCaptureIntegritySchema,
  triProofLightColorSchema,
  triProofRgbFrameSchema,
} from "@/lib/humanity/v2/liveness-api-schemas"
import {
  deriveTriProofLightChallenge,
  scoreTriProofLivenessEvidence,
  type TriProofLightColor,
} from "@/lib/humanity/v2/liveness-engine"
import {
  closeHumanitySessionAsFailed,
  expireHumanitySession,
} from "@/lib/humanity/v2/session-lifecycle"

export const runtime = "nodejs"

const requestSchema = z.object({
  stateToken: z.string().trim().min(64).max(64_000),
  pulse: triProofRgbFrameSchema.extend({
    index: z.number().int().min(0).max(3),
    color: triProofLightColorSchema,
  }),
  captureIntegrity: triProofCaptureIntegritySchema.optional(),
})

function normalizedChain(value?: string | null) {
  return (value ?? "").trim().toLowerCase()
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid V2.5 liveness-chain step request", issues: parsed.error.issues }, { status: 400 })
  }

  const receivedAtMs = Date.now()
  let consumedSessionId: string | null = null

  try {
    const secret = getHumanityNullifierSecret()
    const state = await verifyTriProofLivenessChainState({ token: parsed.data.stateToken, secret })

    const limited = await enforceHumanityRateLimits({
      request,
      action: "CHAIN_STEP",
      principal: admin.id,
      secret,
      sessionId: state.sessionId,
    })
    if (limited) return humanityRateLimitResponse(limited)

    const session = await db.humanityChallengeSession.findUnique({ where: { id: state.sessionId } })
    if (!session) return NextResponse.json({ error: "Humanity session not found" }, { status: 404 })
    if (session.status !== "PENDING") return NextResponse.json({ error: "Humanity session is already closed" }, { status: 409 })
    if (session.expiresAt.getTime() < receivedAtMs) {
      await expireHumanitySession(session.id)
      return NextResponse.json({ error: "Humanity session expired" }, { status: 410 })
    }

    if (state.walletChain && session.walletChain && normalizedChain(state.walletChain) !== normalizedChain(session.walletChain)) {
      return NextResponse.json({
        error: "V2.4 chain wallet network does not match Humanity session",
        reasonCodes: ["SERVER_CHAIN_WALLET_CHAIN_MISMATCH"],
      }, { status: 403 })
    }

    const effectiveChain = session.walletChain ?? state.walletChain
    const walletAddress = normalizeWalletAddress(session.walletAddress, effectiveChain)
    assertTriProofLivenessChainBinding(state, {
      sessionId: session.id,
      campaignId: session.campaignId,
      nonce: session.nonce,
      walletAddress,
      walletChain: effectiveChain,
    })

    if (session.updatedAt.getTime() !== state.stateVersionMs) {
      return NextResponse.json({
        error: "V2.4 liveness-chain state was already consumed or replaced",
        reasonCodes: ["SERVER_CHAIN_STATE_REPLAY_OR_FORK"],
      }, { status: 409 })
    }

    const challenge = deriveTriProofLightChallenge(session.nonce, secret)
    const expectedPulse = challenge.pulses[state.nextPulseIndex]
    if (!expectedPulse) {
      return NextResponse.json({ error: "V2.4 liveness chain is already complete" }, { status: 409 })
    }
    if (parsed.data.pulse.index !== expectedPulse.index || parsed.data.pulse.color !== expectedPulse.color) {
      return NextResponse.json({
        error: "Pulse does not match the server-issued V2.4 chain step",
        reasonCodes: ["SERVER_CHAIN_PULSE_ORDER_MISMATCH"],
      }, { status: 400 })
    }

    const nextVersion = new Date(Math.max(receivedAtMs, state.stateVersionMs + 1))
    const consumed = await db.humanityChallengeSession.updateMany({
      where: {
        id: session.id,
        status: "PENDING",
        updatedAt: new Date(state.stateVersionMs),
      },
      data: { updatedAt: nextVersion },
    })
    if (consumed.count !== 1) {
      return NextResponse.json({
        error: "V2.4 liveness-chain state was consumed concurrently",
        reasonCodes: ["SERVER_CHAIN_STATE_REPLAY_OR_FORK"],
      }, { status: 409 })
    }
    consumedSessionId = session.id

    const timing = validateTriProofServerPulseTiming({
      pulse: expectedPulse,
      serverIssuedAtMs: state.serverIssuedAtMs,
      receivedAtMs,
    })
    if (!timing.ok) {
      await closeHumanitySessionAsFailed({
        sessionId: session.id,
        event: "SERVER_CHAIN_TIMING_FAILURE",
        detail: `pulse=${expectedPulse.index};elapsedMs=${Math.round(timing.elapsedMs)}`,
      })
      consumedSessionId = null
      return NextResponse.json({
        ok: false,
        final: false,
        protocol: "TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN",
        abuseDefenseVersion: "2.5",
        attestationIssued: false,
        sessionClosed: true,
        reasonCodes: ["SERVER_CHAIN_TIMING_ANOMALY", "HUMANITY_SESSION_FAILED"],
        timing,
        rawFramesStored: false,
        captureMetadataStored: false,
      }, { status: 422, headers: { "Cache-Control": "no-store" } })
    }

    const acceptedPulse = {
      ...parsed.data.pulse,
      color: parsed.data.pulse.color as TriProofLightColor,
    }
    const pulses = [...state.pulses, acceptedPulse]
    const nextPulseIndex = state.nextPulseIndex + 1

    if (nextPulseIndex < challenge.pulses.length) {
      const serverIssuedAtMs = Date.now()
      const stateToken = await issueTriProofLivenessChainState({
        secret,
        state: {
          ...state,
          walletAddress,
          walletChain: effectiveChain,
          nextPulseIndex,
          stateVersionMs: nextVersion.getTime(),
          serverIssuedAtMs,
          pulses,
        },
      })
      const nextPulse = challenge.pulses[nextPulseIndex]
      consumedSessionId = null
      return NextResponse.json({
        ok: true,
        final: false,
        protocol: "TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN",
        abuseDefenseVersion: "2.5",
        stateToken,
        pulse: nextPulse,
        acceptedPulseIndex: expectedPulse.index,
        nextPulseIndex,
        serverIssuedAtMs,
        timing,
        timingWindow: getTriProofServerPulseTimingWindow(nextPulse),
        rawFramesStored: false,
        captureMetadataStored: false,
      }, { headers: { "Cache-Control": "no-store" } })
    }

    const scored = scoreTriProofLivenessEvidence({
      challenge,
      evidence: {
        baseline: state.baseline,
        pulses,
        captureIntegrity: parsed.data.captureIntegrity,
      },
    })
    const result = {
      ...scored,
      engineVersion: "2.4" as const,
      scoringEngineVersion: scored.engineVersion,
      serverChainVerified: true,
      abuseDefenseVersion: "2.5" as const,
      reasonCodes: [...scored.reasonCodes, "TRIPROOF_SERVER_CHAIN_V2_4_VERIFIED", "TRIPROOF_ABUSE_DEFENSE_V2_5_ACTIVE"],
    }

    if (scored.verdict !== "PASS") {
      if (scored.verdict === "FAIL") {
        await closeHumanitySessionAsFailed({
          sessionId: session.id,
          event: "LIVENESS_FAIL",
          detail: `liveness=${scored.livenessScore};antiSpoof=${scored.antiSpoofScore}`,
        })
        consumedSessionId = null
      } else {
        consumedSessionId = null
      }

      return NextResponse.json({
        ok: false,
        final: true,
        protocol: "TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN",
        abuseDefenseVersion: "2.5",
        result,
        attestationIssued: false,
        sessionClosed: scored.verdict === "FAIL",
        timing,
        rawFramesStored: false,
        captureMetadataStored: false,
      }, { status: scored.verdict === "REVIEW" ? 202 : 422, headers: { "Cache-Control": "no-store" } })
    }

    const attestationToken = await issueTriProofLivenessV24Token({
      result: scored,
      expected: {
        sessionId: session.id,
        campaignId: session.campaignId,
        nonce: session.nonce,
        walletAddress,
        walletChain: effectiveChain,
      },
      chainId: state.chainId,
      secret,
    })
    consumedSessionId = null

    return NextResponse.json({
      ok: true,
      final: true,
      protocol: "TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN",
      abuseDefenseVersion: "2.5",
      result,
      attestationIssued: true,
      attestationToken,
      timing,
      rawFramesStored: false,
      captureMetadataStored: false,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (consumedSessionId) {
      await closeHumanitySessionAsFailed({
        sessionId: consumedSessionId,
        event: "CHAIN_PROCESSING_ERROR",
        detail: error instanceof Error ? error.message.slice(0, 500) : "unknown",
      }).catch(() => undefined)
    }
    console.error("Tri-Proof Liveness V2.5 chain step failed", error)
    return NextResponse.json({
      error: "Could not consume Tri-Proof Liveness V2.5 server-chain step",
      reason: error instanceof Error ? error.message : "Invalid V2.4 chain state",
    }, { status: 400, headers: { "Cache-Control": "no-store" } })
  }
}
