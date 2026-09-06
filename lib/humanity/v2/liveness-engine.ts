import { createHash, createHmac, randomUUID } from "node:crypto"
import { jwtVerify, SignJWT } from "jose"

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
  engine: "TRIPROOF_LIVENESS_V1"
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
}

export type TriProofLivenessResult = {
  verdict: "PASS" | "REVIEW" | "FAIL"
  livenessScore: number
  antiSpoofScore: number
  chromaticResponseScore: number
  frameDiversityScore: number
  textureScore: number
  timingScore: number
  replayRiskScore: number
  injectionRiskScore: number
  reasonCodes: string[]
}

export type TriProofLivenessExpectation = {
  sessionId: string
  campaignId: string
  nonce: string
  walletAddress: string
  walletChain?: string | null
}

const TOKEN_ISSUER = "urn:triproof:humanity:liveness:v1"
const TOKEN_AUDIENCE = "urn:triproof:humanity:submit:v2"
const TOKEN_CLAIM = "https://triproofprotocol.com/humanity/v2/triproof-liveness"
const COLORS: TriProofLightColor[] = ["RED", "GREEN", "BLUE", "WHITE"]
const MAX_FRAME_BYTES = 32 * 32 * 3

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function signingKey(secret: string) {
  return createHmac("sha256", secret)
    .update("triproof-humanity-v2:liveness-engine-v1:token-key")
    .digest()
}

function challengeDigest(nonce: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`triproof-humanity-v2:liveness-engine-v1:challenge:${nonce}`)
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
    engine: "TRIPROOF_LIVENESS_V1",
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
  if (frame.width !== 32 || frame.height !== 32) throw new Error("Tri-Proof Liveness V1 requires 32x32 RGB frames")
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
  const chromaticResponseScore = clamp(responseScores.reduce((sum, value) => sum + value, 0) / responseScores.length)

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
  const replayRiskScore = clamp(
    duplicateFrames > 0
      ? 94
      : 86 - frameDiversityScore * 0.52 - chromaticResponseScore * 0.28 - Math.min(18, textureScore * 0.12)
  )
  const injectionRiskScore = clamp(
    !timingValid
      ? 86
      : frameDiversityScore < 18
        ? 78
        : chromaticResponseScore < 45
          ? 68
          : 18
  )

  const livenessScore = clamp(
    chromaticResponseScore * 0.45 +
    frameDiversityScore * 0.25 +
    textureScore * 0.15 +
    timingScore * 0.15
  )
  const antiSpoofScore = clamp(100 - replayRiskScore * 0.55 - injectionRiskScore * 0.45)

  if (chromaticResponseScore < 45) reasonCodes.push("ACTIVE_LIGHT_RESPONSE_WEAK")
  if (frameDiversityScore < 25) reasonCodes.push("FRAME_DIVERSITY_WEAK")
  if (textureScore < 25) reasonCodes.push("TEXTURE_SIGNAL_WEAK")
  if (!timingValid) reasonCodes.push("ACTIVE_LIGHT_TIMING_ANOMALY")
  if (duplicateFrames > 0) reasonCodes.push("DUPLICATE_FRAME_REPLAY_PATTERN")
  if (replayRiskScore >= 70) reasonCodes.push("TRIPROOF_REPLAY_RISK_HIGH")
  if (injectionRiskScore >= 70) reasonCodes.push("TRIPROOF_INJECTION_RISK_HIGH")

  let verdict: TriProofLivenessResult["verdict"] = "FAIL"
  if (
    timingValid &&
    chromaticResponseScore >= 58 &&
    frameDiversityScore >= 32 &&
    textureScore >= 25 &&
    livenessScore >= 64 &&
    antiSpoofScore >= 58
  ) {
    verdict = "PASS"
    reasonCodes.push("TRIPROOF_LIVENESS_V1_PASS")
  } else if (livenessScore >= 50 && antiSpoofScore >= 42) {
    verdict = "REVIEW"
    reasonCodes.push("TRIPROOF_LIVENESS_V1_REVIEW")
  } else {
    reasonCodes.push("TRIPROOF_LIVENESS_V1_FAIL")
  }

  return {
    verdict,
    livenessScore,
    antiSpoofScore,
    chromaticResponseScore,
    frameDiversityScore,
    textureScore,
    timingScore,
    replayRiskScore,
    injectionRiskScore,
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
      engineVersion: "1.0",
      verdict: result.verdict,
      livenessScore: result.livenessScore,
      antiSpoofScore: result.antiSpoofScore,
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

  const livenessScore = Number(value.livenessScore)
  const antiSpoofScore = Number(value.antiSpoofScore)
  if (!Number.isFinite(livenessScore) || !Number.isFinite(antiSpoofScore)) throw new Error("Tri-Proof liveness token scores are invalid")

  return {
    verified: true,
    passed: true,
    livenessScore: clamp(livenessScore),
    antiSpoofScore: clamp(antiSpoofScore),
    issuer: TOKEN_ISSUER,
    jtiHash: createHash("sha256").update(`${TOKEN_ISSUER}:${String(payload.jti ?? "")}`).digest("hex").slice(0, 24),
    approvalEligible: false,
  }
}

export { TOKEN_AUDIENCE as TRIPROOF_LIVENESS_AUDIENCE, TOKEN_ISSUER as TRIPROOF_LIVENESS_ISSUER }
