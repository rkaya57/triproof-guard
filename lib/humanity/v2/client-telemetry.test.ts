import assert from "node:assert/strict"
import test from "node:test"

import {
  deriveHumanityV2ClientTelemetry,
  type HumanityV2ClientStep,
  type HumanityV2FrameSample,
} from "./client-telemetry"

function sample(overrides: Partial<HumanityV2FrameSample> = {}): HumanityV2FrameSample {
  return {
    brightness: 110,
    sharpness: 8,
    motion: 8,
    facePresent: true,
    faceConfidence: 92,
    yaw: 0,
    blinkScore: 0.1,
    smileScore: 0.2,
    landmarkCount: 478,
    handPresent: false,
    handLandmarkCount: 0,
    ...overrides,
  }
}

test("standard challenge does not penalize a hand step that was never issued", () => {
  const challengeSequence: HumanityV2ClientStep[] = ["LOOK_CENTER", "TURN_LEFT", "BLINK"]
  const samples = Array.from({ length: 30 }, (_, index) =>
    sample({
      yaw: index < 10 ? 0 : index < 20 ? -0.38 : 0.12,
      blinkScore: index === 24 ? 0.9 : 0.08,
      motion: index % 3 === 0 ? 11 : 7,
    })
  )
  const evidence = challengeSequence.map((step, index) => ({
    step,
    capturedAtMs: (index + 1) * 1_000,
    heldForMs: 700,
  }))

  const result = deriveHumanityV2ClientTelemetry({ samples, evidence, challengeSequence, secureContext: true })

  assert.equal(result.scores.handGestureScore, 85)
  assert.equal(result.diagnostics.evidenceMatches, true)
  assert.ok(result.scores.facePresenceScore >= 90)
  assert.ok(result.scores.replayRiskScore < 50)
})

test("sparse or insecure telemetry is treated as high risk", () => {
  const challengeSequence: HumanityV2ClientStep[] = ["LOOK_CENTER", "BLINK"]
  const result = deriveHumanityV2ClientTelemetry({
    samples: [sample({ facePresent: false, landmarkCount: 0, faceConfidence: 0 })],
    evidence: [{ step: "LOOK_CENTER", capturedAtMs: 100, heldForMs: 100 }],
    challengeSequence,
    secureContext: false,
  })

  assert.ok(result.scores.replayRiskScore >= 70)
  assert.ok(result.scores.injectionRiskScore >= 85)
  assert.equal(result.diagnostics.detectorQuality, false)
  assert.equal(result.diagnostics.evidenceMatches, false)
})
