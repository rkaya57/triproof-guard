import { createHash, randomBytes } from "crypto"

import { db } from "@/lib/db/prisma"
import { getHumanityNullifierSecret } from "@/lib/env/validation"

export type HumanityDecision = "APPROVED" | "MANUAL_REVIEW" | "REJECTED"
export type HumanityChallengeLevel = "BASIC" | "STANDARD" | "STRICT"

export type HumanityScoreInput = {
  facePresenceScore?: number
  headPoseScore?: number
  eyeBlinkScore?: number
  handGestureScore?: number
  motionTimingScore?: number
  frameConsistencyScore?: number
  replayRiskScore?: number
  injectionRiskScore?: number
}

const defaultCampaigns = [
  {
    slug: "admin-demo-basic",
    name: "Admin Demo Basic",
    description: "Admin-only Humanity Gate basic verification sandbox.",
    challengeLevel: "BASIC" as const,
  },
  {
    slug: "admin-demo-standard",
    name: "Admin Demo Standard",
    description: "Admin-only Humanity Gate standard verification sandbox.",
    challengeLevel: "STANDARD" as const,
  },
  {
    slug: "admin-demo-strict",
    name: "Admin Demo Strict",
    description: "Admin-only Humanity Gate strict verification sandbox.",
    challengeLevel: "STRICT" as const,
  },
]

function clampScore(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function generateNonce() {
  return randomBytes(24).toString("hex")
}

export function generateChallengeSequence(level: HumanityChallengeLevel) {
  if (level === "BASIC") return ["LOOK_CENTER", "TURN_LEFT", "BLINK"]
  if (level === "STRICT") return ["LOOK_CENTER", "TURN_LEFT", "TURN_RIGHT", "BLINK", "RAISE_HAND", "SMILE"]
  return ["LOOK_CENTER", "TURN_LEFT", "TURN_RIGHT", "BLINK"]
}

export function computeHumanityDecision(scores: HumanityScoreInput) {
  const normalized = {
    facePresenceScore: clampScore(scores.facePresenceScore, 70),
    headPoseScore: clampScore(scores.headPoseScore, 70),
    eyeBlinkScore: clampScore(scores.eyeBlinkScore, 70),
    handGestureScore: clampScore(scores.handGestureScore, 70),
    motionTimingScore: clampScore(scores.motionTimingScore, 70),
    frameConsistencyScore: clampScore(scores.frameConsistencyScore, 70),
    replayRiskScore: clampScore(scores.replayRiskScore, 15),
    injectionRiskScore: clampScore(scores.injectionRiskScore, 15),
  }

  const positiveAverage = Math.round(
    (normalized.facePresenceScore +
      normalized.headPoseScore +
      normalized.eyeBlinkScore +
      normalized.handGestureScore +
      normalized.motionTimingScore +
      normalized.frameConsistencyScore) /
      6
  )
  const riskPenalty = Math.round((normalized.replayRiskScore + normalized.injectionRiskScore) / 2)
  const humanSessionScore = Math.max(0, Math.min(100, positiveAverage - Math.round(riskPenalty * 0.35)))
  const reasonCodes: string[] = []
  let decision: HumanityDecision = "APPROVED"

  if (normalized.facePresenceScore < 55) reasonCodes.push("LOW_FACE_PRESENCE")
  if (normalized.headPoseScore < 50) reasonCodes.push("HEAD_POSE_WEAK")
  if (normalized.eyeBlinkScore < 45) reasonCodes.push("BLINK_SIGNAL_WEAK")
  if (normalized.motionTimingScore < 45) reasonCodes.push("MOTION_TIMING_WEAK")
  if (normalized.replayRiskScore >= 70) reasonCodes.push("SCREEN_REPLAY_RISK")
  if (normalized.injectionRiskScore >= 70) reasonCodes.push("INJECTION_RISK")

  if (humanSessionScore < 50 || normalized.replayRiskScore >= 85 || normalized.injectionRiskScore >= 85) {
    decision = "REJECTED"
    reasonCodes.push("HUMANITY_REJECTED")
  } else if (humanSessionScore < 72 || reasonCodes.length > 0) {
    decision = "MANUAL_REVIEW"
    reasonCodes.push("MANUAL_REVIEW_REQUIRED")
  } else {
    reasonCodes.push("HUMANITY_APPROVED")
  }

  return { normalized, humanSessionScore, decision, reasonCodes }
}

export function nullifierHash(campaignId: string, walletAddress: string, nonce: string) {
  const secret = getHumanityNullifierSecret()
  return createHash("sha256")
    .update(`${secret}:${campaignId}:${walletAddress.toLowerCase()}:${nonce}`)
    .digest("hex")
}

export function buildSignMessage({
  campaignId,
  walletAddress,
  nonce,
}: {
  campaignId: string
  walletAddress: string
  nonce: string
}) {
  return [
    "Tri-Proof Humanity Gate",
    `Campaign: ${campaignId}`,
    `Wallet: ${walletAddress}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n")
}

export async function ensureHumanityDemoCampaigns() {
  for (const campaign of defaultCampaigns) {
    await db.$executeRaw`
      INSERT INTO "HumanityCampaign" (
        "id", "name", "slug", "description", "challengeLevel", "humanityGateEnabled", "proofExpiresInDays", "maxAttemptsPerWallet", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid()::text, ${campaign.name}, ${campaign.slug}, ${campaign.description}, ${campaign.challengeLevel}, true, 30, 3, NOW(), NOW()
      )
      ON CONFLICT ("slug") DO NOTHING
    `
  }
}
