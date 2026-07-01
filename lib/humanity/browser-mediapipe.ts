export type NormalizedLandmark = { x: number; y: number; z?: number }

export type MediaPipeFaceSample = {
  facePresent: boolean
  handPresent: boolean
  landmarkCount: number
  handLandmarkCount: number
  centerMotion: number
  confidence: number
  yaw: number
  blinkScore: number
  smileScore: number
  faceLandmarks: NormalizedLandmark[]
  handLandmarks: NormalizedLandmark[]
}

type VisionResult = {
  faceLandmarks?: NormalizedLandmark[][]
  faceBlendshapes?: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>
  landmarks?: NormalizedLandmark[][]
}

type LandmarkDetector = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => VisionResult
  close?: () => void
}

export type MediaPipeFaceSampler = {
  sample: () => MediaPipeFaceSample
  dispose: () => void
}

function categoryScore(result: VisionResult, names: string[]) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? []
  const wanted = new Set(names)
  return categories
    .filter((category) => category.categoryName && wanted.has(category.categoryName))
    .reduce((sum, category) => sum + (category.score ?? 0), 0)
}

function estimateYaw(landmarks: NormalizedLandmark[]) {
  const nose = landmarks[1]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  if (!nose || !leftCheek || !rightCheek) return 0
  const faceWidth = Math.max(0.001, rightCheek.x - leftCheek.x)
  const noseRatio = (nose.x - leftCheek.x) / faceWidth
  return Math.max(-1, Math.min(1, (noseRatio - 0.5) * 2))
}

function estimateCenter(landmarks: NormalizedLandmark[]) {
  if (!landmarks.length) return null
  const center = landmarks.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  )
  center.x /= landmarks.length
  center.y /= landmarks.length
  return center
}

function emptySample(): MediaPipeFaceSample {
  return {
    facePresent: false,
    handPresent: false,
    landmarkCount: 0,
    handLandmarkCount: 0,
    centerMotion: 0,
    confidence: 0,
    yaw: 0,
    blinkScore: 0,
    smileScore: 0,
    faceLandmarks: [],
    handLandmarks: [],
  }
}

export async function createMediaPipeFaceSampler(video: HTMLVideoElement): Promise<MediaPipeFaceSampler> {
  const vision = await import("@mediapipe/tasks-vision")
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  )

  const faceLandmarker = (await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  })) as LandmarkDetector

  const handLandmarker = (await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  })) as LandmarkDetector

  let previousCenter: { x: number; y: number } | null = null

  return {
    sample() {
      const timestamp = performance.now()
      const faceResult = faceLandmarker.detectForVideo(video, timestamp)
      const handResult = handLandmarker.detectForVideo(video, timestamp)
      const faceLandmarks = faceResult.faceLandmarks?.[0] ?? []
      const handLandmarks = handResult.landmarks?.[0] ?? []

      if (!faceLandmarks.length) {
        previousCenter = null
        return { ...emptySample(), handPresent: handLandmarks.length > 0, handLandmarkCount: handLandmarks.length, handLandmarks }
      }

      const center = estimateCenter(faceLandmarks)
      const centerMotion = previousCenter && center
        ? Math.sqrt((center.x - previousCenter.x) ** 2 + (center.y - previousCenter.y) ** 2) * 1200
        : 0
      previousCenter = center

      const eyeBlinkLeft = categoryScore(faceResult, ["eyeBlinkLeft"])
      const eyeBlinkRight = categoryScore(faceResult, ["eyeBlinkRight"])
      const smileScore = categoryScore(faceResult, ["mouthSmileLeft", "mouthSmileRight"])

      return {
        facePresent: true,
        handPresent: handLandmarks.length > 0,
        landmarkCount: faceLandmarks.length,
        handLandmarkCount: handLandmarks.length,
        centerMotion,
        confidence: Math.min(100, 60 + faceLandmarks.length / 4),
        yaw: estimateYaw(faceLandmarks),
        blinkScore: Math.max(eyeBlinkLeft, eyeBlinkRight),
        smileScore,
        faceLandmarks,
        handLandmarks,
      }
    },
    dispose() {
      faceLandmarker.close?.()
      handLandmarker.close?.()
    },
  }
}
