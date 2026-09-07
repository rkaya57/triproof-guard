import { createHash, createHmac, randomUUID } from "node:crypto"
import { jwtVerify, SignJWT } from "jose"

import {
  scoreTriProofCaptureIntegrity,
  type TriProofCaptureIntegrityEvidence,
  type TriProofCaptureIntegrityResult,
} from "./capture-integrity"
import { normalizeWalletAddress, type HumanityVerifiedAttestationInput } from "./core"

export type TriProofLightColor = "RED" | "GREEN" | "BLUE" | "WHITE"

export type TriProofLightPulse = {
  index: number
  color: TriProofLightColor
  displayMs: number
  settleMs: number
  intensity: number
}

export type TriProofLightChallenge = {
  engine: "TRIPROOF_LIVENESS_V2_2"
  frameWidth: 32
  frameHeight: 32
  pulses: TriProofLightPulse[]
}

export type TriProofRgbFrame = {
  capturedAtMs: number
  width: number
  height: number
  rgbBase64: string
}

export type TriProofPulseFrame = TriProofRgbFrame & {
  index: number
  color: TriProofLightColor
}

export type TriProofLivenessEvidence = {
  baseline: TriProofRgbFrame
  pulses: TriProofPulseFrame[]
  captureIntegrity?: TriProofCaptureIntegrityEvidence
}

export type TriProofLivenessResult = {
  verdict: "PASS" | "REVIEW" | "FAIL"
  engineVersion: "2.2"
  livenessScore: number
  antiSpoofScore: number
  chromaticResponseScore: number
  spatialResponseScore: number
  frameDiversityScore: number
  textureScore: number
  timingScore: number
  captureIntegrityScore: number
  temporalConsistencyScore: number
  replayRiskScore: number
  injectionRiskScore: number
  virtualCameraRiskScore: number
  frameInjectionRiskScore: number
  deepfakeHeuristicRiskScore: number
  reasonCodes: string[]
}

export type TriProofLivenessExpectation = {
  sessionId: string
  campaignId: string
  nonce: string
  walletAddress: string
  walletChain?: string | null
}

const TOKEN_ISSUER = "urn:triproof:humanity:liveness:v2.2"
const TOKEN_AUDIENCE = "urn:triproof:humanity:submit:v2"
const TOKEN_CLAIM = "https://triproofprotocol.com/humanity/v2/triproof-liveness"
const COLORS: TriProofLightColor[] = ["RED", "GREEN", "BLUE", "WHITE"]
const MAX_FRAME_BYTES = 32 * 32 * 3

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

function signingKey(secret: string) {
  return createHmac("sha256", secret)
    .update("triproof-humanity-v2:liveness-engine-v2.2:token-key")
    .digest()
}

function challengeDigest(nonce: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`triproof-humanity-v2:liveness-engine-v2.2:challenge:${nonce}`)
    .digest()
}

export function deriveTriProofLightChallenge(nonce: string, secret: string): TriProofLightChallenge {
  const digest = challengeDigest(nonce, secret)
  const pool = [...COLORS]
  const ordered: TriProofLightColor[] = []
  for (let index = 0; index < COLORS.length; index += 1) {
    const selected = digest[index] % pool.length
    ordered.push(pool.splice(selected, 1)[0])
  }

  return {
    engine: "TRIPROOF_LIVENESS_V2_2",
    frameWidth: 32,
    frameHeight: 32,
    pulses: ordered.map((color, index) => ({
      index,
      color,
      displayMs: 620 + (digest[8 + index] % 3) * 70,
      settleMs: 240 + (digest[12 + index] % 3) * 35,
      intensity: Number((0.62 + (digest[16 + index] % 12) / 100).toFixed(2)),
    })),
  }
}

function decodeFrame(frame: TriProofRgbFrame) {
  if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height)) throw new Error("Invalid liveness frame dimensions")
  if (frame.width !== 32 || frame.height !== 32) throw new Error("Tri-Proof Liveness V2.2 requires 32x32 RGB frames")
  if (!Number.isFinite(frame.capturedAtMs) || frame.capturedAtMs < 0) throw new Error("Invalid liveness frame timestamp")

  const bytes = Buffer.from(frame.rgbBase64, "base64")
  if (bytes.length !== frame.width * frame.height * 3 || bytes.length > MAX_FRAME_BYTES) {
    throw new Error("Invalid liveness RGB frame payload")
  }
  return new Uint8Array(bytes)
}

