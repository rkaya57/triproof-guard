export type NormalizedLandmark = { x: number; y: number; z?: number }

export type LandmarkConnection = { start: number; end: number }

export type FaceConnectionSets = {
  tessellation: LandmarkConnection[]
  contours: LandmarkConnection[]
  lips: LandmarkConnection[]
  leftEye: LandmarkConnection[]
  rightEye: LandmarkConnection[]
  leftEyebrow: LandmarkConnection[]
  rightEyebrow: LandmarkConnection[]
  leftIris: LandmarkConnection[]
  rightIris: LandmarkConnection[]
}

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
  faceConnections: FaceConnectionSets
  sample: () => MediaPipeFaceSample
  dispose: () => void
}

type FaceConnectionSource = Record<
  | "FACE_LANDMARKS_TESSELATION"
  | "FACE_LANDMARKS_CONTOURS"
  | "FACE_LANDMARKS_LIPS"
  | "FACE_LANDMARKS_LEFT_EYE"
  | "FACE_LANDMARKS_RIGHT_EYE"
  | "FACE_LANDMARKS_LEFT_EYEBROW"
  | "FACE_LANDMARKS_RIGHT_EYEBROW"
  | "FACE_LANDMARKS_LEFT_IRIS"
  | "FACE_LANDMARKS_RIGHT_IRIS",
  Array<{ start: number; end: number }>
>

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function distance(a: NormalizedLandmark | undefined, b: NormalizedLandmark | undefined) {
  if (!a || !b) return 0
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function toConnections(connections: Array<{ start: number; end: number }> | undefined): LandmarkConnection[] {
  return (connections ?? []).map((connection) => ({ start: connection.start, end: connection.end }))
}

function createFaceConnectionSets(faceLandmarker: FaceConnectionSource): FaceConnectionSets {
  return {
    tessellation: toConnections(faceLandmarker.FACE_LANDMARKS_TESSELATION),
    contours: toConnections(faceLandmarker.FACE_LANDMARKS_CONTOURS),
    lips: toConnections(faceLandmarker.FACE_LANDMARKS_LIPS),
    leftEye: toConnections(faceLandmarker.FACE_LANDMARKS_LEFT_EYE),
    rightEye: toConnections(faceLandmarker.FACE_LANDMARKS_RIGHT_EYE),
    leftEyebrow: toConnections(faceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
    rightEyebrow: toConnections(faceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
    leftIris: toConnections(faceLandmarker.FACE_LANDMARKS_LEFT_IRIS),
    rightIris: toConnections(faceLandmarker.FACE_LANDMARKS_RIGHT_IRIS),
  }
}

function categoryScore(result: VisionResult, names: string[]) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? []
  const wanted = new Set(names)
  return Math.max(
    0,
    ...categories
      .filter((category) => category.categoryName && wanted.has(category.categoryName))
      .map((category) => category.score ?? 0)
  )
}

function estimateBlinkFromGeometry(landmarks: NormalizedLandmark[]) {
  const leftRatio = distance(landmarks[159], landmarks[145]) / Math.max(0.001, distance(landmarks[33], landmarks[133]))
  const rightRatio = distance(landmarks[386], landmarks[374]) / Math.max(0.001, distance(landmarks[362], landmarks[263]))
  const eyeRatio = Math.min(leftRatio || 1, rightRatio || 1)
  return clamp01((0.18 - eyeRatio) * 8)
}

function estimateSmileFromGeometry(landmarks: NormalizedLandmark[]) {
  const faceWidth = Math.max(0.001, distance(landmarks[234], landmarks[454]))
  const mouthWidth = distance(landmarks[61], landmarks[291]) / faceWidth
  const mouthOpen = distance(landmarks[13], landmarks[14]) / faceWidth
  return clamp01((mouthWidth - 0.34) * 4 + mouthOpen * 0.55)
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
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  )

  async function createFaceLandmarker(delegate: "GPU" | "CPU") {
    return vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: true,
    })
  }

  async function createHandLandmarker(delegate: "GPU" | "CPU") {
    return vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  }

  const faceLandmarker = (await createFaceLandmarker("GPU").catch(() => createFaceLandmarker("CPU"))) as LandmarkDetector
  const handLandmarker = (await createHandLandmarker("GPU").catch(() => createHandLandmarker("CPU"))) as LandmarkDetector
  const faceConnections = createFaceConnectionSets(vision.FaceLandmarker as unknown as FaceConnectionSource)

  let previousCenter: { x: number; y: number } | null = null

  return {
    faceConnections,
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
      const blendshapeSmileScore = categoryScore(faceResult, ["mouthSmileLeft", "mouthSmileRight"])
      const geometryBlinkScore = estimateBlinkFromGeometry(faceLandmarks)
      const geometrySmileScore = estimateSmileFromGeometry(faceLandmarks)

      return {
        facePresent: true,
        handPresent: handLandmarks.length > 0,
        landmarkCount: faceLandmarks.length,
        handLandmarkCount: handLandmarks.length,
        centerMotion,
        confidence: Math.min(100, 62 + faceLandmarks.length / 4),
        yaw: estimateYaw(faceLandmarks),
        blinkScore: Math.max(eyeBlinkLeft, eyeBlinkRight, geometryBlinkScore),
        smileScore: Math.max(blendshapeSmileScore, geometrySmileScore),
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
