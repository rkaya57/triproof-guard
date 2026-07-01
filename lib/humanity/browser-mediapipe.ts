export type MediaPipeFaceSample = {
  facePresent: boolean
  landmarkCount: number
  centerMotion: number
  confidence: number
}

type FaceLandmarkerInstance = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => {
    faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>
  }
  close?: () => void
}

export type MediaPipeFaceSampler = {
  sample: () => MediaPipeFaceSample
  dispose: () => void
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
  })) as FaceLandmarkerInstance

  let previousCenter: { x: number; y: number } | null = null

  return {
    sample() {
      const result = faceLandmarker.detectForVideo(video, performance.now())
      const landmarks = result.faceLandmarks?.[0] ?? []
      if (!landmarks.length) {
        previousCenter = null
        return {
          facePresent: false,
          landmarkCount: 0,
          centerMotion: 0,
          confidence: 0,
        }
      }

      const center = landmarks.reduce(
        (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
        { x: 0, y: 0 }
      )
      center.x /= landmarks.length
      center.y /= landmarks.length

      const centerMotion = previousCenter
        ? Math.sqrt((center.x - previousCenter.x) ** 2 + (center.y - previousCenter.y) ** 2) * 1200
        : 0
      previousCenter = center

      return {
        facePresent: true,
        landmarkCount: landmarks.length,
        centerMotion,
        confidence: Math.min(100, 55 + landmarks.length / 4),
      }
    },
    dispose() {
      faceLandmarker.close?.()
    },
  }
}
