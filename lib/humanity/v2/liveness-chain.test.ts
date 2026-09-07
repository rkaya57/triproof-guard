import assert from "node:assert/strict"
import test from "node:test"

import { computeHumanityDecision } from "@/lib/humanity/v2/core"
import {
  assertTriProofLivenessChainBinding,
  getTriProofServerPulseTimingWindow,
  issueTriProofLivenessChainState,
  issueTriProofLivenessV24Token,
  validateTriProofServerPulseTiming,
  verifyTriProofLivenessChainState,
  verifyTriProofLivenessV24Token,
} from "@/lib/humanity/v2/liveness-chain"
import { deriveTriProofLightChallenge, type TriProofLivenessResult } from "@/lib/humanity/v2/liveness-engine"

const SECRET = "test-v2-4-chain-secret"
const EXPECTED = {
  sessionId: "session-v2-4",
  campaignId: "campaign-v2-4",
  nonce: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  walletAddress: "0x1234567890123456789012345678901234567890",
  walletChain: "evm",
}

function frame(seed = 0, capturedAtMs = 0) {
  const bytes = Buffer.alloc(32 * 32 * 3)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 17 + seed * 29) % 256
  return { capturedAtMs, width: 32, height: 32, rgbBase64: bytes.toString("base64") }
}

function passResult(): TriProofLivenessResult {
  return {
    verdict: "PASS",
    engineVersion: "2.2",
    livenessScore: 86,
    antiSpoofScore: 82,
    chromaticResponseScore: 84,
    spatialResponseScore: 72,
    frameDiversityScore: 81,
    textureScore: 75,
    timingScore: 100,
    captureIntegrityScore: 88,
    temporalConsistencyScore: 86,
    replayRiskScore: 8,
    injectionRiskScore: 9,
    virtualCameraRiskScore: 10,
    frameInjectionRiskScore: 8,
    deepfakeHeuristicRiskScore: 12,
    reasonCodes: ["TRIPROOF_LIVENESS_V2_2_PASS"],
  }
}

test("V2.4 chain state token preserves exact session, wallet and pulse progress bindings", async () => {
  const challenge = deriveTriProofLightChallenge(EXPECTED.nonce, SECRET)
  const firstPulse = challenge.pulses[0]
  const stateToken = await issueTriProofLivenessChainState({
    secret: SECRET,
    state: {
      ...EXPECTED,
      chainId: "chain-001",
      nextPulseIndex: 1,
      stateVersionMs: Date.now(),
      serverIssuedAtMs: Date.now(),
      baseline: frame(1, 0),
      pulses: [{ ...frame(2, 500), index: firstPulse.index, color: firstPulse.color }],
    },
  })

  const state = await verifyTriProofLivenessChainState({ token: stateToken, secret: SECRET })
  assert.equal(state.sessionId, EXPECTED.sessionId)
  assert.equal(state.nextPulseIndex, 1)
  assert.equal(state.pulses.length, 1)
  assert.equal(state.pulses[0].color, firstPulse.color)
  assertTriProofLivenessChainBinding(state, EXPECTED)
})

test("V2.4 chain token rejects the wrong signing secret and wrong wallet binding", async () => {
  const token = await issueTriProofLivenessChainState({
    secret: SECRET,
    state: {
      ...EXPECTED,
      chainId: "chain-002",
      nextPulseIndex: 0,
      stateVersionMs: Date.now(),
      serverIssuedAtMs: Date.now(),
      baseline: frame(3),
      pulses: [],
    },
  })

  await assert.rejects(verifyTriProofLivenessChainState({ token, secret: `${SECRET}-wrong` }))
  const state = await verifyTriProofLivenessChainState({ token, secret: SECRET })
  assert.throws(() => assertTriProofLivenessChainBinding(state, { ...EXPECTED, walletAddress: "0x2234567890123456789012345678901234567890" }), /wallet mismatch/)
})

test("V2.4 chain state refuses inconsistent pulse progress", async () => {
  await assert.rejects(
    issueTriProofLivenessChainState({
      secret: SECRET,
      state: {
        ...EXPECTED,
        chainId: "chain-003",
        nextPulseIndex: 2,
        stateVersionMs: Date.now(),
        serverIssuedAtMs: Date.now(),
        baseline: frame(4),
        pulses: [],
      },
    }),
    /pulse state is inconsistent/
  )
})

test("V2.4 server timing rejects immediate injection and stale pulse replay", () => {
  const pulse = deriveTriProofLightChallenge(EXPECTED.nonce, SECRET).pulses[0]
  const issued = 1_000_000
  const window = getTriProofServerPulseTimingWindow(pulse)
  const early = validateTriProofServerPulseTiming({ pulse, serverIssuedAtMs: issued, receivedAtMs: issued + Math.max(1, window.minElapsedMs - 20) })
  const valid = validateTriProofServerPulseTiming({ pulse, serverIssuedAtMs: issued, receivedAtMs: issued + window.minElapsedMs + 80 })
  const late = validateTriProofServerPulseTiming({ pulse, serverIssuedAtMs: issued, receivedAtMs: issued + window.maxElapsedMs + 1 })
  assert.equal(early.ok, false)
  assert.equal(valid.ok, true)
  assert.equal(late.ok, false)
})

test("V2.4 final attestation is server-chain bound and remains approval-ineligible", async () => {
  const token = await issueTriProofLivenessV24Token({ result: passResult(), expected: EXPECTED, chainId: "chain-final", secret: SECRET })
  const attestation = await verifyTriProofLivenessV24Token({ token, expected: EXPECTED, secret: SECRET })
  assert.equal(attestation.engineVersion, "2.4")
  assert.equal(attestation.approvalEligible, false)
  assert.equal(attestation.verified, true)

  const decision = computeHumanityDecision({
    facePresenceScore: 95,
    headPoseScore: 95,
    eyeBlinkScore: 95,
    handGestureScore: 95,
    motionTimingScore: 95,
    frameConsistencyScore: 95,
    replayRiskScore: 5,
    injectionRiskScore: 5,
  }, attestation)
  assert.equal(decision.decision, "MANUAL_REVIEW")
  assert.ok(decision.reasonCodes.includes("TRIPROOF_LIVENESS_V2_4_SERVER_CHAIN_VERIFIED"))
  assert.ok(decision.reasonCodes.includes("TRIPROOF_LIVENESS_V2_4_NOT_YET_APPROVAL_ELIGIBLE"))
})

test("V2.4 final attestation cannot be rebound to another nonce", async () => {
  const token = await issueTriProofLivenessV24Token({ result: passResult(), expected: EXPECTED, chainId: "chain-final-2", secret: SECRET })
  await assert.rejects(
    verifyTriProofLivenessV24Token({ token, expected: { ...EXPECTED, nonce: `${EXPECTED.nonce.slice(0, -1)}0` }, secret: SECRET }),
    /nonce mismatch/
  )
})
