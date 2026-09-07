import type {
  TriProofCaptureIntegrityEvidence,
  TriProofCaptureMotionPair,
  TriProofCaptureTrackSnapshot,
  TriProofVideoFrameCallbackSample,
} from "./capture-integrity"

type LandmarkLike = { x: number; y: number }
type FrameMetadataLike = {
  mediaTime: number
  presentedFrames: number
  expectedDisplayTime?: number
}
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: FrameMetadataLike) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}
type ExtendedMediaTrackSettings = MediaTrackSettings & { resizeMode?: string }

const MOTION_LANDMARKS = [1, 33, 263, 61, 291, 152, 234, 454] as const

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function snapshotTrack(track: MediaStreamTrack, video: HTMLVideoElement): TriProofCaptureTrackSnapshot {
  const settings = (track.getSettings?.() ?? {}) as ExtendedMediaTrackSettings
  return {
    width: Math.max(0, Number(settings.width ?? video.videoWidth ?? 0)),
    height: Math.max(0, Number(settings.height ?? video.videoHeight ?? 0)),
    frameRate: finiteOrNull(settings.frameRate),
    facingMode: typeof settings.facingMode === "string" ? settings.facingMode : null,
    resizeMode: typeof settings.resizeMode === "string" ? settings.resizeMode : null,
    readyState: track.readyState,
    muted: track.muted,
    enabled: track.enabled,
  }
}

function settingsFingerprint(snapshot: TriProofCaptureTrackSnapshot) {
  return [
    Math.round(snapshot.width),
    Math.round(snapshot.height),
    snapshot.frameRate === null || snapshot.frameRate === undefined ? "" : Number(snapshot.frameRate).toFixed(2),
    snapshot.facingMode ?? "",
    snapshot.resizeMode ?? "",
  ].join(":")
}

function visualSignature(rgba: Uint8ClampedArray, width: number, height: number) {
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  const cellsX = 8
  const cellsY = 6
  for (let cy = 0; cy < cellsY; cy += 1) {
    for (let cx = 0; cx < cellsX; cx += 1) {
      const x = Math.min(width - 1, Math.floor(((cx + 0.5) / cellsX) * width))
      const y = Math.min(height - 1, Math.floor(((cy + 0.5) / cellsY) * height))
      const offset = (y * width + x) * 4
      const gray = Math.round((rgba[offset] + rgba[offset + 1] + rgba[offset + 2]) / 3)
      h1 ^= gray
      h1 = Math.imul(h1, 0x01000193)
      h2 ^= gray + cx * 17 + cy * 31
      h2 = Math.imul(h2, 0x85ebca6b)
    }
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`
}

function landmarkMotion(previous: LandmarkLike[] | null, current: LandmarkLike[]) {
  if (!previous || previous.length < 450 || current.length < 450) return 0
  const distances = MOTION_LANDMARKS.map((index) => {
    const a = previous[index]
    const b = current[index]
    if (!a || !b) return 0
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) * 100
  })
  return distances.reduce((sum, value) => sum + value, 0) / distances.length
}

export type TriProofBrowserCaptureIntegrityCollector = {
  recordAnalyzedFrame: (input: {
    rgba: Uint8ClampedArray
    width: number
    height: number
    landmarks: LandmarkLike[]
    pixelMotion: number
  }) => void
  snapshot: () => TriProofCaptureIntegrityEvidence
  stop: () => void
}

export function createTriProofCaptureIntegrityCollector({
  video,
  stream,
}: {
  video: HTMLVideoElement
  stream: MediaStream
}): TriProofBrowserCaptureIntegrityCollector {
  const track = stream.getVideoTracks()[0]
  if (!track) throw new Error("Video track is unavailable for capture integrity")

  const startedAt = performance.now()
  const trackStart = snapshotTrack(track, video)
  const frameCallbacks: TriProofVideoFrameCallbackSample[] = []
  const visualSignatures: string[] = []
  const motionPairs: TriProofCaptureMotionPair[] = []
  const eventCounts = {
    settingsChanges: 0,
    mute: 0,
    unmute: 0,
    ended: 0,
    visibilityHidden: 0,
    windowBlur: 0,
    windowFocus: 0,
  }
  let previousLandmarks: LandmarkLike[] | null = null
  let stopped = false
  let callbackHandle: number | null = null

  const onMute = () => { eventCounts.mute += 1 }
  const onUnmute = () => { eventCounts.unmute += 1 }
  const onEnded = () => { eventCounts.ended += 1 }
  const onVisibility = () => { if (document.visibilityState === "hidden") eventCounts.visibilityHidden += 1 }
  const onBlur = () => { eventCounts.windowBlur += 1 }
  const onFocus = () => { eventCounts.windowFocus += 1 }

  track.addEventListener("mute", onMute)
  track.addEventListener("unmute", onUnmute)
  track.addEventListener("ended", onEnded)
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("blur", onBlur)
  window.addEventListener("focus", onFocus)

  const videoWithCallback = video as VideoWithFrameCallback
  const frameCallbacksSupported = typeof videoWithCallback.requestVideoFrameCallback === "function"
  const scheduleFrameCallback = () => {
    if (stopped || !videoWithCallback.requestVideoFrameCallback) return
    callbackHandle = videoWithCallback.requestVideoFrameCallback((now, metadata) => {
      if (frameCallbacks.length < 360) {
        frameCallbacks.push({
          callbackAtMs: Math.max(0, Math.round(now - startedAt)),
          mediaTimeMs: Math.max(0, Math.round(metadata.mediaTime * 1000)),
          presentedFrames: Math.max(0, Math.round(metadata.presentedFrames)),
          expectedDisplayTimeMs: Number.isFinite(metadata.expectedDisplayTime)
            ? Math.max(0, Math.round(Number(metadata.expectedDisplayTime) - startedAt))
            : null,
        })
      }
      scheduleFrameCallback()
    })
  }
  scheduleFrameCallback()

  return {
    recordAnalyzedFrame({ rgba, width, height, landmarks, pixelMotion }) {
      if (stopped) return
      if (visualSignatures.length < 240) visualSignatures.push(visualSignature(rgba, width, height))
      if (motionPairs.length < 240) {
        motionPairs.push({
          capturedAtMs: Math.max(0, Math.round(performance.now() - startedAt)),
          landmarkMotion: Math.max(0, Number(landmarkMotion(previousLandmarks, landmarks).toFixed(4))),
          pixelMotion: Math.max(0, Number(pixelMotion.toFixed(4))),
        })
      }
      previousLandmarks = landmarks.map((landmark) => ({ x: landmark.x, y: landmark.y }))
    },

    snapshot() {
      const trackEnd = snapshotTrack(track, video)
      eventCounts.settingsChanges = settingsFingerprint(trackStart) === settingsFingerprint(trackEnd) ? 0 : 1
      return {
        secureContext: window.isSecureContext,
        frameCallbacksSupported,
        observedDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        trackStart,
        trackEnd,
        frameCallbacks: [...frameCallbacks],
        visualSignatures: [...visualSignatures],
        motionPairs: [...motionPairs],
        eventCounts: { ...eventCounts },
      }
    },

    stop() {
      if (stopped) return
      stopped = true
      if (callbackHandle !== null && videoWithCallback.cancelVideoFrameCallback) {
        videoWithCallback.cancelVideoFrameCallback(callbackHandle)
      }
      track.removeEventListener("mute", onMute)
      track.removeEventListener("unmute", onUnmute)
      track.removeEventListener("ended", onEnded)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("blur", onBlur)
      window.removeEventListener("focus", onFocus)
    },
  }
}
