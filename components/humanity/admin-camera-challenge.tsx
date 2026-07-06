"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, RefreshCw, Signature, Video, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { requestBrowserWalletSignature } from "@/lib/humanity/browser-wallet-signature"

type Session = {
  sessionId: string
  nonce: string
  challengeSequence: string[]
  expiresAt: string
  level: string
}

type Result = {
  verificationId: string
  decision: string
  humanSessionScore: number
  reasonCodes: string[]
  proofExpiresAt: string
  signMessage: string
}

type Phase = "idle" | "starting" | "camera" | "running" | "submitting" | "result" | "signing" | "joined" | "error"

type Landmark = { x: number; y: number; z?: number }

type DetectorResult = {
  faceLandmarks?: Landmark[][]
  faceBlendshapes?: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>
  landmarks?: Landmark[][]
}

type FaceDetector = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => DetectorResult
  close?: () => void
}

type HandDetector = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => DetectorResult
  close?: () => void
}

type DetectorBundle = {
  face: FaceDetector
  hand: HandDetector | null
}

type FrameSample = {
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

type LiveSignal = {
  facePresent: boolean
  handPresent: boolean
  confidence: number
  motion: number
  brightness: number
  sharpness: number
  yaw: number
  blinkScore: number
  smileScore: number
  landmarkCount: number
  handLandmarkCount: number
  faceLandmarks: Landmark[]
  handLandmarks: Landmark[]
}

const REQUIRED_STEPS = ["LOOK_CENTER", "TURN_LEFT", "TURN_RIGHT", "BLINK", "RAISE_HAND", "SMILE"]
const STEP_HOLD_MS = 1050
const STEP_TIMEOUT_MS = 18000
const DESKTOP_SAMPLE_MS = 160
const MOBILE_SAMPLE_MS = 240
const UI_UPDATE_MS = 240
const OVERLAY_UPDATE_MS = 130

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

function emptySignal(): LiveSignal {
  return {
    facePresent: false,
    handPresent: false,
    confidence: 0,
    motion: 0,
    brightness: 0,
    sharpness: 0,
    yaw: 0,
    blinkScore: 0,
    smileScore: 0,
    landmarkCount: 0,
    handLandmarkCount: 0,
    faceLandmarks: [],
    handLandmarks: [],
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

function nowMs() {
  return performance.now()
}

function distance(a: Landmark | undefined, b: Landmark | undefined) {
  if (!a || !b) return 0
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function categoryScore(result: DetectorResult, names: string[]) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? []
  const wanted = new Set(names)
  return Math.max(
    0,
    ...categories
      .filter((category) => category.categoryName && wanted.has(category.categoryName))
      .map((category) => category.score ?? 0)
  )
}

function estimateBlink(landmarks: Landmark[], result: DetectorResult) {
  const blendshapeBlink = Math.max(categoryScore(result, ["eyeBlinkLeft"]), categoryScore(result, ["eyeBlinkRight"]))
  const leftRatio = distance(landmarks[159], landmarks[145]) / Math.max(0.001, distance(landmarks[33], landmarks[133]))
  const rightRatio = distance(landmarks[386], landmarks[374]) / Math.max(0.001, distance(landmarks[362], landmarks[263]))
  const geometryBlink = clamp01((0.18 - Math.min(leftRatio || 1, rightRatio || 1)) * 8)
  return Math.max(blendshapeBlink, geometryBlink)
}

function estimateSmile(landmarks: Landmark[], result: DetectorResult) {
  const blendshapeSmile = categoryScore(result, ["mouthSmileLeft", "mouthSmileRight"])
  const faceWidth = Math.max(0.001, distance(landmarks[234], landmarks[454]))
  const mouthWidth = distance(landmarks[61], landmarks[291]) / faceWidth
  const mouthOpen = distance(landmarks[13], landmarks[14]) / faceWidth
  const geometrySmile = clamp01((mouthWidth - 0.34) * 4 + mouthOpen * 0.55)
  return Math.max(blendshapeSmile, geometrySmile)
}

function estimateYaw(landmarks: Landmark[]) {
  const nose = landmarks[1]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  if (!nose || !leftCheek || !rightCheek) return 0
  const faceWidth = Math.max(0.001, rightCheek.x - leftCheek.x)
  const noseRatio = (nose.x - leftCheek.x) / faceWidth
  return Math.max(-1, Math.min(1, (noseRatio - 0.5) * 2))
}

function screenPoint(point: Landmark, width: number, height: number) {
  return { x: (1 - point.x) * width, y: point.y * height }
}

function faceBounds(landmarks: Landmark[], width: number, height: number) {
  if (!landmarks.length) return null
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (const point of landmarks) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const p = screenPoint(point, width, height)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  if (minX >= maxX || minY >= maxY) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function safeSteps(sequence?: string[]) {
  const unique = new Set([...(sequence ?? []), ...REQUIRED_STEPS])
  return REQUIRED_STEPS.filter((step) => unique.has(step))
}

function stepTitle(step?: string) {
  switch (step) {
    case "LOOK_CENTER": return "Yüzünü ortala"
    case "TURN_LEFT": return "Başını sola çevir"
    case "TURN_RIGHT": return "Başını sağa çevir"
    case "BLINK": return "Göz kırp"
    case "RAISE_HAND": return "Elini kaldır"
    case "SMILE": return "Gülümse"
    default: return "Hazır ol"
  }
}

function stepHelp(step?: string) {
  switch (step) {
    case "LOOK_CENTER": return "Yüzün yeşil çerçevenin içinde kalana kadar kameraya düz bak."
    case "TURN_LEFT": return "Başını belirgin şekilde sola çevir ve sabit tut."
    case "TURN_RIGHT": return "Başını belirgin şekilde sağa çevir ve sabit tut."
    case "BLINK": return "Yüzün görünürken net şekilde göz kırp."
    case "RAISE_HAND": return "Elini yüz hizasına kaldır; mor el çizimi görünene kadar tut."
    case "SMILE": return "Kameraya bakıp kısa süre gülümse."
    default: return "Challenge hazırlanıyor."
  }
}

function validateStep(step: string | undefined, signal: LiveSignal) {
  if (!signal.facePresent) return { ok: false, reason: "Yüz bulunamadı" }
  if (signal.landmarkCount < 450) return { ok: false, reason: "Yüz çizimi bekleniyor" }
  if (signal.confidence < 68) return { ok: false, reason: "Yüz güveni düşük: ışığı artır / yaklaş" }

  switch (step) {
    case "LOOK_CENTER": {
      const ok = Math.abs(signal.yaw) < 0.18 && signal.motion < 16
      return ok ? { ok, reason: "Yüz ortalandı" } : { ok, reason: "Yüzünü merkeze al ve sabit tut" }
    }
    case "TURN_LEFT": {
      const ok = signal.yaw < -0.18
      return ok ? { ok, reason: "Sol dönüş algılandı" } : { ok, reason: "Başını daha sola çevir" }
    }
    case "TURN_RIGHT": {
      const ok = signal.yaw > 0.18
      return ok ? { ok, reason: "Sağ dönüş algılandı" } : { ok, reason: "Başını daha sağa çevir" }
    }
    case "BLINK": {
      const ok = signal.blinkScore > 0.22
      return ok ? { ok, reason: "Göz kırpma algılandı" } : { ok, reason: "Göz kırpma bekleniyor" }
    }
    case "RAISE_HAND": {
      const ok = signal.handPresent && signal.handLandmarkCount >= 16
      return ok ? { ok, reason: "El mesh algılandı" } : { ok, reason: "Elini yüz hizasına kaldır; mor el çizimi görünmeli" }
    }
    case "SMILE": {
      const ok = signal.smileScore > 0.22
      return ok ? { ok, reason: "Gülümseme algılandı" } : { ok, reason: "Gülümseme bekleniyor" }
    }
    default:
      return { ok: signal.facePresent, reason: signal.facePresent ? "Sinyal algılandı" : "Sinyal bekleniyor" }
  }
}

function decisionClass(decision?: string) {
  if (decision === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (decision === "MANUAL_REVIEW") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  if (decision === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-primary/30 bg-primary/10 text-cyan-100"
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

async function createDetectors(preferCpu: boolean): Promise<DetectorBundle> {
  const vision = await import("@mediapipe/tasks-vision")
  const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm")
  const createFace = (delegate: "GPU" | "CPU") =>
    vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputFaceBlendshapes: true,
    })
  const createHand = (delegate: "GPU" | "CPU") =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.52,
      minHandPresenceConfidence: 0.52,
      minTrackingConfidence: 0.5,
    })
  const primary = preferCpu ? "CPU" : "GPU"
  const secondary = primary === "GPU" ? "CPU" : "GPU"
  const face = (await createFace(primary).catch(() => createFace(secondary))) as FaceDetector
  const hand = (await createHand(primary).catch(() => createHand(secondary)).catch(() => null)) as HandDetector | null
  return { face, hand }
}

function drawHandMesh(ctx: CanvasRenderingContext2D, landmarks: Landmark[], width: number, height: number) {
  if (!landmarks.length) return
  ctx.save()
  ctx.strokeStyle = "rgba(216,180,254,0.96)"
  ctx.lineWidth = 2.4
  ctx.shadowColor = "rgba(168,85,247,0.85)"
  ctx.shadowBlur = 10
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
    const start = landmarks[startIndex]
    const end = landmarks[endIndex]
    if (!start || !end) continue
    const a = screenPoint(start, width, height)
    const b = screenPoint(end, width, height)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()
  ctx.fillStyle = "rgba(250,245,255,0.98)"
  for (const point of landmarks) {
    const p = screenPoint(point, width, height)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, signal: LiveSignal, progress: number, currentStep?: string) {
  ctx.clearRect(0, 0, width, height)
  const color = signal.facePresent ? "rgba(34,197,94,0.95)" : "rgba(56,189,248,0.95)"

  ctx.save()
  const bounds = faceBounds(signal.faceLandmarks, width, height)
  if (bounds) {
    const pad = Math.max(18, Math.min(bounds.width, bounds.height) * 0.18)
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    roundedRect(ctx, bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2, 22)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.fillStyle = "rgba(224,242,254,0.95)"
    const points = [1, 33, 61, 133, 152, 234, 263, 291, 362, 454]
    for (const index of points) {
      const point = signal.faceLandmarks[index]
      if (!point) continue
      const p = screenPoint(point, width, height)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    const frameW = width * 0.62
    const frameH = height * 0.58
    roundedRect(ctx, (width - frameW) / 2, (height - frameH) / 2, frameW, frameH, 22)
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.stroke()
  }

  drawHandMesh(ctx, signal.handLandmarks, width, height)

  ctx.fillStyle = "rgba(2,6,23,0.72)"
  roundedRect(ctx, 14, 14, Math.min(390, width - 28), 78, 12)
  ctx.fill()
  ctx.fillStyle = "#e0f2fe"
  ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif"
  ctx.fillText(stepTitle(currentStep), 28, 40)
  ctx.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace"
  ctx.fillText(`FACE ${signal.facePresent ? "LOCK" : "WAIT"} · HAND ${signal.handPresent ? "LOCK" : "WAIT"} · YAW ${signal.yaw.toFixed(2)}`, 28, 66)

  const barX = 18
  const barY = height - 30
  const barW = width - 36
  ctx.fillStyle = "rgba(15,23,42,0.88)"
  ctx.fillRect(barX, barY, barW, 8)
  ctx.fillStyle = color
  ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, progress)), 8)
  ctx.restore()
}

export function AdminCameraChallenge({ campaignId, walletAddress, walletChain }: { campaignId: string; walletAddress: string; walletChain: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceDetectorRef = useRef<FaceDetector | null>(null)
  const handDetectorRef = useRef<HandDetector | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const samplesRef = useRef<FrameSample[]>([])
  const timingsRef = useRef<number[]>([])
  const cancelRef = useRef(false)
  const liveSignalRef = useRef<LiveSignal>(emptySignal())
  const lastUiUpdateRef = useRef(0)
  const lastOverlayUpdateRef = useRef(0)

  const [phase, setPhase] = useState<Phase>("idle")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stepReason, setStepReason] = useState("Hazır")
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)
  const [liveSignal, setLiveSignal] = useState<LiveSignal>(() => emptySignal())
  const [compactScan, setCompactScan] = useState(false)
  const [detectorLabel, setDetectorLabel] = useState("Detector idle")

  useEffect(() => {
    function updateMode() {
      const nav = navigator as Navigator & { deviceMemory?: number }
      setCompactScan(window.innerWidth < 768 || navigator.hardwareConcurrency <= 4 || (nav.deviceMemory ?? 8) <= 4)
    }
    updateMode()
    window.addEventListener("resize", updateMode)
    return () => window.removeEventListener("resize", updateMode)
  }, [])

  function stopCamera() {
    cancelRef.current = true
    faceDetectorRef.current?.close?.()
    handDetectorRef.current?.close?.()
    faceDetectorRef.current = null
    handDetectorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => () => stopCamera(), [])

  function updateUi(signal: LiveSignal, currentProgress: number, force = false) {
    const now = nowMs()
    if (force || now - lastUiUpdateRef.current > UI_UPDATE_MS) {
      lastUiUpdateRef.current = now
      setLiveSignal(signal)
      setProgress(currentProgress)
    }
  }

  function paintOverlay(signal: LiveSignal, currentProgress: number, currentStep?: string, force = false) {
    const now = nowMs()
    if (!force && now - lastOverlayUpdateRef.current < OVERLAY_UPDATE_MS) return
    lastOverlayUpdateRef.current = now
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const width = Math.max(280, Math.round(video.clientWidth || video.videoWidth || 360))
    const height = Math.max(360, Math.round(video.clientHeight || video.videoHeight || 480))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    drawOverlay(ctx, width, height, signal, currentProgress, currentStep)
  }

  function sampleFrame(step?: string): FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null
    canvas.width = compactScan ? 72 : 96
    canvas.height = compactScan ? 54 : 72
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let brightnessSum = 0
    let edgeSum = 0
    let motionSum = 0
    const previous = previousPixelsRef.current
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
      brightnessSum += gray
      if (previous) motionSum += Math.abs(gray - previous[i])
      if (i >= 4) edgeSum += Math.abs(gray - (data[i - 4] + data[i - 3] + data[i - 2]) / 3)
    }
    previousPixelsRef.current = new Uint8ClampedArray(data)
    const pixelCount = data.length / 4
    const brightness = brightnessSum / pixelCount
    const sharpness = edgeSum / pixelCount
    const motion = previous ? motionSum / pixelCount : 0

    const faceDetector = faceDetectorRef.current
    const handDetector = handDetectorRef.current
    let faceLandmarks: Landmark[] = []
    let handLandmarks: Landmark[] = []
    let yaw = 0
    let blinkScore = 0
    let smileScore = 0
    if (faceDetector) {
      const detection = faceDetector.detectForVideo(video, nowMs())
      faceLandmarks = detection.faceLandmarks?.[0] ?? []
      yaw = faceLandmarks.length ? estimateYaw(faceLandmarks) : 0
      blinkScore = faceLandmarks.length ? estimateBlink(faceLandmarks, detection) : 0
      smileScore = faceLandmarks.length ? estimateSmile(faceLandmarks, detection) : 0
    }
    if (handDetector && step === "RAISE_HAND") {
      const handDetection = handDetector.detectForVideo(video, nowMs())
      handLandmarks = handDetection.landmarks?.[0] ?? []
    }

    const facePresent = faceLandmarks.length >= 450
    const handPresent = handLandmarks.length >= 16
    const confidence = facePresent ? clamp(72 + Math.min(24, sharpness * 4)) : 0
    const signal: LiveSignal = {
      facePresent,
      handPresent,
      confidence,
      motion,
      brightness,
      sharpness,
      yaw,
      blinkScore,
      smileScore,
      landmarkCount: faceLandmarks.length,
      handLandmarkCount: handLandmarks.length,
      faceLandmarks,
      handLandmarks,
    }
    liveSignalRef.current = signal
    updateUi(signal, progress)
    return {
      brightness,
      sharpness,
      motion,
      facePresent,
      faceConfidence: confidence,
      yaw,
      blinkScore,
      smileScore,
      landmarkCount: faceLandmarks.length,
      handPresent,
      handLandmarkCount: handLandmarks.length,
    }
  }

  async function startSession() {
    if (!campaignId || !walletAddress) {
      setError("campaignId and walletAddress are required")
      return
    }
    setError(null)
    setPhase("starting")
    setResult(null)
    setSignatureStatus(null)
    setStepIndex(0)
    setProgress(0)
    setStepReason("Hazır")
    setDetectorLabel("Detector idle")
    samplesRef.current = []
    timingsRef.current = []
    previousPixelsRef.current = null
    const resetSignal = emptySignal()
    liveSignalRef.current = resetSignal
    setLiveSignal(resetSignal)
    cancelRef.current = false
    try {
      const res = await fetch("/api/humanity/challenge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, walletAddress, walletChain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Could not start camera challenge")
      setSession(data)
      setPhase("camera")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start camera challenge")
      setPhase("error")
    }
  }

  async function allowCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: compactScan ? 480 : 640, max: compactScan ? 640 : 960 },
          height: { ideal: compactScan ? 640 : 480, max: compactScan ? 960 : 720 },
          frameRate: { ideal: compactScan ? 15 : 20, max: compactScan ? 20 : 24 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
        setDetectorLabel("Loading face + hand detectors...")
        const detectors = await createDetectors(compactScan)
        faceDetectorRef.current = detectors.face
        handDetectorRef.current = detectors.hand
        setDetectorLabel(detectors.hand ? "MediaPipe face + hand mesh" : "MediaPipe face / hand fallback")
      }
      await runChallenge()
    } catch (err) {
      setError(err instanceof Error ? `Camera access failed: ${err.message}` : "Camera access failed")
      setPhase("error")
    }
  }

  async function runChallenge() {
    if (!session) return
    setPhase("running")
    const sampleDelay = compactScan ? MOBILE_SAMPLE_MS : DESKTOP_SAMPLE_MS
    const steps = safeSteps(session.challengeSequence)
    for (let i = 0; i < steps.length; i++) {
      if (cancelRef.current) return
      const step = steps[i]
      setStepIndex(i)
      setProgress(0)
      setStepReason(stepHelp(step))
      let validSince: number | null = null
      const challengeStarted = nowMs()
      const stepStarted = nowMs()
      while (!cancelRef.current) {
        const now = nowMs()
        if (now - stepStarted > STEP_TIMEOUT_MS) {
          setError(`${stepTitle(step)} doğrulanamadı. Yüzünü çerçeveye al, ışığı artır ve tekrar dene.`)
          setPhase("error")
          stopCamera()
          return
        }
        const sample = sampleFrame(step)
        if (sample) samplesRef.current.push(sample)
        const validation = validateStep(step, liveSignalRef.current)
        let holdProgress = 0
        if (validation.ok) {
          validSince ??= now
          holdProgress = Math.min(1, (now - validSince) / STEP_HOLD_MS)
        } else {
          validSince = null
        }
        setStepReason(validation.reason)
        updateUi(liveSignalRef.current, holdProgress)
        paintOverlay(liveSignalRef.current, holdProgress, step)
        if (holdProgress >= 1) break
        await new Promise((resolve) => setTimeout(resolve, sampleDelay))
      }
      timingsRef.current.push(Math.round(nowMs() - challengeStarted))
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    await submitDerivedScores()
  }

  async function submitDerivedScores() {
    if (!session) return
    setPhase("submitting")
    stopCamera()
    const samples = samplesRef.current
    const brightnessAvg = average(samples.map((sample) => sample.brightness), 80)
    const sharpnessAvg = average(samples.map((sample) => sample.sharpness), 6)
    const motionAvg = average(samples.map((sample) => sample.motion), 8)
    const faceConfidenceAvg = average(samples.map((sample) => sample.faceConfidence), 55)
    const faceSeenCount = samples.filter((sample) => sample.facePresent).length
    const handSeenCount = samples.filter((sample) => sample.handPresent).length
    const motionPeak = Math.max(0, ...samples.map((sample) => sample.motion))
    const yawRange = Math.max(0, ...samples.map((sample) => sample.yaw)) - Math.min(0, ...samples.map((sample) => sample.yaw))
    const blinkMax = Math.max(0, ...samples.map((sample) => sample.blinkScore))
    const smileMax = Math.max(0, ...samples.map((sample) => sample.smileScore))
    const detectorQuality = faceSeenCount >= 16 && samples.some((sample) => sample.landmarkCount >= 450)
    const scores = {
      facePresenceScore: clamp(detectorQuality ? faceConfidenceAvg : 30),
      headPoseScore: clamp(detectorQuality ? 55 + yawRange * 130 : 30),
      eyeBlinkScore: clamp(detectorQuality ? blinkMax * 145 : 30),
      handGestureScore: clamp(handSeenCount >= 4 ? 92 : motionPeak > 20 ? 58 : 30),
      motionTimingScore: clamp(detectorQuality ? 70 + Math.min(20, motionAvg * 2) : 35),
      frameConsistencyScore: clamp(detectorQuality ? 88 - Math.abs(110 - brightnessAvg) * 0.18 : 35),
      replayRiskScore: clamp(detectorQuality ? Math.max(5, 42 - motionAvg - yawRange * 40 - smileMax * 10) : 72),
      injectionRiskScore: clamp(detectorQuality && samples.length >= 35 && handSeenCount >= 4 ? 10 : 68),
    }
    try {
      const res = await fetch("/api/humanity/challenge/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          walletAddress,
          walletChain,
          scores,
          clientMetadata: {
            detector: compactScan ? "mediapipe_face_hand_lite_mobile" : "mediapipe_face_hand_lite_desktop",
            stepTimingsMs: timingsRef.current,
            sampleCount: samples.length,
            faceSeenCount,
            handSeenCount,
            avgBrightness: Math.round(brightnessAvg),
            avgMotion: Math.round(motionAvg),
            yawRange: Number(yawRange.toFixed(3)),
            maxBlinkScore: Math.round(blinkMax * 100),
            maxSmileScore: Math.round(smileMax * 100),
            rawVideoUploaded: false,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Camera challenge submission failed")
      setResult(data)
      setPhase("result")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Camera challenge submission failed")
      setPhase("error")
    }
  }

  async function signWithWallet() {
    if (!result) return
    setPhase("signing")
    setSignatureStatus(null)
    setError(null)
    try {
      const walletSignature = await requestBrowserWalletSignature({ walletChain, walletAddress, message: result.signMessage })
      const res = await fetch("/api/humanity/challenge/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: result.verificationId, walletAddress, walletChain, signedMessage: result.signMessage, signature: walletSignature.signature }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Signature step failed")
      setSignatureStatus(data.signatureVerified ? `Cryptographic signature verified via ${data.verificationMethod}.` : `Signature saved but not verified${data.error ? `: ${data.error}` : "."}`)
      setPhase("joined")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature step failed")
      setPhase("error")
    }
  }

  function reset() {
    stopCamera()
    setPhase("idle")
    setSession(null)
    setResult(null)
    setError(null)
    setStepIndex(0)
    setProgress(0)
    setStepReason("Hazır")
    setSignatureStatus(null)
    setDetectorLabel("Detector idle")
    samplesRef.current = []
    timingsRef.current = []
    previousPixelsRef.current = null
    const resetSignal = emptySignal()
    liveSignalRef.current = resetSignal
    setLiveSignal(resetSignal)
    const overlay = overlayCanvasRef.current
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
  }

  const steps = safeSteps(session?.challengeSequence)
  const currentStep = steps[stepIndex]

  return (
    <div className="glass-panel premium-card animated-border rounded-3xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">Face + hand liveness scan</Badge>
            <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Strict steps</Badge>
            <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">{detectorLabel}</Badge>
            {compactScan && <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">Mobile portrait</Badge>}
            {phase === "running" && <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Step {stepIndex + 1}/{steps.length}</Badge>}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Humanity Scan</h2>
          <p className="mt-1 text-sm text-slate-300">Yüz, baş çevirme, göz kırpma, mor el mesh ve gülümseme adımları geçmeden onay vermez.</p>
        </div>
        <Video className="text-primary" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><XCircle className="mr-2 inline size-4" />{error}</div>}

      {(phase === "camera" || phase === "running" || phase === "submitting") && (
        <div className="grid gap-3">
          <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-primary/30 bg-black shadow-[0_0_40px_rgba(56,189,248,0.10)]" style={{ aspectRatio: compactScan ? "3 / 4" : "4 / 3" }}>
            <video ref={videoRef} playsInline muted className="size-full -scale-x-100 bg-black object-contain" />
            <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 size-full" />
            <canvas ref={sampleCanvasRef} className="hidden" />
          </div>
          <div className="rounded-xl border border-primary/25 bg-black/60 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold text-white">{phase === "running" ? stepTitle(currentStep) : phase === "submitting" ? "Submitting verified signals" : "Camera ready"}</p>
                <p className="text-slate-300">{phase === "running" ? stepHelp(currentStep) : stepReason}</p>
              </div>
              <span className="font-mono text-cyan-200">Face {liveSignal.facePresent ? "LOCK" : "WAIT"} / Hand {liveSignal.handPresent ? "LOCK" : "WAIT"}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-300"><span>Status: {stepReason}</span><span>Confidence: {Math.round(liveSignal.confidence)}%</span><span>Hand points: {liveSignal.handLandmarkCount}</span><span>Blink: {Math.round(liveSignal.blinkScore * 100)}%</span><span>Smile: {Math.round(liveSignal.smileScore * 100)}%</span></div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {phase === "idle" && <button onClick={startSession} className={`${buttonVariants()} glow-primary`}><Camera data-icon="inline-start" /> Start real humanity scan</button>}
        {phase === "starting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Creating secure challenge...</p>}
        {phase === "camera" && <button onClick={allowCamera} className={buttonVariants({ variant: "outline" })}>Allow camera and begin scan</button>}
        {phase === "running" && <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-slate-300">Acele etme. Her adım ayrı doğrulanır; el adımında mor el mesh görünmeden geçmez.</p>}
        {phase === "submitting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Submitting liveness evidence...</p>}
        {phase === "result" && result && (
          <div className={`rounded-2xl border p-4 ${decisionClass(result.decision)}`}>
            <p className="font-semibold text-white">Result: {result.decision.replace("_", " ")} / Score {Math.round(result.humanSessionScore)}</p>
            <p className="mt-2 font-mono text-xs text-slate-200">{JSON.stringify(result.reasonCodes)}</p>
            {result.decision === "APPROVED" && <button onClick={signWithWallet} className={`${buttonVariants()} mt-4`}><Signature data-icon="inline-start" /> Continue / Sign wallet</button>}
            {result.decision !== "APPROVED" && <button onClick={reset} className={`${buttonVariants({ variant: "outline" })} mt-4`}><RefreshCw data-icon="inline-start" /> Try again</button>}
          </div>
        )}
        {phase === "signing" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Awaiting wallet signature...</p>}
        {phase === "joined" && <div className="rounded-xl border border-green-400/30 bg-green-400/10 p-4 text-green-200"><CheckCircle2 className="mr-2 inline size-4" /> Joined sandbox campaign. {signatureStatus}</div>}
        {phase !== "idle" && <button onClick={reset} className={buttonVariants({ variant: "outline" })}>Reset humanity scan</button>}
      </div>
    </div>
  )
}
