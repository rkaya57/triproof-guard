import { NextResponse } from "next/server"
import { z } from "zod"

import { getAdminUser } from "@/lib/auth/admin"
import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"
import {
  deriveTriProofLightChallenge,
  issueTriProofLivenessToken,
  scoreTriProofLivenessEvidence,
  type TriProofLightColor,
} from "@/lib/humanity/v2/liveness-engine"
import { normalizeWalletAddress } from "@/lib/humanity/v2/core"

export const runtime = "nodejs"

const colorSchema = z.enum(["RED", "GREEN", "BLUE", "WHITE"])
const frameSchema = z.object({
  capturedAtMs: z.number().finite().nonnegative().max(60_000),
  width: z.literal(32),
  height: z.literal(32),
  rgbBase64: z.string().min(100).max(8_000),
})

const trackSnapshotSchema = z.object({
  width: z.number().finite().nonnegative().max(7680),
  height: z.number().finite().nonnegative().max(4320),
  frameRate: z.number().finite().nonnegative().max(240).nullable().optional(),
  facingMode: z.string().trim().max(32).nullable().optional(),
  resizeMode: z.string().trim().max(32).nullable().optional(),
  readyState: z.string().trim().max(24).nullable().optional(),
  muted: z.boolean(),
  enabled: z.boolean(),
})

const captureIntegritySchema = z.object({
  secureContext: z.boolean(),
  frameCallbacksSupported: z.boolean(),
  observedDurationMs: z.number().finite().nonnegative().max(120_000),
  trackStart: trackSnapshotSchema,
  trackEnd: trackSnapshotSchema,
  frameCallbacks: z.array(z.object({
    callbackAtMs: z.number().finite().nonnegative().max(120_000),
    mediaTimeMs: z.number().finite().nonnegative().max(120_000),
    presentedFrames: z.number().int().nonnegative().max(1_000_000_000),
    expectedDisplayTimeMs: z.number().finite().nonnegative().max(120_000).nullable().optional(),
  })).max(360),
  visualSignatures: z.array(z.string().regex(/^[0-9a-f]{8,64}$/i)).max(240),
  motionPairs: z.array(z.object({
    capturedAtMs: z.number().finite().nonnegative().max(120_000),
    landmarkMotion: z.number().finite().nonnegative().max(100),
    pixelMotion: z.number().finite().nonnegative().max(255),
  })).max(240),
  eventCounts: z.object({
    settingsChanges: z.number().int().nonnegative().max(100),
    mute: z.number().int().nonnegative().max(100),
    unmute: z.number().int().nonnegative().max(100),
    ended: z.number().int().nonnegative().max(100),
    visibilityHidden: z.number().int().nonnegative().max(100),
    windowBlur: z.number().int().nonnegative().max(100),
    windowFocus: z.number().int().nonnegative().max(100),
  }),
})

const requestSchema = z.object({
  sessionId: z.string().trim().min(1).max(200),
  walletAddress: z.string().trim().min(10).max(200),
  walletChain: z.string().trim().min(1).max(32).optional(),
  baseline: frameSchema,
  pulses: z.array(frameSchema.extend({
    index: z.number().int().min(0).max(3),
    color: colorSchema,
  })).length(4),
  captureIntegrity: captureIntegritySchema.optional(),
})

export async function POST(request: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 })

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Tri-Proof Liveness V2.2 evidence", issues: parsed.error.issues }, { status: 400 })
  }

  const { sessionId, walletChain, baseline, pulses, captureIntegrity } = parsed.data
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

    const effectiveChain = walletChain ?? session.walletChain
    const sessionWallet = normalizeWalletAddress(session.walletAddress, session.walletChain)
    if (sessionWallet !== walletAddress) {
      return NextResponse.json({ error: "Wallet does not match Humanity session" }, { status: 403 })
    }

    const secret = getHumanityNullifierSecret()
    const challenge = deriveTriProofLightChallenge(session.nonce, secret)
    const result = scoreTriProofLivenessEvidence({
      challenge,
      evidence: {
        baseline,
        pulses: pulses.map((pulse) => ({ ...pulse, color: pulse.color as TriProofLightColor })),
        captureIntegrity,
      },
    })

    if (result.verdict !== "PASS") {
      return NextResponse.json(
        {
          ok: false,
          engine: challenge.engine,
          result,
          attestationIssued: false,
          rawFramesStored: false,
          captureMetadataStored: false,
        },
        { status: result.verdict === "REVIEW" ? 202 : 422 }
      )
    }

    const token = await issueTriProofLivenessToken({
      result,
      expected: {
        sessionId: session.id,
        campaignId: session.campaignId,
        nonce: session.nonce,
        walletAddress,
        walletChain: effectiveChain,
      },
      secret,
    })

    return NextResponse.json({
      ok: true,
      engine: challenge.engine,
      result,
      attestationIssued: true,
      attestationToken: token,
      rawFramesStored: false,
      captureMetadataStored: false,
    })
  } catch (error) {
    console.error("Tri-Proof Liveness V2.2 attestation failed", error)
    return NextResponse.json({ error: "Could not evaluate Tri-Proof Liveness V2.2 evidence" }, { status: 500 })
  }
}