function frameStats(bytes: Uint8Array, width: number, height: number) {
  let r = 0
  let g = 0
  let b = 0
  let edge = 0
  const luma = new Float64Array(width * height)

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 3
    const red = bytes[offset]
    const green = bytes[offset + 1]
    const blue = bytes[offset + 2]
    r += red
    g += green
    b += blue
    luma[pixel] = red * 0.2126 + green * 0.7152 + blue * 0.0722
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (x > 0) edge += Math.abs(luma[index] - luma[index - 1])
      if (y > 0) edge += Math.abs(luma[index] - luma[index - width])
    }
  }

  const pixels = width * height
  return {
    r: r / pixels,
    g: g / pixels,
    b: b / pixels,
    luma: luma.reduce((sum, value) => sum + value, 0) / pixels,
    edge: edge / Math.max(1, pixels * 2 - width - height),
    hash: createHash("sha256").update(bytes).digest("hex"),
  }
}

function meanAbsoluteDifference(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return 0
  let total = 0
  for (let index = 0; index < a.length; index += 1) total += Math.abs(a[index] - b[index])
  return total / a.length
}

function pixelResponse(color: TriProofLightColor, baseline: Uint8Array, pulse: Uint8Array, offset: number) {
  const dr = pulse[offset] - baseline[offset]
  const dg = pulse[offset + 1] - baseline[offset + 1]
  const db = pulse[offset + 2] - baseline[offset + 2]
  if (color === "RED") return dr - (dg + db) / 2
  if (color === "GREEN") return dg - (dr + db) / 2
  if (color === "BLUE") return db - (dr + dg) / 2
  return dr * 0.2126 + dg * 0.7152 + db * 0.0722
}

function spatialResponseForColor(
  color: TriProofLightColor,
  baseline: Uint8Array,
  pulse: Uint8Array,
  width: number,
  height: number
) {
  const responses: number[] = []
  const center: number[] = []
  const border: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      const response = pixelResponse(color, baseline, pulse, offset)
      responses.push(response)
      const isCenter = x >= width * 0.25 && x < width * 0.75 && y >= height * 0.2 && y < height * 0.8
      ;(isCenter ? center : border).push(response)
    }
  }

  const mean = average(responses)
  const variance = average(responses.map((value) => (value - mean) ** 2))
  const standardDeviation = Math.sqrt(Math.max(0, variance))
  const centerBorderDifference = Math.abs(average(center) - average(border))
  const positiveRatio = responses.filter((value) => value > 2).length / Math.max(1, responses.length)
  return clamp(standardDeviation * 5.8 + centerBorderDifference * 4.5 + positiveRatio * 18)
}

function responseForColor(
  color: TriProofLightColor,
  baseline: ReturnType<typeof frameStats>,
  pulse: ReturnType<typeof frameStats>
) {
  const dr = pulse.r - baseline.r
  const dg = pulse.g - baseline.g
  const db = pulse.b - baseline.b
  const dl = pulse.luma - baseline.luma

  if (color === "RED") return dr - (dg + db) / 2
  if (color === "GREEN") return dg - (dr + db) / 2
  if (color === "BLUE") return db - (dr + dg) / 2
  return dl
}

function fallbackCaptureIntegrity(): TriProofCaptureIntegrityResult {
  return {
    captureIntegrityScore: 50,
    temporalConsistencyScore: 50,
    virtualCameraRiskScore: 35,
    frameInjectionRiskScore: 35,
    deepfakeHeuristicRiskScore: 25,
    observedFps: null,
    cadenceJitterRatio: null,
    visualDuplicateRatio: 0,
    detectedLoopPeriod: null,
    reasonCodes: ["CAPTURE_INTEGRITY_EVIDENCE_NOT_PROVIDED", "CAPTURE_INTEGRITY_V2_2_REVIEW_ONLY"],
  }
}

