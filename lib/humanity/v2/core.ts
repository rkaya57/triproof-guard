import { createHmac, randomInt } from "node:crypto"

export type HumanityChallengeLevel = "BASIC" | "STANDARD" | "STRICT"
export type HumanityDecision = "APPROVED" | "MANUAL_REVIEW" | "REJECTED"
export type HumanityChallengeStep =
  | "LOOK_CENTER"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "BLINK"
  | "RAISE_HAND"
  | "SMILE"

export type HumanityTelemetryInput = {
  facePresenceScore?: number
  headPoseScore?: number
  eyeBlinkScore?: number
  handGestureScore?: number
  motionTimingScore?: number
  frameConsistencyScore?: number
  replayRiskScore?: number
  injectionRiskScore?: number
}

export type HumanityStepEvidence = {
  step: HumanityChallengeStep
  capturedAtMs: number
  heldForMs: number
}

export type HumanityVerifiedAttestationInput = {
  verified: true
  passed: boolean
  livenessScore: number
  antiSpoofScore: number
  issuer: string
  jtiHash: string
}

const REQUIRED_CLIENT_REASON = "CLIENT_TELEMETRY_UNATTESTED"

function clampScore(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function shuffled<T>(items: readonly T[]) {
  const output = [...items]
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[output[index], output[swapIndex]] = [output[swapIndex], output[index]]
  }
  return output
}

export function normalizeWalletAddress(walletAddress: string, walletChain?: string | null) {
  const clean = walletAddress.trim()
  const chain = (walletChain ?? "").trim().toLowerCase()
  if (chain === "evm" || chain === "ethereum" || clean.startsWith("0x")) return clean.toLowerCase()
  return clean
}

export function generateChallengeSequence(level: HumanityChallengeLevel): HumanityChallengeStep[] {
  if (level === "BASIC") {
    return ["LOOK_CENTER", shuffled(["TURN_LEFT", "TURN_RIGHT"] as const)[0], "BLINK"]
  }

  if (level === "STRICT") {
    return ["LOOK_CENTER", ...shuffled(["TURN_LEFT", "TURN_RIGHT", "BLINK", "RAISE_HAND", "SMILE"] as const)]
  }

  return ["LOOK_CENTER", ...shuffled(["TURN_LEFT", "TURN_RIGHT", "BLINK"] as const)]
}

export function validateStepEvidence(
  challengeSequence: HumanityChallengeStep[],
  evidence: HumanityStepEvidence[]
) {
  const reasonCodes: string[] = []

  if (evidence.length !== challengeSequence.length) {
    return { ok: false, reasonCodes: ["CHALLENGE_STEP_COUNT_MISMATCH"] }
  }

  let previousTimestamp = -1
  for (let index = 0; index < challengeSequence.length; index += 1) {
    const expected = challengeSequence[index]
    const observed = evidence[index]
    if (!observed || observed.step !== expected) reasonCodes.push(`STEP_ORDER_MISMATCH:${expected}`)
    if (!Number.isFinite(observed?.capturedAtMs) || observed.capturedAtMs <= previousTimestamp) {
      reasonCodes.push(`NON_MONOTONIC_STEP_TIME:${expected}`)
    }
    if (!Number.isFinite(observed?.heldForMs) || observed.heldForMs < 250 || observed.heldForMs > 12_000) {
      reasonCodes.push(`INVALID_STEP_HOLD:${expected}`)
    }
    previousTimestamp = observed?.capturedAtMs ?? previousTimestamp
  }

  return { ok: reasonCodes.length === 0, reasonCodes }
}

