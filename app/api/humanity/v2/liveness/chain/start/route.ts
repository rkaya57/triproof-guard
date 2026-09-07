import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import { enforceHumanityRateLimits, humanityRateLimitResponse } from "@/lib/humanity/v2/abuse-defense"
import { normalizeWalletAddress } from "@/lib/humanity/v2/core"
import {
  createTriProofLivenessChainId,
  getTriProofServerPulseTimingWindow,
  issueTriProofLivenessChainState,
} from "@/lib/humanity/v2/liveness-chain"
import { triProofRgbFrameSchema } from "@/lib/humanity/v2/liveness-api-schemas"
import { deriveTriProofLightChallenge } from "@/lib/humanity/v2/liveness-engine"
import { expireHumanitySession } from "@/lib/humanity/v2/session-lifecycle"

export const runtime = "nodejs"

const INITIAL_SESSION_TIMESTAMP_TOLERANCE_MS = 2_000

const requestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  walletAddress: z.string().trim().min(10).max(200),
  walletChain: z.string().trim().min(1).max(32).optional(),
  baseline: triProofRgbFrameSchema,
})

function normalizedChain(value?: string | null) {
  return (value ?? "").trim().toLowerCase()
}

function sessionHasAlreadyStartedChain(session: { createdAt: Date; updatedAt: Date }) {
  return session.updatedAt.getTime() - session.createdAt.getTime() > INITIAL_SESSION_TIMESTAMP_TOLERANCE_MS
}

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid V2.5 liveness-chain start request", issues: parsed.error.issues }, { status: 400 })
  }

  const { sessionId, walletChain, baseline } = parsed.data
  const walletAddress = normalizeWalletAddress(parsed.data.walletAddress, walletChain)

  try {
    const secret = getHumanityNullifierSecret()
    const limited = await enforceHumanityRateLimits({
      request,
      action: "CHAIN_START",
      principal: admin.id,
      secret,
      sessionId,
    })
    if (limited) return humanityRateLimitResponse(limited)

    const session = await db.humanityChallengeSession.findUnique({
      where: { id: sessionId },
      include: { campaign: true },
    })
    if (!session) return NextResponse.json({ error: "Humanity session not found" }, { status: 404 })
    if (session.status !== "PENDING") return NextResponse.json({ error: "Humanity session is already closed" }, { status: 409 })
    if (session.expiresAt.getTime() < Date.now()) {
      await expireHumanitySession(session.id)
      return NextResponse.json({ error: "Humanity session expired" }, { status: 410 })
    }

    if (walletChain && session.walletChain && normalizedChain(walletChain) !== normalizedChain(session.walletChain)) {
      return NextResponse.json({
        error: "Wallet chain does not match Humanity session",
        reasonCodes: ["SERVER_CHAIN_WALLET_CHAIN_MISMATCH"],
      }, { status: 403 })
    }

    const effectiveChain = session.walletChain ?? walletChain
    const sessionWallet = normalizeWalletAddress(session.walletAddress, effectiveChain)
    const requestWallet = normalizeWalletAddress(parsed.data.walletAddress, effectiveChain)
    if (sessionWallet !== requestWallet || sessionWallet !== normalizeWalletAddress(walletAddress, effectiveChain)) {
      return NextResponse.json({ error: "Wallet does not match Humanity session" }, { status: 403 })
    }

    if (sessionHasAlreadyStartedChain(session)) {
      return NextResponse.json({
        error: "Tri-Proof Liveness server chain has already started for this session",
        reasonCodes: ["SERVER_CHAIN_ALREADY_STARTED"],
      }, { status: 409 })
    }

    const challenge = deriveTriProofLightChallenge(session.nonce, secret)
    const chainId = createTriProofLivenessChainId()
    const serverIssuedAtMs = Date.now()
    const stateVersion = new Date(Math.max(serverIssuedAtMs, session.updatedAt.getTime() + 1))

    const consumed = await db.humanityChallengeSession.updateMany({
      where: {
        id: session.id,
        status: "PENDING",
        updatedAt: session.updatedAt,
      },
      data: { updatedAt: stateVersion },
    })
    if (consumed.count !== 1) {
      return NextResponse.json({
        error: "Humanity liveness chain changed concurrently; start a new Humanity session",
        reasonCodes: ["SERVER_CHAIN_STATE_REPLAY_OR_FORK"],
      }, { status: 409 })
    }

    const stateToken = await issueTriProofLivenessChainState({
      secret,
      state: {
        sessionId: session.id,
        campaignId: session.campaignId,
        nonce: session.nonce,
        walletAddress: sessionWallet,
        walletChain: effectiveChain,
        chainId,
        nextPulseIndex: 0,
        stateVersionMs: stateVersion.getTime(),
        serverIssuedAtMs,
        baseline,
        pulses: [],
      },
    })
    const pulse = challenge.pulses[0]

    return NextResponse.json({
      ok: true,
      protocol: "TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN",
      abuseDefenseVersion: "2.5",
      chainId,
      stateToken,
      pulse,
      pulseCount: challenge.pulses.length,
      serverIssuedAtMs,
      timingWindow: getTriProofServerPulseTimingWindow(pulse),
      rawFramesStored: false,
      captureMetadataStored: false,
    }, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Tri-Proof Liveness V2.5 chain start failed", error)
    return NextResponse.json({ error: "Could not start Tri-Proof Liveness V2.5 server chain" }, { status: 500 })
  }
}
