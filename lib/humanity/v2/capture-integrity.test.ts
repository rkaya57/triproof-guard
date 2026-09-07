import assert from "node:assert/strict"
import test from "node:test"

import {
  scoreTriProofCaptureIntegrity,
  type TriProofCaptureIntegrityEvidence,
} from "@/lib/humanity/v2/capture-integrity"

function genuineCapture(): TriProofCaptureIntegrityEvidence {
  const frameCallbacks = Array.from({ length: 48 }, (_, index) => {
    const jitter = [0, 2, -1, 1, -2, 1][index % 6]
    return {
      callbackAtMs: index * 50 + jitter + 1,
      mediaTimeMs: index * 50 + Math.max(0, jitter),
      presentedFrames: index + 1,
      expectedDisplayTimeMs: index * 50 + 48,
    }
  })

  const visualSignatures = Array.from({ length: 36 }, (_, index) =>
    (0xabc00000 + index * 7919).toString(16).padStart(8, "0")
  )
  const motionPairs = Array.from({ length: 24 }, (_, index) => {
    const pixelMotion = 2.2 + (index % 6) * 0.9
    return {
      capturedAtMs: index * 170,
      landmarkMotion: 0.42 + pixelMotion * 0.34,
      pixelMotion,
    }
  })

  return {
    secureContext: true,
    frameCallbacksSupported: true,
    observedDurationMs: 2_450,
    trackStart: {
      width: 640,
      height: 480,
      frameRate: 20,
      facingMode: "user",
      resizeMode: "none",
      readyState: "live",
      muted: false,
      enabled: true,
    },
    trackEnd: {
      width: 640,
      height: 480,
      frameRate: 20,
      facingMode: "user",
      resizeMode: "none",
      readyState: "live",
      muted: false,
      enabled: true,
    },
    frameCallbacks,
    visualSignatures,
    motionPairs,
    eventCounts: {
      settingsChanges: 0,
      mute: 0,
      unmute: 0,
      ended: 0,
      visibilityHidden: 0,
      windowBlur: 0,
      windowFocus: 0,
    },
  }
}

test("normal browser capture retains strong V2.2 integrity without high heuristic risks", () => {
  const result = scoreTriProofCaptureIntegrity(genuineCapture())
  assert.ok(result.captureIntegrityScore >= 70)
  assert.ok(result.temporalConsistencyScore >= 70)
  assert.ok(result.virtualCameraRiskScore < 50)
  assert.ok(result.frameInjectionRiskScore < 50)
  assert.ok(result.deepfakeHeuristicRiskScore < 50)
  assert.equal(result.detectedLoopPeriod, null)
})

test("periodic prerecorded loop signatures are flagged as virtual-camera/replay risk", () => {
  const evidence = genuineCapture()
  evidence.visualSignatures = Array.from({ length: 36 }, (_, index) => ["a1b2c3d4", "b2c3d4e5", "c3d4e5f6"][index % 3])
  const result = scoreTriProofCaptureIntegrity(evidence)

  assert.equal(result.detectedLoopPeriod, 3)
  assert.ok(result.virtualCameraRiskScore >= 70)
  assert.ok(result.reasonCodes.includes("CAPTURE_LOOP_PATTERN_DETECTED:3"))
  assert.ok(result.reasonCodes.includes("VIRTUAL_CAMERA_HEURISTIC_RISK_HIGH"))
})

test("frame-time rewrites and track discontinuity are treated as injection risk", () => {
  const evidence = genuineCapture()
  evidence.frameCallbacks[12] = {
    ...evidence.frameCallbacks[12],
    mediaTimeMs: evidence.frameCallbacks[11].mediaTimeMs,
    presentedFrames: evidence.frameCallbacks[11].presentedFrames,
  }
  evidence.eventCounts.settingsChanges = 2
  evidence.eventCounts.mute = 1
  evidence.eventCounts.ended = 1
  evidence.trackEnd.readyState = "ended"
  evidence.trackEnd.enabled = false

  const result = scoreTriProofCaptureIntegrity(evidence)
  assert.ok(result.frameInjectionRiskScore >= 70)
  assert.ok(result.reasonCodes.includes("CAPTURE_MEDIA_TIME_NON_MONOTONIC"))
  assert.ok(result.reasonCodes.includes("CAPTURE_PRESENTED_FRAMES_NON_MONOTONIC"))
  assert.ok(result.reasonCodes.includes("CAPTURE_TRACK_DISCONTINUITY"))
  assert.ok(result.reasonCodes.includes("FRAME_INJECTION_HEURISTIC_RISK_HIGH"))
})

test("face-motion without corresponding pixel motion raises deepfake/reenactment heuristic risk", () => {
  const evidence = genuineCapture()
  evidence.motionPairs = Array.from({ length: 24 }, (_, index) => ({
    capturedAtMs: index * 170,
    landmarkMotion: 4.5 + (index % 4) * 0.8,
    pixelMotion: 0.45 + (index % 3) * 0.08,
  }))

  const result = scoreTriProofCaptureIntegrity(evidence)
  assert.ok(result.deepfakeHeuristicRiskScore >= 65)
  assert.ok(result.reasonCodes.includes("CAPTURE_MOTION_DECOUPLING_ANOMALY"))
  assert.ok(result.reasonCodes.includes("DEEPFAKE_HEURISTIC_RISK_HIGH"))
})

test("a single focus transition is not enough by itself to classify capture as high-risk", () => {
  const evidence = genuineCapture()
  evidence.eventCounts.windowBlur = 1
  evidence.eventCounts.windowFocus = 1
  const result = scoreTriProofCaptureIntegrity(evidence)

  assert.ok(result.captureIntegrityScore >= 65)
  assert.ok(result.virtualCameraRiskScore < 70)
  assert.ok(result.frameInjectionRiskScore < 70)
})