export function scoreTriProofLivenessEvidence({
  challenge,
  evidence,
}: {
  challenge: TriProofLightChallenge
  evidence: TriProofLivenessEvidence
}): TriProofLivenessResult {
  if (evidence.pulses.length !== challenge.pulses.length) throw new Error("Liveness pulse count does not match server challenge")

  const baselineBytes = decodeFrame(evidence.baseline)
  const baselineStats = frameStats(baselineBytes, evidence.baseline.width, evidence.baseline.height)
  const pulseBytes: Uint8Array[] = []
  const pulseStats: Array<ReturnType<typeof frameStats>> = []
  const reasonCodes: string[] = []
  let timingValid = true
  let previousTimestamp = evidence.baseline.capturedAtMs

  for (let index = 0; index < challenge.pulses.length; index += 1) {
    const expected = challenge.pulses[index]
    const observed = evidence.pulses[index]
    if (!observed || observed.index !== expected.index || observed.color !== expected.color) {
      throw new Error(`Liveness pulse ${index} does not match server-issued color order`)
    }
    const delta = observed.capturedAtMs - previousTimestamp
    if (delta < 120 || delta > 2_500) timingValid = false
    previousTimestamp = observed.capturedAtMs
    const bytes = decodeFrame(observed)
    pulseBytes.push(bytes)
    pulseStats.push(frameStats(bytes, observed.width, observed.height))
  }

  const responseScores = challenge.pulses.map((pulse, index) => {
    const response = responseForColor(pulse.color, baselineStats, pulseStats[index])
    return clamp(48 + response * (pulse.color === "WHITE" ? 3.2 : 4.4))
  })
  const chromaticResponseScore = clamp(average(responseScores))

  const spatialScores = challenge.pulses.map((pulse, index) =>
    spatialResponseForColor(pulse.color, baselineBytes, pulseBytes[index], evidence.baseline.width, evidence.baseline.height)
  )
  const spatialResponseScore = clamp(average(spatialScores))

  const differences = pulseBytes.map((bytes) => meanAbsoluteDifference(baselineBytes, bytes))
  const interPulseDifferences = pulseBytes.slice(1).map((bytes, index) => meanAbsoluteDifference(pulseBytes[index], bytes))
  const meanDifference = [...differences, ...interPulseDifferences].reduce((sum, value) => sum + value, 0) /
    Math.max(1, differences.length + interPulseDifferences.length)
  const frameDiversityScore = clamp(meanDifference * 5.5)

  const meanEdge = [baselineStats, ...pulseStats].reduce((sum, item) => sum + item.edge, 0) / (pulseStats.length + 1)
  const edgeDeviation = [baselineStats, ...pulseStats].reduce((sum, item) => sum + Math.abs(item.edge - meanEdge), 0) / (pulseStats.length + 1)
  const textureScore = clamp(meanEdge * 7 - edgeDeviation * 1.8 + 20)
  const timingScore = timingValid ? 100 : 25

  const hashes = [baselineStats.hash, ...pulseStats.map((item) => item.hash)]
  const duplicateFrames = hashes.length - new Set(hashes).size
  const opticalReplayRisk = clamp(
    duplicateFrames > 0
      ? 94
      : 86 - frameDiversityScore * 0.52 - chromaticResponseScore * 0.28 - Math.min(18, textureScore * 0.12)
  )
  const uniformDigitalTint = chromaticResponseScore >= 58 && spatialResponseScore <= 22
  const opticalInjectionRisk = clamp(
    !timingValid
      ? 86
      : uniformDigitalTint
        ? 84
        : frameDiversityScore < 18
          ? 78
          : chromaticResponseScore < 45
            ? 68
            : 18
  )

  const captureIntegrity = evidence.captureIntegrity
    ? scoreTriProofCaptureIntegrity(evidence.captureIntegrity)
    : fallbackCaptureIntegrity()

  const replayRiskScore = clamp(Math.max(
    opticalReplayRisk,
    captureIntegrity.virtualCameraRiskScore * 0.72 + captureIntegrity.deepfakeHeuristicRiskScore * 0.18
  ))
  const injectionRiskScore = clamp(Math.max(
    opticalInjectionRisk,
    captureIntegrity.frameInjectionRiskScore
  ))

  const livenessScore = clamp(
    chromaticResponseScore * 0.32 +
    spatialResponseScore * 0.10 +
    frameDiversityScore * 0.18 +
    textureScore * 0.12 +
    timingScore * 0.10 +
    captureIntegrity.captureIntegrityScore * 0.12 +
    captureIntegrity.temporalConsistencyScore * 0.06
  )
  const antiSpoofScore = clamp(
    100 -
    replayRiskScore * 0.4 -
    injectionRiskScore * 0.35 -
    captureIntegrity.virtualCameraRiskScore * 0.15 -
    captureIntegrity.deepfakeHeuristicRiskScore * 0.10
  )

  if (chromaticResponseScore < 45) reasonCodes.push("ACTIVE_LIGHT_RESPONSE_WEAK")
  if (spatialResponseScore < 24) reasonCodes.push("ACTIVE_LIGHT_SPATIAL_RESPONSE_WEAK")
  if (uniformDigitalTint) reasonCodes.push("UNIFORM_DIGITAL_TINT_PATTERN")
  if (frameDiversityScore < 25) reasonCodes.push("FRAME_DIVERSITY_WEAK")
  if (textureScore < 25) reasonCodes.push("TEXTURE_SIGNAL_WEAK")
  if (!timingValid) reasonCodes.push("ACTIVE_LIGHT_TIMING_ANOMALY")
  if (duplicateFrames > 0) reasonCodes.push("DUPLICATE_FRAME_REPLAY_PATTERN")
  if (replayRiskScore >= 70) reasonCodes.push("TRIPROOF_REPLAY_RISK_HIGH")
  if (injectionRiskScore >= 70) reasonCodes.push("TRIPROOF_INJECTION_RISK_HIGH")
  reasonCodes.push(...captureIntegrity.reasonCodes)

  let verdict: TriProofLivenessResult["verdict"] = "FAIL"
  if (
    timingValid &&
    chromaticResponseScore >= 58 &&
    spatialResponseScore >= 24 &&
    frameDiversityScore >= 32 &&
    textureScore >= 25 &&
    captureIntegrity.captureIntegrityScore >= 58 &&
    captureIntegrity.temporalConsistencyScore >= 55 &&
    captureIntegrity.virtualCameraRiskScore < 70 &&
    captureIntegrity.frameInjectionRiskScore < 70 &&
    captureIntegrity.deepfakeHeuristicRiskScore < 75 &&
    livenessScore >= 62 &&
    antiSpoofScore >= 56
  ) {
    verdict = "PASS"
    reasonCodes.push("TRIPROOF_LIVENESS_V2_2_PASS")
  } else if (livenessScore >= 48 && antiSpoofScore >= 38) {
    verdict = "REVIEW"
    reasonCodes.push("TRIPROOF_LIVENESS_V2_2_REVIEW")
  } else {
    reasonCodes.push("TRIPROOF_LIVENESS_V2_2_FAIL")
  }

  return {
    verdict,
    engineVersion: "2.2",
    livenessScore,
    antiSpoofScore,
    chromaticResponseScore,
    spatialResponseScore,
    frameDiversityScore,
    textureScore,
    timingScore,
    captureIntegrityScore: captureIntegrity.captureIntegrityScore,
    temporalConsistencyScore: captureIntegrity.temporalConsistencyScore,
    replayRiskScore,
    injectionRiskScore,
    virtualCameraRiskScore: captureIntegrity.virtualCameraRiskScore,
    frameInjectionRiskScore: captureIntegrity.frameInjectionRiskScore,
    deepfakeHeuristicRiskScore: captureIntegrity.deepfakeHeuristicRiskScore,
    reasonCodes,
  }
}