export function computeClientTelemetryDecision(scores: HumanityTelemetryInput) {
  const normalized = {
    facePresenceScore: clampScore(scores.facePresenceScore),
    headPoseScore: clampScore(scores.headPoseScore),
    eyeBlinkScore: clampScore(scores.eyeBlinkScore),
    handGestureScore: clampScore(scores.handGestureScore),
    motionTimingScore: clampScore(scores.motionTimingScore),
    frameConsistencyScore: clampScore(scores.frameConsistencyScore),
    replayRiskScore: clampScore(scores.replayRiskScore),
    injectionRiskScore: clampScore(scores.injectionRiskScore),
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

  const reasonCodes = [REQUIRED_CLIENT_REASON]
  if (normalized.facePresenceScore < 55) reasonCodes.push("LOW_FACE_PRESENCE")
  if (normalized.headPoseScore < 50) reasonCodes.push("HEAD_POSE_WEAK")
  if (normalized.eyeBlinkScore < 45) reasonCodes.push("BLINK_SIGNAL_WEAK")
  if (normalized.motionTimingScore < 45) reasonCodes.push("MOTION_TIMING_WEAK")
  if (normalized.frameConsistencyScore < 50) reasonCodes.push("FRAME_CONSISTENCY_WEAK")
  if (normalized.replayRiskScore >= 70) reasonCodes.push("SCREEN_REPLAY_RISK")
  if (normalized.injectionRiskScore >= 70) reasonCodes.push("INJECTION_RISK")

  let decision: HumanityDecision = "MANUAL_REVIEW"
  if (
    humanSessionScore < 50 ||
    normalized.facePresenceScore < 35 ||
    normalized.replayRiskScore >= 85 ||
    normalized.injectionRiskScore >= 85
  ) {
    decision = "REJECTED"
    reasonCodes.push("HUMANITY_REJECTED")
  } else {
    reasonCodes.push("SERVER_ATTESTATION_REQUIRED_FOR_APPROVAL")
    reasonCodes.push("MANUAL_REVIEW_REQUIRED")
  }

  return { normalized, humanSessionScore, decision, reasonCodes }
}

export function computeHumanityDecision(
  scores: HumanityTelemetryInput,
  attestation?: HumanityVerifiedAttestationInput | null
) {
  const client = computeClientTelemetryDecision(scores)
  if (client.decision === "REJECTED" || !attestation?.verified || !attestation.passed) return client

  const livenessScore = clampScore(attestation.livenessScore)
  const antiSpoofScore = clampScore(attestation.antiSpoofScore)
  const attestationReason = `SERVER_VERIFIED_PROVIDER_ATTESTATION:${attestation.jtiHash}`

  const clientCanCorroborate =
    client.humanSessionScore >= 65 &&
    client.normalized.facePresenceScore >= 55 &&
    client.normalized.frameConsistencyScore >= 50 &&
    client.normalized.replayRiskScore < 70 &&
    client.normalized.injectionRiskScore < 70

  if (livenessScore < 80 || antiSpoofScore < 80 || !clientCanCorroborate) {
    return {
      ...client,
      reasonCodes: [
        ...client.reasonCodes,
        attestationReason,
        "PROVIDER_ATTESTATION_PRESENT_CLIENT_RISK_REVIEW_REQUIRED",
      ],
    }
  }

  const humanSessionScore = Math.max(
    0,
    Math.min(100, Math.round(client.humanSessionScore * 0.4 + livenessScore * 0.3 + antiSpoofScore * 0.3))
  )
  const reasonCodes = client.reasonCodes.filter(
    (code) =>
      code !== REQUIRED_CLIENT_REASON &&
      code !== "SERVER_ATTESTATION_REQUIRED_FOR_APPROVAL" &&
      code !== "MANUAL_REVIEW_REQUIRED"
  )
  reasonCodes.push(attestationReason)
  reasonCodes.push(`ATTESTATION_ISSUER:${attestation.issuer}`)
  reasonCodes.push("CLIENT_TELEMETRY_CORROBORATED_BY_PROVIDER")
  reasonCodes.push("HUMANITY_APPROVED_WITH_PROVIDER_ATTESTATION")

  return {
    normalized: client.normalized,
    humanSessionScore,
    decision: "APPROVED" as HumanityDecision,
    reasonCodes,
  }
}

export function buildNullifierHash({
  secret,
  campaignId,
  walletAddress,
  walletChain,
}: {
  secret: string
  campaignId: string
  walletAddress: string
  walletChain?: string | null
}) {
  const normalizedWallet = normalizeWalletAddress(walletAddress, walletChain)
  const normalizedChain = (walletChain ?? "unknown").trim().toLowerCase() || "unknown"
  return createHmac("sha256", secret)
    .update(`triproof-humanity-v2:${campaignId}:${normalizedChain}:${normalizedWallet}`)
    .digest("hex")
}

export function buildProofMessage({
  campaignId,
  verificationId,
  walletAddress,
  walletChain,
  nonce,
  decision,
  proofExpiresAt,
}: {
  campaignId: string
  verificationId: string
  walletAddress: string
  walletChain?: string | null
  nonce: string
  decision: HumanityDecision
  proofExpiresAt: Date | string
}) {
  const normalizedWallet = normalizeWalletAddress(walletAddress, walletChain)
  const normalizedChain = (walletChain ?? "unknown").trim().toLowerCase() || "unknown"
  const expiry = proofExpiresAt instanceof Date ? proofExpiresAt.toISOString() : new Date(proofExpiresAt).toISOString()

  return [
    "Tri-Proof Humanity V2",
    "Version: 2",
    `Campaign: ${campaignId}`,
    `Verification: ${verificationId}`,
    `Wallet Chain: ${normalizedChain}`,
    `Wallet: ${normalizedWallet}`,
    `Nonce: ${nonce}`,
    `Decision: ${decision}`,
    `Proof Expires At: ${expiry}`,
  ].join("\n")
}
