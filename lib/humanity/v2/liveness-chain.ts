import { createHash, createHmac, randomUUID } from "node:crypto"
import { jwtVerify, SignJWT } from "jose"

import { normalizeWalletAddress, type HumanityVerifiedAttestationInput } from "./core"
import type {
  TriProofLightPulse,
  TriProofLivenessResult,
  TriProofPulseFrame,
  TriProofRgbFrame,
} from "./liveness-engine"

const CHAIN_ISSUER = "urn:triproof:humanity:liveness-chain:v2.4"
const CHAIN_AUDIENCE = "urn:triproof:humanity:liveness-chain-step:v2.4"
const CHAIN_CLAIM = "https://triproofprotocol.com/humanity/v2/liveness-chain"
const FINAL_ISSUER = "urn:triproof:humanity:liveness:v2.4"
const FINAL_AUDIENCE = "urn:triproof:humanity:submit:v2"
const FINAL_CLAIM = "https://triproofprotocol.com/humanity/v2/triproof-liveness-v2.4"
const MAX_CHAIN_TOKEN_LENGTH = 64_000
const MAX_CHAIN_AGE_MS = 2 * 60 * 1000

export type TriProofLivenessChainExpectation = {
  sessionId: string
  campaignId: string
  nonce: string
  walletAddress: string
  walletChain?: string | null
}

