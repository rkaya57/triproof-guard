import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import { normalizeWalletAddress } from "@/lib/humanity/v2/core"
import {
  createTriProofLivenessChainId,
  getTriProofServerPulseTimingWindow,
  issueTriProofLivenessChainState,
} from "@/lib/humanity/v2/liveness-chain"
import { triProofRgbFrameSchema } from "@/lib/humanity/v2/liveness-api-schemas"
import { deriveTriProofLightChallenge } from "@/lib/humanity/v2/liveness-engine"

export const runtime = "nodejs"

const requestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  walletAddress: z.string().trim().min(10).max(200),
  walletChain: z.string().trim().min(1).max(32).optional(),
  baseline: triProofRgbFrameSchema,
})

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid V2.4 liveness-chain start request", issues: parsed.error.issues }, { status: 400 })
  }

  const { sessionId, walletChain, baseline } = parsed.data
  const walletAddress = normalizeWalletAddress(parsed.data.walletAddress, walletChain)

  try {
    const session = await db.humanityChallengeSession.findUnique({
      where: { id: sessionId },
      include: { campaign: true },
    })
    if (!session) return NextResponse.json({ error: "Humanity session not found" }, { status: 404 })
    if (session.status !== "PENDING") return NextResponse.json({ error: "Humanity session is already closed" }, { status: 409 })
    if (session.expiresAt.getTime() < Date.now()) {
      await db.humanityChallengeSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } })
      return NextResponse.json({ error: "Humanity session expired" }, { status: 410 })
    }

    const sessionWallet = normalizeWalletAddress(session.walletAddress, session.walletChain)
    if (sessionWallet !== walletAddress) return NextResponse.json({ error: "Wallet does not match Humanity session" }, { status: 403 })

    const effectiveChain = walletChain ?? session.walletChain
    const secret = getHumanityNullifierSecret()
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
      return NextResponse.json({ error: "Humanity liveness chain changed concurrently; restart the scan" }, { status: 409 })
    }

    const stateToken = await issueTriProofLivenessChainState({
      secret,
      state: {
        sessionId: session.id,
        campaignId: session.campaignId,
        nonce: session.nonce,
        walletAddress,
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
      chainId,
      stateToken,
      pulse,
      pulseCount: challenge.pulses.length,
      serverIssuedAtMs,
      timingWindow: getTriProofServerPulseTimingWindow(pulse),
      rawFramesStored: false,
      captureMetadataStored: false,
    }, { status: 201 })
  } catch (error) {
    console.error("Tri-Proof Liveness V2.4 chain start failed", error)
    return NextResponse.json({ error: "Could not start Tri-Proof Liveness V2.4 server chain" }, { status: 500 })
  }
}