export async function issueTriProofLivenessToken({
  result,
  expected,
  secret,
}: {
  result: TriProofLivenessResult
  expected: TriProofLivenessExpectation
  secret: string
}) {
  if (result.verdict !== "PASS") throw new Error("Tri-Proof liveness token can only be issued for PASS evidence")
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    [TOKEN_CLAIM]: {
      ...expected,
      walletAddress: normalizeWalletAddress(expected.walletAddress, expected.walletChain),
      engineVersion: result.engineVersion,
      verdict: result.verdict,
      livenessScore: result.livenessScore,
      antiSpoofScore: result.antiSpoofScore,
      captureIntegrityScore: result.captureIntegrityScore,
      temporalConsistencyScore: result.temporalConsistencyScore,
      virtualCameraRiskScore: result.virtualCameraRiskScore,
      frameInjectionRiskScore: result.frameInjectionRiskScore,
      deepfakeHeuristicRiskScore: result.deepfakeHeuristicRiskScore,
      replayRiskScore: result.replayRiskScore,
      injectionRiskScore: result.injectionRiskScore,
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .setJti(randomUUID())
    .sign(signingKey(secret))
}

export async function verifyTriProofLivenessToken({
  token,
  expected,
  secret,
}: {
  token: string
  expected: TriProofLivenessExpectation
  secret: string
}): Promise<HumanityVerifiedAttestationInput & { approvalEligible: false }> {
  const { payload } = await jwtVerify(token, signingKey(secret), {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
    algorithms: ["HS256"],
    clockTolerance: 5,
  })

  const claim = payload[TOKEN_CLAIM]
  if (!claim || typeof claim !== "object") throw new Error("Tri-Proof liveness token claim is missing")
  const value = claim as Record<string, unknown>
  const expectedWallet = normalizeWalletAddress(expected.walletAddress, expected.walletChain)
  const claimedWallet = normalizeWalletAddress(String(value.walletAddress ?? ""), String(value.walletChain ?? expected.walletChain ?? ""))

  if (value.sessionId !== expected.sessionId) throw new Error("Tri-Proof liveness token session mismatch")
  if (value.campaignId !== expected.campaignId) throw new Error("Tri-Proof liveness token campaign mismatch")
  if (value.nonce !== expected.nonce) throw new Error("Tri-Proof liveness token nonce mismatch")
  if (claimedWallet !== expectedWallet) throw new Error("Tri-Proof liveness token wallet mismatch")
  if (value.verdict !== "PASS") throw new Error("Tri-Proof liveness token did not pass")
  if (value.engineVersion !== "2.2") throw new Error("Tri-Proof liveness token engine version mismatch")

  const livenessScore = Number(value.livenessScore)
  const antiSpoofScore = Number(value.antiSpoofScore)
  const captureIntegrityScore = Number(value.captureIntegrityScore)
  const virtualCameraRiskScore = Number(value.virtualCameraRiskScore)
  const frameInjectionRiskScore = Number(value.frameInjectionRiskScore)
  const deepfakeHeuristicRiskScore = Number(value.deepfakeHeuristicRiskScore)
  if (
    !Number.isFinite(livenessScore) ||
    !Number.isFinite(antiSpoofScore) ||
    !Number.isFinite(captureIntegrityScore) ||
    !Number.isFinite(virtualCameraRiskScore) ||
    !Number.isFinite(frameInjectionRiskScore) ||
    !Number.isFinite(deepfakeHeuristicRiskScore)
  ) {
    throw new Error("Tri-Proof liveness token scores are invalid")
  }

  return {
    verified: true,
    passed: true,
    livenessScore: clamp(livenessScore),
    antiSpoofScore: clamp(antiSpoofScore),
    issuer: TOKEN_ISSUER,
    jtiHash: createHash("sha256").update(`${TOKEN_ISSUER}:${String(payload.jti ?? "")}`).digest("hex").slice(0, 24),
    approvalEligible: false,
    engineVersion: "2.2",
    captureIntegrityScore: clamp(captureIntegrityScore),
    virtualCameraRiskScore: clamp(virtualCameraRiskScore),
    frameInjectionRiskScore: clamp(frameInjectionRiskScore),
    deepfakeHeuristicRiskScore: clamp(deepfakeHeuristicRiskScore),
  }
}

export { TOKEN_AUDIENCE as TRIPROOF_LIVENESS_AUDIENCE, TOKEN_ISSUER as TRIPROOF_LIVENESS_ISSUER }
