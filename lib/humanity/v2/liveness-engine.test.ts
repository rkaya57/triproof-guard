import assert from "node:assert/strict"
import test from "node:test"

import type { TriProofCaptureIntegrityEvidence } from "@/lib/humanity/v2/capture-integrity"
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
      if (color) {
        const spatial = 0.74 + ((x * 5 + y * 3) % 11) / 22
        if (color === "RED") r += Math.round(30 * spatial)
        if (color === "GREEN") g += Math.round(30 * spatial)
        if (color === "BLUE") b += Math.round(30 * spatial)
        if (color === "WHITE") {
          r += Math.round(24 * spatial)
          g += Math.round(24 * spatial)
          b += Math.round(24 * spatial)
        }
      }
      bytes[offset] = r + texture
      bytes[offset + 1] = g + texture
      bytes[offset + 2] = b + texture
    }
  }
  return bytes.toString("base64")
}

function captureEvidence(): TriProofCaptureIntegrityEvidence {
  return {
    secureContext: true,
    frameCallbacksSupported: true,
    observedDurationMs: 2_600,
    trackStart: { width: 640, height: 480, frameRate: 20, facingMode: "user", readyState: "live", muted: false, enabled: true },
    trackEnd: { width: 640, height: 480, frameRate: 20, facingMode: "user", readyState: "live", muted: false, enabled: true },
    frameCallbacks: Array.from({ length: 50 }, (_, index) => ({
      callbackAtMs: index * 50 + [0, 2, -1, 1, -2][index % 5] + 2,
      mediaTimeMs: index * 50 + [0, 1, 0, 2, 0][index % 5],
      presentedFrames: index + 1,
      expectedDisplayTimeMs: index * 50 + 48,
    })),
    visualSignatures: Array.from({ length: 36 }, (_, index) => (0x12340000 + index * 8191).toString(16).padStart(8, "0")),
    motionPairs: Array.from({ length: 24 }, (_, index) => {
      const pixelMotion = 2.1 + (index % 6) * 0.9
      return { capturedAtMs: index * 170, landmarkMotion: 0.45 + pixelMotion * 0.33, pixelMotion }
    }),
    eventCounts: { settingsChanges: 0, mute: 0, unmute: 0, ended: 0, visibilityHidden: 0, windowBlur: 0, windowFocus: 0 },
  }
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
    captureIntegrity: captureEvidence(),
  }
}

const expected = {
  sessionId: "session-v2-2",
  campaignId: "campaign-v2-2",
  nonce: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  walletAddress: "0x1234567890123456789012345678901234567890",
  walletChain: "evm",
}

test("active-light challenge is deterministic for a server nonce and secret", () => {
  const first = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const second = deriveTriProofLightChallenge(expected.nonce, SECRET)
  assert.deepEqual(first, second)
  assert.equal(first.engine, "TRIPROOF_LIVENESS_V2_2")
  assert.equal(first.pulses.length, 4)
  assert.equal(new Set(first.pulses.map((pulse) => pulse.color)).size, 4)
})

test("server-scored V2.2 optical + capture evidence passes synthetic live evidence", async () => {
  const challenge = deriveTriProofLightChallenge(expected.nonce, SECRET)
  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidenceForChallenge(challenge) })

  assert.equal(result.verdict, "PASS")
  assert.equal(result.engineVersion, "2.2")
  assert.ok(result.livenessScore >= 62)
  assert.ok(result.antiSpoofScore >= 56)
  assert.ok(result.captureIntegrityScore >= 58)
  assert.ok(result.spatialResponseScore >= 24)
  assert.ok(result.reasonCodes.includes("TRIPROOF_LIVENESS_V2_2_PASS"))

  const token = await issueTriProofLivenessToken({ result, expected, secret: SECRET })
  const attestation = await verifyTriProofLivenessToken({ token, expected, secret: SECRET })
  assert.equal(attestation.verified, true)
  assert.equal(attestation.approvalEligible, false)
  assert.equal(attestation.engineVersion, "2.2")
  assert.ok((attestation.captureIntegrityScore ?? 0) >= 58)
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
      captureIntegrity: captureEvidence(),
    },
  })

  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.replayRiskScore >= 90)
  assert.ok(result.reasonCodes.includes("DUPLICATE_FRAME_REPLAY_PATTERN"))
})

test("Tri-Proof Liveness V2.2 attestation is server-scored but cannot auto-approve yet", async () => {
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
  assert.ok(decision.reasonCodes.includes("TRIPROOF_LIVENESS_V2_2_SERVER_SCORED"))
  assert.ok(decision.reasonCodes.includes("TRIPROOF_LIVENESS_V2_2_NOT_YET_APPROVAL_ELIGIBLE"))
  assert.ok(decision.reasonCodes.some((code) => code.startsWith("TRIPROOF_CAPTURE_INTEGRITY_SCORE:")))
})

test("Tri-Proof V2.2 liveness token is bound to the server session nonce and wallet", async () => {
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
