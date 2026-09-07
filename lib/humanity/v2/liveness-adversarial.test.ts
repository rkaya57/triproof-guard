import assert from "node:assert/strict"
import test from "node:test"

import type { TriProofCaptureIntegrityEvidence } from "@/lib/humanity/v2/capture-integrity"
import {
  deriveTriProofLightChallenge,
  scoreTriProofLivenessEvidence,
  type TriProofLightColor,
} from "@/lib/humanity/v2/liveness-engine"

const WIDTH = 32
const HEIGHT = 32
const SECRET = "v2-3-adversarial-secret"
const NONCE = "a".repeat(64)

function liveCapture(): TriProofCaptureIntegrityEvidence {
  return {
    secureContext: true,
    frameCallbacksSupported: true,
    observedDurationMs: 3_000,
    trackStart: { width: 640, height: 480, frameRate: 20, facingMode: "user", readyState: "live", muted: false, enabled: true },
    trackEnd: { width: 640, height: 480, frameRate: 20, facingMode: "user", readyState: "live", muted: false, enabled: true },
    frameCallbacks: Array.from({ length: 54 }, (_, index) => ({
      callbackAtMs: index * 50 + [0, 2, -1, 1, -2, 1][index % 6] + 2,
      mediaTimeMs: index * 50 + [0, 1, 0, 2, 0, 1][index % 6],
      presentedFrames: index + 1,
      expectedDisplayTimeMs: index * 50 + 48,
    })),
    visualSignatures: Array.from({ length: 42 }, (_, index) => (0x10203040 + index * 104729).toString(16).slice(-8).padStart(8, "0")),
    motionPairs: Array.from({ length: 26 }, (_, index) => {
      const pixelMotion = 2.4 + (index % 7) * 0.7
      return { capturedAtMs: index * 165, landmarkMotion: 0.5 + pixelMotion * 0.31, pixelMotion }
    }),
    eventCounts: { settingsChanges: 0, mute: 0, unmute: 0, ended: 0, visibilityHidden: 0, windowBlur: 0, windowFocus: 0 },
  }
}

function frameBase64(color?: TriProofLightColor, mode: "physical" | "uniform" | "dark" = "physical") {
  const bytes = Buffer.alloc(WIDTH * HEIGHT * 3)
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 3
      const texture = (x + y) % 2 === 0 ? 10 : -10
      const base = mode === "dark" ? 22 : 82
      let r = base + 10 + texture
      let g = base + texture
      let b = base - 5 + texture
      if (color) {
        const spatial = mode === "uniform" ? 1 : 0.72 + ((x * 3 + y * 5) % 11) / 22
        const lift = mode === "dark" ? 12 : 34
        if (color === "RED") r += Math.round(lift * spatial)
        if (color === "GREEN") g += Math.round(lift * spatial)
        if (color === "BLUE") b += Math.round(lift * spatial)
        if (color === "WHITE") {
          r += Math.round((lift - 6) * spatial)
          g += Math.round((lift - 6) * spatial)
          b += Math.round((lift - 6) * spatial)
        }
      }
      bytes[offset] = Math.max(0, Math.min(255, r))
      bytes[offset + 1] = Math.max(0, Math.min(255, g))
      bytes[offset + 2] = Math.max(0, Math.min(255, b))
    }
  }
  return bytes.toString("base64")
}

function evidence(
  challenge: ReturnType<typeof deriveTriProofLightChallenge>,
  captureIntegrity: TriProofCaptureIntegrityEvidence,
  frameMode: "physical" | "uniform" | "dark" = "physical",
  timing: "normal" | "too-fast" = "normal"
) {
  return {
    baseline: { capturedAtMs: 0, width: WIDTH, height: HEIGHT, rgbBase64: frameBase64(undefined, frameMode) },
    pulses: challenge.pulses.map((pulse, index) => ({
      index: pulse.index,
      color: pulse.color,
      capturedAtMs: timing === "normal" ? 500 + index * 700 : 30 + index * 35,
      width: WIDTH,
      height: HEIGHT,
      rgbBase64: frameBase64(pulse.color, frameMode),
    })),
    captureIntegrity,
  }
}

