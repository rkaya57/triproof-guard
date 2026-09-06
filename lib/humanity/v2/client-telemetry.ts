export type HumanityV2ClientStep =
  | "LOOK_CENTER"
  | "TURN_LEFT"
  | "TURN_RIGHT"
  | "BLINK"
  | "RAISE_HAND"
  | "SMILE"

export type HumanityV2FrameSample = {
  brightness: number
  sharpness: number
  motion: number
  facePresent: boolean
  faceConfidence: number
  yaw: number
  blinkScore: number
  smileScore: number
  landmarkCount: number
  handPresent: boolean
  handLandmarkCount: number
}

export type HumanityV2ClientStepEvidence = {
  step: HumanityV2ClientStep
  capturedAtMs: number
  heldForMs: number
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

export function deriveHumanityV2ClientTelemetry({
  samples,
  evidence,
  challengeSequence,
  secureContext,
}: {
  samples: HumanityV2FrameSample[]
  evidence: HumanityV2ClientStepEvidence[]
  challengeSequence: HumanityV2ClientStep[]
  secureContext: boolean
}) {
  const sampleCount = samples.length
  const faceSamples = samples.filter((sample) => sample.facePresent && sample.landmarkCount >= 450)
  const faceRatio = sampleCount ? faceSamples.length / sampleCount : 0
  const faceConfidence = average(faceSamples.map((sample) => sample.faceConfidence), 0)
  const yawValues = faceSamples.map((sample) => sample.yaw)
  const yawRange = yawValues.length ? Math.max(...yawValues) - Math.min(...yawValues) : 0
  const blinkMax = Math.max(0, ...faceSamples.map((sample) => sample.blinkScore))
  const smileMax = Math.max(0, ...faceSamples.map((sample) => sample.smileScore))
  const handSeenCount = samples.filter((sample) => sample.handPresent && sample.handLandmarkCount >= 16).length
  const motionAverage = average(samples.map((sample) => sample.motion), 0)
  const motionPeak = Math.max(0, ...samples.map((sample) => sample.motion))
  const brightnessAverage = average(samples.map((sample) => sample.brightness), 0)
  const brightnessDeviation = average(samples.map((sample) => Math.abs(sample.brightness - brightnessAverage)), 100)

  const hasTurnStep = challengeSequence.some((step) => step === "TURN_LEFT" || step === "TURN_RIGHT")
  const hasBlinkStep = challengeSequence.includes("BLINK")
  const hasHandStep = challengeSequence.includes("RAISE_HAND")
  const evidenceMatches =
    evidence.length === challengeSequence.length &&
    evidence.every((item, index) =>
      item.step === challengeSequence[index] &&
      item.heldForMs >= 250 &&
      item.heldForMs <= 12_000
    )

  const enoughSamples = sampleCount >= Math.max(12, challengeSequence.length * 5)
  const detectorQuality = enoughSamples && faceRatio >= 0.72 && faceSamples.some((sample) => sample.landmarkCount >= 450)

  const facePresenceScore = clamp(faceRatio * 72 + faceConfidence * 0.28)
  const headPoseScore = hasTurnStep ? clamp(detectorQuality ? 52 + yawRange * 145 : 32) : 85
  const eyeBlinkScore = hasBlinkStep ? clamp(detectorQuality ? blinkMax * 145 : 32) : 85
  const handGestureScore = hasHandStep ? clamp(handSeenCount >= 2 ? 94 : motionPeak > 18 ? 52 : 28) : 85
  const motionTimingScore = evidenceMatches ? clamp(86 + Math.min(10, motionAverage)) : 30
  const frameConsistencyScore = clamp(
    detectorQuality
      ? 96 - Math.min(38, brightnessDeviation * 0.9) - Math.max(0, 75 - brightnessAverage) * 0.12
      : 34
  )

  const replayRiskScore = clamp(
    !detectorQuality
      ? 76
      : Math.max(5, 48 - motionAverage * 1.6 - yawRange * 42 - blinkMax * 14 - smileMax * 8)
  )
  const injectionRiskScore = clamp(!secureContext ? 90 : detectorQuality && evidenceMatches ? 10 : 72)

  return {
    scores: {
      facePresenceScore,
      headPoseScore,
      eyeBlinkScore,
      handGestureScore,
      motionTimingScore,
      frameConsistencyScore,
      replayRiskScore,
      injectionRiskScore,
    },
    diagnostics: {
      sampleCount,
      faceSeenCount: faceSamples.length,
      handSeenCount,
      faceRatio: Number(faceRatio.toFixed(3)),
      yawRange: Number(yawRange.toFixed(3)),
      blinkMax: Number(blinkMax.toFixed(3)),
      smileMax: Number(smileMax.toFixed(3)),
      motionAverage: Number(motionAverage.toFixed(2)),
      brightnessAverage: Number(brightnessAverage.toFixed(1)),
      detectorQuality,
      evidenceMatches,
      secureContext,
    },
  }
}
