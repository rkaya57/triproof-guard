export type TriProofCaptureTrackSnapshot = {
  width: number
  height: number
  frameRate?: number | null
  facingMode?: string | null
  resizeMode?: string | null
  readyState?: string | null
  muted: boolean
  enabled: boolean
}

export type TriProofVideoFrameCallbackSample = {
  callbackAtMs: number
  mediaTimeMs: number
  presentedFrames: number
  expectedDisplayTimeMs?: number | null
}

export type TriProofCaptureMotionPair = {
  capturedAtMs: number
  landmarkMotion: number
  pixelMotion: number
}

export type TriProofCaptureIntegrityEvidence = {
  secureContext: boolean
  frameCallbacksSupported: boolean
  observedDurationMs: number
  trackStart: TriProofCaptureTrackSnapshot
  trackEnd: TriProofCaptureTrackSnapshot
  frameCallbacks: TriProofVideoFrameCallbackSample[]
  visualSignatures: string[]
  motionPairs: TriProofCaptureMotionPair[]
  eventCounts: {
    settingsChanges: number
    mute: number
    unmute: number
    ended: number
    visibilityHidden: number
    windowBlur: number
    windowFocus: number
  }
}

export type TriProofCaptureIntegrityResult = {
  captureIntegrityScore: number
  temporalConsistencyScore: number
  virtualCameraRiskScore: number
  frameInjectionRiskScore: number
  deepfakeHeuristicRiskScore: number
  observedFps: number | null
  cadenceJitterRatio: number | null
  visualDuplicateRatio: number
  detectedLoopPeriod: number | null
  reasonCodes: string[]
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

function median(values: number[]) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!clean.length) return 0
  const middle = Math.floor(clean.length / 2)
  return clean.length % 2 === 0 ? (clean[middle - 1] + clean[middle]) / 2 : clean[middle]
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

function normalizedTrack(snapshot: TriProofCaptureTrackSnapshot) {
  return {
    width: Math.max(0, Math.round(snapshot.width || 0)),
    height: Math.max(0, Math.round(snapshot.height || 0)),
    frameRate: Number.isFinite(snapshot.frameRate) ? Number(snapshot.frameRate) : null,
    facingMode: snapshot.facingMode?.trim().toLowerCase() || null,
    resizeMode: snapshot.resizeMode?.trim().toLowerCase() || null,
    readyState: snapshot.readyState?.trim().toLowerCase() || null,
    muted: Boolean(snapshot.muted),
    enabled: Boolean(snapshot.enabled),
  }
}

function detectLoopPeriod(signatures: string[]) {
  if (signatures.length < 9) return null
  const maxPeriod = Math.min(12, Math.floor(signatures.length / 3))
  for (let period = 2; period <= maxPeriod; period += 1) {
    const comparisonCount = signatures.length - period
    if (comparisonCount < period * 2) continue
    let matches = 0
    for (let index = period; index < signatures.length; index += 1) {
      if (signatures[index] === signatures[index - period]) matches += 1
    }
    const ratio = matches / comparisonCount
    if (ratio >= 0.78) return period
  }
  return null
}

function correlation(xs: number[], ys: number[]) {
  const count = Math.min(xs.length, ys.length)
  if (count < 4) return 0
  const x = xs.slice(0, count)
  const y = ys.slice(0, count)
  const mx = average(x)
  const my = average(y)
  let numerator = 0
  let dx = 0
  let dy = 0
  for (let index = 0; index < count; index += 1) {
    const ax = x[index] - mx
    const ay = y[index] - my
    numerator += ax * ay
    dx += ax * ax
    dy += ay * ay
  }
  if (dx <= 0 || dy <= 0) return 0
  return numerator / Math.sqrt(dx * dy)
}