test("V2.3 negative control: spatially varying optical response with continuous capture can pass", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidence(challenge, liveCapture()) })

  assert.equal(result.verdict, "PASS")
  assert.ok(result.spatialResponseScore >= 24)
  assert.ok(result.captureIntegrityScore >= 58)
  assert.ok(result.virtualCameraRiskScore < 70)
  assert.ok(result.frameInjectionRiskScore < 70)
})

test("static photo replay cannot pass active-light challenge", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const same = frameBase64()
  const attack = evidence(challenge, liveCapture())
  attack.baseline.rgbBase64 = same
  attack.pulses = attack.pulses.map((pulse) => ({ ...pulse, rgbBase64: same }))

  const result = scoreTriProofLivenessEvidence({ challenge, evidence: attack })
  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.replayRiskScore >= 90)
  assert.ok(result.reasonCodes.includes("DUPLICATE_FRAME_REPLAY_PATTERN"))
})

test("digitally recolored uniform overlays are not accepted as physical active-light response", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const result = scoreTriProofLivenessEvidence({
    challenge,
    evidence: evidence(challenge, liveCapture(), "uniform"),
  })

  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.spatialResponseScore <= 22)
  assert.ok(result.injectionRiskScore >= 70)
  assert.ok(result.reasonCodes.includes("UNIFORM_DIGITAL_TINT_PATTERN"))
})

test("prerecorded loop capture metadata blocks otherwise plausible optical evidence", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const capture = liveCapture()
  capture.visualSignatures = Array.from({ length: 42 }, (_, index) => ["11111111", "22222222", "33333333", "44444444"][index % 4])

  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidence(challenge, capture) })
  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.virtualCameraRiskScore >= 70)
  assert.ok(result.reasonCodes.some((code) => code.startsWith("CAPTURE_LOOP_PATTERN_DETECTED:")))
})

test("frame injection/discontinuity blocks otherwise plausible optical evidence", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const capture = liveCapture()
  capture.eventCounts.settingsChanges = 2
  capture.eventCounts.mute = 1
  capture.eventCounts.ended = 1
  capture.trackEnd.readyState = "ended"
  capture.trackEnd.enabled = false
  capture.frameCallbacks[15] = {
    ...capture.frameCallbacks[15],
    mediaTimeMs: capture.frameCallbacks[14].mediaTimeMs,
    presentedFrames: capture.frameCallbacks[14].presentedFrames,
  }

  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidence(challenge, capture) })
  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.frameInjectionRiskScore >= 70)
  assert.ok(result.reasonCodes.includes("FRAME_INJECTION_HEURISTIC_RISK_HIGH"))
})

test("deepfake/face-reenactment-like motion decoupling is escalated as heuristic risk", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const capture = liveCapture()
  capture.motionPairs = Array.from({ length: 26 }, (_, index) => ({
    capturedAtMs: index * 165,
    landmarkMotion: 4.8 + (index % 4) * 0.7,
    pixelMotion: 0.4 + (index % 3) * 0.08,
  }))

  const result = scoreTriProofLivenessEvidence({ challenge, evidence: evidence(challenge, capture) })
  assert.notEqual(result.verdict, "PASS")
  assert.ok(result.deepfakeHeuristicRiskScore >= 65)
  assert.ok(result.reasonCodes.includes("DEEPFAKE_HEURISTIC_RISK_HIGH"))
})

test("active-light samples with impossible client timing cannot pass", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const result = scoreTriProofLivenessEvidence({
    challenge,
    evidence: evidence(challenge, liveCapture(), "physical", "too-fast"),
  })

  assert.notEqual(result.verdict, "PASS")
  assert.equal(result.timingScore, 25)
  assert.ok(result.reasonCodes.includes("ACTIVE_LIGHT_TIMING_ANOMALY"))
})

test("reordered server colors are rejected before scoring", () => {
  const challenge = deriveTriProofLightChallenge(NONCE, SECRET)
  const attack = evidence(challenge, liveCapture())
  const firstColor = attack.pulses[0].color
  attack.pulses[0] = { ...attack.pulses[0], color: attack.pulses[1].color }
  attack.pulses[1] = { ...attack.pulses[1], color: firstColor }

  assert.throws(
    () => scoreTriProofLivenessEvidence({ challenge, evidence: attack }),
    /does not match server-issued color order/
  )
})