export type TriProofLivenessChainState = TriProofLivenessChainExpectation & {
  chainId: string
  nextPulseIndex: number
  stateVersionMs: number
  serverIssuedAtMs: number
  baseline: TriProofRgbFrame
  pulses: TriProofPulseFrame[]
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function chainSigningKey(secret: string) {
  return createHmac("sha256", secret)
    .update("triproof-humanity-v2:liveness-chain-v2.4:state-key")
    .digest()
}

function finalSigningKey(secret: string) {
  return createHmac("sha256", secret)
    .update("triproof-humanity-v2:liveness-chain-v2.4:final-attestation-key")
    .digest()
}

function assertFrameShape(frame: TriProofRgbFrame) {
  if (!frame || typeof frame !== "object") throw new Error("V2.4 chain frame is missing")
  if (frame.width !== 32 || frame.height !== 32) throw new Error("V2.4 chain frame dimensions must be 32x32")
  if (!Number.isFinite(frame.capturedAtMs) || frame.capturedAtMs < 0 || frame.capturedAtMs > 120_000) {
    throw new Error("V2.4 chain frame timestamp is invalid")
  }
  const bytes = Buffer.from(frame.rgbBase64, "base64")
  if (bytes.length !== 32 * 32 * 3) throw new Error("V2.4 chain RGB frame payload is invalid")
}

function normalizeState(state: TriProofLivenessChainState): TriProofLivenessChainState {
  assertFrameShape(state.baseline)
  for (const pulse of state.pulses) assertFrameShape(pulse)
  if (!Number.isInteger(state.nextPulseIndex) || state.nextPulseIndex < 0 || state.nextPulseIndex > 4) {
    throw new Error("V2.4 chain next pulse index is invalid")
  }
  if (state.pulses.length !== state.nextPulseIndex) throw new Error("V2.4 chain pulse state is inconsistent")
  if (!Number.isFinite(state.stateVersionMs) || state.stateVersionMs <= 0) throw new Error("V2.4 chain state version is invalid")
  if (!Number.isFinite(state.serverIssuedAtMs) || state.serverIssuedAtMs <= 0) throw new Error("V2.4 chain issue time is invalid")

  return {
    ...state,
    walletAddress: normalizeWalletAddress(state.walletAddress, state.walletChain),
  }
}

export function createTriProofLivenessChainId() {
  return randomUUID()
}

export async function issueTriProofLivenessChainState({
  state,
  secret,
}: {
  state: TriProofLivenessChainState
  secret: string
}) {
  const normalized = normalizeState(state)
  const now = Math.floor(Date.now() / 1000)
  const token = await new SignJWT({ [CHAIN_CLAIM]: normalized })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(CHAIN_ISSUER)
    .setAudience(CHAIN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + Math.ceil(MAX_CHAIN_AGE_MS / 1000))
    .setJti(randomUUID())
    .sign(chainSigningKey(secret))

  if (token.length > MAX_CHAIN_TOKEN_LENGTH) throw new Error("V2.4 chain state token exceeds size policy")
  return token
}

export async function verifyTriProofLivenessChainState({
  token,
  secret,
}: {
  token: string
  secret: string
}) {
  if (typeof token !== "string" || token.length < 64 || token.length > MAX_CHAIN_TOKEN_LENGTH) {
    throw new Error("V2.4 chain state token size is invalid")
  }

  const { payload } = await jwtVerify(token, chainSigningKey(secret), {
    issuer: CHAIN_ISSUER,
    audience: CHAIN_AUDIENCE,
    algorithms: ["HS256"],
    clockTolerance: 5,
  })
  const claim = payload[CHAIN_CLAIM]
  if (!claim || typeof claim !== "object") throw new Error("V2.4 chain state claim is missing")
  const value = claim as Record<string, unknown>

  const state = normalizeState({
    sessionId: String(value.sessionId ?? ""),
    campaignId: String(value.campaignId ?? ""),
    nonce: String(value.nonce ?? ""),
    walletAddress: String(value.walletAddress ?? ""),
    walletChain: value.walletChain === null || value.walletChain === undefined ? null : String(value.walletChain),
    chainId: String(value.chainId ?? ""),
    nextPulseIndex: Number(value.nextPulseIndex),
    stateVersionMs: Number(value.stateVersionMs),
    serverIssuedAtMs: Number(value.serverIssuedAtMs),
    baseline: value.baseline as TriProofRgbFrame,
    pulses: Array.isArray(value.pulses) ? value.pulses as TriProofPulseFrame[] : [],
  })

  if (!state.sessionId || !state.campaignId || !state.nonce || !state.walletAddress || !state.chainId) {
    throw new Error("V2.4 chain state binding is incomplete")
  }
  if (Date.now() - state.serverIssuedAtMs > MAX_CHAIN_AGE_MS + 5_000) throw new Error("V2.4 chain state is stale")
  return state
}

export function assertTriProofLivenessChainBinding(
  state: TriProofLivenessChainState,
  expected: TriProofLivenessChainExpectation
) {
  const expectedWallet = normalizeWalletAddress(expected.walletAddress, expected.walletChain)
  const stateWallet = normalizeWalletAddress(state.walletAddress, state.walletChain)
  if (state.sessionId !== expected.sessionId) throw new Error("V2.4 chain session mismatch")
  if (state.campaignId !== expected.campaignId) throw new Error("V2.4 chain campaign mismatch")
  if (state.nonce !== expected.nonce) throw new Error("V2.4 chain nonce mismatch")
  if (stateWallet !== expectedWallet) throw new Error("V2.4 chain wallet mismatch")
}

export function hashTriProofLivenessChainToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function getTriProofServerPulseTimingWindow(pulse: TriProofLightPulse) {
  return {
    minElapsedMs: Math.max(120, pulse.settleMs - 90),
    maxElapsedMs: pulse.displayMs + 4_000,
  }
}

export function validateTriProofServerPulseTiming({
  pulse,
  serverIssuedAtMs,
  receivedAtMs,
}: {
  pulse: TriProofLightPulse
  serverIssuedAtMs: number
  receivedAtMs: number
}) {
  const elapsedMs = receivedAtMs - serverIssuedAtMs
  const window = getTriProofServerPulseTimingWindow(pulse)
  return {
    ok: Number.isFinite(elapsedMs) && elapsedMs >= window.minElapsedMs && elapsedMs <= window.maxElapsedMs,
    elapsedMs,
    ...window,
  }
}

export async function issueTriProofLivenessV24Token({
  result,
  expected,
  chainId,
  secret,
}: {
  result: TriProofLivenessResult
  expected: TriProofLivenessChainExpectation
  chainId: string
  secret: string
}) {
  if (result.verdict !== "PASS") throw new Error("V2.4 final attestation requires PASS evidence")
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    [FINAL_CLAIM]: {
      ...expected,
      walletAddress: normalizeWalletAddress(expected.walletAddress, expected.walletChain),
      engineVersion: "2.4",
      scoringEngineVersion: result.engineVersion,
      serverChainVerified: true,
      chainIdHash: createHash("sha256").update(chainId).digest("hex").slice(0, 24),
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
    .setIssuer(FINAL_ISSUER)
    .setAudience(FINAL_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .setJti(randomUUID())
    .sign(finalSigningKey(secret))
}

export async function verifyTriProofLivenessV24Token({
  token,
  expected,
  secret,
}: {
  token: string
  expected: TriProofLivenessChainExpectation
  secret: string
}): Promise<HumanityVerifiedAttestationInput & { approvalEligible: false }> {
  const { payload } = await jwtVerify(token, finalSigningKey(secret), {
    issuer: FINAL_ISSUER,
    audience: FINAL_AUDIENCE,
    algorithms: ["HS256"],
    clockTolerance: 5,
  })
  const claim = payload[FINAL_CLAIM]
  if (!claim || typeof claim !== "object") throw new Error("V2.4 final liveness claim is missing")
  const value = claim as Record<string, unknown>
  const expectedWallet = normalizeWalletAddress(expected.walletAddress, expected.walletChain)
  const claimedWallet = normalizeWalletAddress(String(value.walletAddress ?? ""), String(value.walletChain ?? expected.walletChain ?? ""))

  if (value.sessionId !== expected.sessionId) throw new Error("V2.4 liveness token session mismatch")
  if (value.campaignId !== expected.campaignId) throw new Error("V2.4 liveness token campaign mismatch")
  if (value.nonce !== expected.nonce) throw new Error("V2.4 liveness token nonce mismatch")
  if (claimedWallet !== expectedWallet) throw new Error("V2.4 liveness token wallet mismatch")
  if (value.engineVersion !== "2.4" || value.serverChainVerified !== true) throw new Error("V2.4 server chain verification is missing")
  if (value.verdict !== "PASS") throw new Error("V2.4 liveness token did not pass")

  const livenessScore = Number(value.livenessScore)
  const antiSpoofScore = Number(value.antiSpoofScore)
  const captureIntegrityScore = Number(value.captureIntegrityScore)
  const virtualCameraRiskScore = Number(value.virtualCameraRiskScore)
  const frameInjectionRiskScore = Number(value.frameInjectionRiskScore)
  const deepfakeHeuristicRiskScore = Number(value.deepfakeHeuristicRiskScore)
  if ([
    livenessScore,
    antiSpoofScore,
    captureIntegrityScore,
    virtualCameraRiskScore,
    frameInjectionRiskScore,
    deepfakeHeuristicRiskScore,
  ].some((item) => !Number.isFinite(item))) {
    throw new Error("V2.4 liveness token scores are invalid")
  }

  return {
    verified: true,
    passed: true,
    livenessScore: clamp(livenessScore),
    antiSpoofScore: clamp(antiSpoofScore),
    issuer: FINAL_ISSUER,
    jtiHash: createHash("sha256").update(`${FINAL_ISSUER}:${String(payload.jti ?? "")}`).digest("hex").slice(0, 24),
    approvalEligible: false,
    engineVersion: "2.4",
    captureIntegrityScore: clamp(captureIntegrityScore),
    virtualCameraRiskScore: clamp(virtualCameraRiskScore),
    frameInjectionRiskScore: clamp(frameInjectionRiskScore),
    deepfakeHeuristicRiskScore: clamp(deepfakeHeuristicRiskScore),
  }
}

export {
  CHAIN_AUDIENCE as TRIPROOF_LIVENESS_CHAIN_AUDIENCE,
  CHAIN_ISSUER as TRIPROOF_LIVENESS_CHAIN_ISSUER,
  FINAL_ISSUER as TRIPROOF_LIVENESS_V24_ISSUER,
}
