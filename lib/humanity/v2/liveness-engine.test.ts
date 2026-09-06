import assert from "node:assert/strict"
import test from "node:test"

import { computeHumanityDecision } from "@/lib/humanity/v2/core"
import {
  deriveTriProofLightChallenge,
  issueTriProofLivenessToken,
  scoreTriProofLivenessEvidence,
  verifyTriProofLivenessToken,
  type TriProofLightColor,
} from "@/lib/humanity/v2/liveness-engine"

const WIDTH = 32
const HEIGHT = 32
const SECRET = "test-humanity-liveness-secret"

function frameBase64(color?: TriProofLightColor) {
  const bytes = Buffer.alloc(WIDTH * HEIGHT * 3)
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const pixel = y * WIDTH + x
      const offset = pixel * 3
      const texture = (x + y) % 2 === 0 ? 8 : -8
      let r = 90
      let g = 80
      let b = 75
      if (color === "RED") r += 28
      if (color === "GREEN") g += 28
      if (color === "BLUE") b += 28
      if (color === "WHITE") {
        r += 22
        g += 22
        b += 22
      }
      bytes[offset] = r + texture
      bytes[offset + 1] = g + texture
      bytes[offset + 2] = b + texture
    }
  }
  return bytes.toString("base64")
}

function evidenceForChallenge(challenge: ReturnType<typeof deriveTriProofLightChallenge>) {
  return {
    baseline: { capturedAtMs: 0, width: WIDTH, height: HEIGHT, rgbBase64: frameBase64() },
    pulses: challenge.pulses.map((pulse, index) => ({
      index: pulse.index,
      color: pulse.color,
      capturedAtMs: 500 + index * 700,
      width: WIDTH,
      height: HEIGHT,
      rgbBase64: frameBase64(pulse.color),
    })),
  }
}

const expected = {
  sessionId: "session-v1",
  campaignId: "campaign-v1",
  nonce: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  walletAddress: "0x1234567890123456789012345678901234567890",
  walletChain: "evm",
}

test("active-light challenge is deterministic for a server nonce and secret", () => {
  const first = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const second = deriveTriProofLightChallenge(expected.nonce, SECRET)
  assert.deepEqual(first, second)
  assert.equal(first.pulses.length, 4)
  assert.equal(new Set(first.pulses.map((pulse) => pulse.color)).size, 4)
})

test("server-scored chromatic response passes synthetic live optical evidence", async () => {
  const challenge = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidenceForChallenge(challenge) })

  assert.equal(result.verdict, "PASS")
  assert.ok(result.livenessScore >= 64)
  assert.ok(result.antiSpoofScore >= 58)
  assert.ok(result.reasonCodes.includes("TRIPROOF_LIVENESS_V1_PASS"))

  const token = await issueTriProofLivenessToken({ result, expected, secret: SECRET })
  const attestation = await verifyTriProofLivenessToken({ token, expected, secret: SECRET })
  assert.equal(attestation.verified, true)
  assert.equal(attestation.approvalEligible, false)
})

test("reusing an identical frame across all light pulses is treated as replay risk", () => {
  const challenge = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const same = frameBase64()
  const result = scoreTriProofLivenessEvidence({
    challenge,
    evidence: {
      baseline: { capturedAtMs: 0, width: WIDTH, height: HEIGHT, rgbBase64: same },
      pulses: challenge.pulses.map((pulse, index) => ({
        index: pulse.index,
        color: pulse.color,
        capturedAtMs: 500 + index * 700,
        width: WIDTH,
        height: HEIGHT,
        rgbBase64: same,
      })),
    },
  })

  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.replayRiskScore >= 90)
  assert.ok(result.reasonCodes.includes("DUPLICATE_FRAME_REPLAY_PATTERN"))
})

test("Tri-Proof Liveness V1 attestation is server-scored but cannot auto-approve yet", async () => {
  const challenge = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidenceForChallenge(challenge) })
  const token = await issueTriProofLivenessToken({ result, expected, secret: SECRET })
  const attestation = await verifyTriProofLivenessToken({ token, expected, secret: SECRET })

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
  assert.ok(decision.reasonCodes.includes("TRIPROOF_LIVENESS_V1_SERVER_SCORED"))
  assert.ok(decision.reasonCodes.includes("TRIPROOF_LIVENESS_V1_NOT_YET_APPROVAL_ELIGIBLE"))
})

test("Tri-Proof liveness token is bound to the server session nonce and wallet", async () => {
  const challenge = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidenceForChallenge(challenge) })
  const token = await issueTriProofLivenessToken({ result, expected, secret: SECRET })

  await assert.rejects(
    verifyTriProofLivenessToken({
      token,
      secret: SECRET,
      expected: { ...expected, nonce: `${expected.nonce.slice(0, -1)}0` },
    }),
    /nonce mismatch/
  )

  await assert.rejects(
    verifyTriProofLivenessToken({
      token,
      secret: SECRET,
      expected: { ...expected, walletAddress: "0x2234567890123456789012345678901234567890" },
    }),
    /wallet mismatch/
  )
})