export function scoreTriProofCaptureIntegrity(
  evidence: TriProofCaptureIntegrityEvidence
): TriProofCaptureIntegrityResult {
  const reasonCodes: string[] = []
  const start = normalizedTrack(evidence.trackStart)
  const end = normalizedTrack(evidence.trackEnd)
  const frameCallbacks = evidence.frameCallbacks
    .filter((sample) =>
      Number.isFinite(sample.callbackAtMs) &&
      Number.isFinite(sample.mediaTimeMs) &&
      Number.isFinite(sample.presentedFrames)
    )
    .slice(0, 360)
  const signatures = evidence.visualSignatures
    .filter((value) => /^[0-9a-f]{8,64}$/i.test(value))
    .slice(0, 240)
  const motionPairs = evidence.motionPairs
    .filter((pair) =>
      Number.isFinite(pair.capturedAtMs) &&
      Number.isFinite(pair.landmarkMotion) &&
      Number.isFinite(pair.pixelMotion)
    )
    .slice(0, 240)

  const callbackIntervals: number[] = []
  const mediaIntervals: number[] = []
  let nonMonotonicCallbacks = 0
  let nonMonotonicMedia = 0
  let nonMonotonicPresentedFrames = 0
  let largePresentedFrameJumps = 0

  for (let index = 1; index < frameCallbacks.length; index += 1) {
    const previous = frameCallbacks[index - 1]
    const current = frameCallbacks[index]
    const callbackDelta = current.callbackAtMs - previous.callbackAtMs
    const mediaDelta = current.mediaTimeMs - previous.mediaTimeMs
    const presentedDelta = current.presentedFrames - previous.presentedFrames

    if (callbackDelta <= 0) nonMonotonicCallbacks += 1
    else callbackIntervals.push(callbackDelta)
    if (mediaDelta <= 0) nonMonotonicMedia += 1
    else mediaIntervals.push(mediaDelta)
    if (presentedDelta <= 0) nonMonotonicPresentedFrames += 1
    if (presentedDelta > 4) largePresentedFrameJumps += 1
  }

  const callbackMedian = median(callbackIntervals)
  const callbackJitter = callbackMedian > 0 ? standardDeviation(callbackIntervals) / callbackMedian : null
  const observedFps = callbackMedian > 0 ? Number((1000 / callbackMedian).toFixed(2)) : null
  const callbackGapRatio = callbackIntervals.length
    ? callbackIntervals.filter((value) => callbackMedian > 0 && value > callbackMedian * 2.8).length / callbackIntervals.length
    : 0

  const reportedFrameRate = start.frameRate ?? end.frameRate
  const frameRateMismatch =
    reportedFrameRate && observedFps
      ? Math.abs(observedFps - reportedFrameRate) / Math.max(1, reportedFrameRate)
      : 0

  const uniqueSignatures = new Set(signatures).size
  const visualDuplicateRatio = signatures.length
    ? Number(((signatures.length - uniqueSignatures) / signatures.length).toFixed(3))
    : 0
  const detectedLoopPeriod = detectLoopPeriod(signatures)

  const landmarkMotion = motionPairs.map((pair) => Math.max(0, pair.landmarkMotion))
  const pixelMotion = motionPairs.map((pair) => Math.max(0, pair.pixelMotion))
  const meanLandmarkMotion = average(landmarkMotion)
  const meanPixelMotion = average(pixelMotion)
  const motionCorrelation = correlation(landmarkMotion, pixelMotion)
  const motionDecoupled =
    motionPairs.length >= 8 &&
    meanLandmarkMotion >= 0.7 &&
    meanPixelMotion <= 1.8 &&
    motionCorrelation < 0.08
  const meshJumpRatio = motionPairs.length
    ? motionPairs.filter((pair) => pair.landmarkMotion >= 6.5 && pair.pixelMotion <= 2.2).length / motionPairs.length
    : 0

  const dimensionsChanged =
    start.width > 0 && end.width > 0 &&
    (start.width !== end.width || start.height !== end.height)
  const frameRateChanged =
    start.frameRate && end.frameRate
      ? Math.abs(start.frameRate - end.frameRate) / Math.max(1, start.frameRate) > 0.15
      : false
  const trackDiscontinuity =
    evidence.eventCounts.ended > 0 ||
    start.readyState === "ended" ||
    end.readyState === "ended" ||
    !start.enabled ||
    !end.enabled

  if (!evidence.secureContext) reasonCodes.push("CAPTURE_NOT_SECURE_CONTEXT")
  if (!evidence.frameCallbacksSupported) reasonCodes.push("CAPTURE_FRAME_CALLBACK_UNAVAILABLE")
  if (frameCallbacks.length < 8 && evidence.frameCallbacksSupported) reasonCodes.push("CAPTURE_FRAME_CALLBACK_SAMPLE_WEAK")
  if (nonMonotonicCallbacks > 0) reasonCodes.push("CAPTURE_CALLBACK_TIME_NON_MONOTONIC")
  if (nonMonotonicMedia > 0) reasonCodes.push("CAPTURE_MEDIA_TIME_NON_MONOTONIC")
  if (nonMonotonicPresentedFrames > 0) reasonCodes.push("CAPTURE_PRESENTED_FRAMES_NON_MONOTONIC")
  if (callbackGapRatio >= 0.14 || largePresentedFrameJumps >= 2) reasonCodes.push("CAPTURE_FRAME_CADENCE_ANOMALY")
  if (frameRateMismatch >= 0.35) reasonCodes.push("CAPTURE_FRAME_RATE_MISMATCH")
  if (dimensionsChanged || frameRateChanged || evidence.eventCounts.settingsChanges > 0) reasonCodes.push("CAPTURE_SETTINGS_CHANGED")
  if (trackDiscontinuity || evidence.eventCounts.mute > 0 || evidence.eventCounts.unmute > 0) reasonCodes.push("CAPTURE_TRACK_DISCONTINUITY")
  if (evidence.eventCounts.visibilityHidden > 0 || evidence.eventCounts.windowBlur > 1) reasonCodes.push("CAPTURE_VISIBILITY_INTERRUPTION")
  if (visualDuplicateRatio >= 0.42) reasonCodes.push("CAPTURE_VISUAL_DUPLICATION_HIGH")
  if (detectedLoopPeriod !== null) reasonCodes.push(`CAPTURE_LOOP_PATTERN_DETECTED:${detectedLoopPeriod}`)
  if (motionDecoupled) reasonCodes.push("CAPTURE_MOTION_DECOUPLING_ANOMALY")
  if (meshJumpRatio >= 0.18) reasonCodes.push("CAPTURE_FACE_MESH_JUMP_ANOMALY")

  let temporalPenalty = 0
  if (!evidence.frameCallbacksSupported) temporalPenalty += 28
  if (frameCallbacks.length < 8 && evidence.frameCallbacksSupported) temporalPenalty += 20
  temporalPenalty += Math.min(45, nonMonotonicCallbacks * 20 + nonMonotonicMedia * 22 + nonMonotonicPresentedFrames * 25)
  temporalPenalty += Math.min(24, callbackGapRatio * 80)
  temporalPenalty += Math.min(18, largePresentedFrameJumps * 6)
  if (frameRateMismatch >= 0.35) temporalPenalty += 18
  if (callbackJitter !== null && callbackJitter > 0.65) temporalPenalty += 12
  const temporalConsistencyScore = clamp(100 - temporalPenalty)

  let virtualCameraRisk = 12
  if (!evidence.frameCallbacksSupported) virtualCameraRisk += 10
  if (callbackJitter !== null && callbackJitter < 0.004 && frameCallbacks.length >= 20) virtualCameraRisk += 8
  if (frameRateMismatch >= 0.35) virtualCameraRisk += 18
  if (visualDuplicateRatio >= 0.42) virtualCameraRisk += 32
  if (detectedLoopPeriod !== null) virtualCameraRisk += 48
  if (dimensionsChanged || frameRateChanged || evidence.eventCounts.settingsChanges > 0) virtualCameraRisk += 18
  if (motionDecoupled) virtualCameraRisk += 22
  const virtualCameraRiskScore = clamp(virtualCameraRisk)

  let frameInjectionRisk = evidence.secureContext ? 8 : 88
  if (nonMonotonicCallbacks > 0 || nonMonotonicMedia > 0 || nonMonotonicPresentedFrames > 0) frameInjectionRisk += 42
  if (largePresentedFrameJumps >= 2 || callbackGapRatio >= 0.14) frameInjectionRisk += 24
  if (trackDiscontinuity) frameInjectionRisk += 52
  if (evidence.eventCounts.mute > 0 || evidence.eventCounts.unmute > 0) frameInjectionRisk += 22
  if (dimensionsChanged || frameRateChanged || evidence.eventCounts.settingsChanges > 0) frameInjectionRisk += 18
  if (detectedLoopPeriod !== null) frameInjectionRisk += 18
  const frameInjectionRiskScore = clamp(frameInjectionRisk)

  let deepfakeHeuristicRisk = 10
  if (motionDecoupled) deepfakeHeuristicRisk += 48
  if (meshJumpRatio >= 0.18) deepfakeHeuristicRisk += 34
  if (visualDuplicateRatio >= 0.42) deepfakeHeuristicRisk += 16
  if (detectedLoopPeriod !== null) deepfakeHeuristicRisk += 14
  const deepfakeHeuristicRiskScore = clamp(deepfakeHeuristicRisk)

  if (virtualCameraRiskScore >= 70) reasonCodes.push("VIRTUAL_CAMERA_HEURISTIC_RISK_HIGH")
  if (frameInjectionRiskScore >= 70) reasonCodes.push("FRAME_INJECTION_HEURISTIC_RISK_HIGH")
  if (deepfakeHeuristicRiskScore >= 65) reasonCodes.push("DEEPFAKE_HEURISTIC_RISK_HIGH")

  let continuityScore = 100
  if (dimensionsChanged) continuityScore -= 18
  if (frameRateChanged) continuityScore -= 16
  continuityScore -= Math.min(35, evidence.eventCounts.settingsChanges * 12)
  continuityScore -= Math.min(45, evidence.eventCounts.mute * 18 + evidence.eventCounts.ended * 40)
  continuityScore -= Math.min(18, evidence.eventCounts.visibilityHidden * 8 + Math.max(0, evidence.eventCounts.windowBlur - 1) * 5)
  continuityScore = clamp(continuityScore)

  const visualContinuityScore = clamp(
    100 -
    visualDuplicateRatio * 85 -
    (detectedLoopPeriod !== null ? 45 : 0) -
    (motionDecoupled ? 28 : 0) -
    Math.min(22, meshJumpRatio * 75)
  )

  const captureIntegrityScore = clamp(
    temporalConsistencyScore * 0.48 +
    continuityScore * 0.28 +
    visualContinuityScore * 0.24
  )

  if (captureIntegrityScore < 55) reasonCodes.push("CAPTURE_INTEGRITY_WEAK")
  reasonCodes.push("CAPTURE_INTEGRITY_V2_2_REVIEW_ONLY")

  return {
    captureIntegrityScore,
    temporalConsistencyScore,
    virtualCameraRiskScore,
    frameInjectionRiskScore,
    deepfakeHeuristicRiskScore,
    observedFps,
    cadenceJitterRatio: callbackJitter === null ? null : Number(callbackJitter.toFixed(4)),
    visualDuplicateRatio,
    detectedLoopPeriod,
    reasonCodes,
  }
}
