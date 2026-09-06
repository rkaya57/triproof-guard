"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Signature, Video, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  deriveHumanityV2ClientTelemetry,
  type HumanityV2ClientStep,
  type HumanityV2ClientStepEvidence,
  type HumanityV2FrameSample,
} from "@/lib/humanity/v2/client-telemetry"
import { requestHumanityV2WalletSignature } from "@/lib/humanity/v2/browser-wallet-signature"

type CampaignOption = {
  id: string
  name: string
  slug: string
  challengeLevel: string
  enabled: boolean
}

type Session = {
  sessionId: string
  nonce: string
  challengeSequence: HumanityV2ClientStep[]
  expiresAt: string
  level: string
  attemptsUsed: number
  attemptsRemaining: number
  trustMode: string
}

type Result = {
  verificationId: string
  decision: "APPROVED" | "MANUAL_REVIEW" | "REJECTED"
  humanSessionScore: number
  reasonCodes: string[]
  proofExpiresAt: string
  proofMessage: string
  signatureRequired: boolean
  trustMode: string
}

type Phase = "idle" | "starting" | "camera" | "running" | "submitting" | "result" | "signing" | "signed" | "error"

type Landmark = { x: number; y: number; z?: number }
type DetectorResult = {
  faceLandmarks?: Landmark[][]
  faceBlendshapes?: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>
  landmarks?: Landmark[][]
}
type FaceDetector = { detectForVideo: (video: HTMLVideoElement, timestampMs: number) => DetectorResult; close?: () => void }
type HandDetector = { detectForVideo: (video: HTMLVideoElement, timestampMs: number) => DetectorResult; close?: () => void }
type DetectorBundle = { face: FaceDetector; hand: HandDetector | null }
type VisionFileset = unknown
type VisionModule = {
  FilesetResolver: { forVisionTasks: (path: string) => Promise<VisionFileset> }
  FaceLandmarker: { createFromOptions: (fileset: VisionFileset, options: object) => Promise<FaceDetector> }
  HandLandmarker: { createFromOptions: (fileset: VisionFileset, options: object) => Promise<HandDetector> }
}
type LiveSignal = HumanityV2FrameSample & { faceLandmarks: Landmark[]; handLandmarks: Landmark[] }

const VISION_MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm"
const VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
const STEP_TIMEOUT_MS = 18_000
const DESKTOP_SAMPLE_MS = 160
const MOBILE_SAMPLE_MS = 230
const UI_UPDATE_MS = 220
const OVERLAY_UPDATE_MS = 120
const ALLOWED_STEPS = new Set<HumanityV2ClientStep>(["LOOK_CENTER", "TURN_LEFT", "TURN_RIGHT", "BLINK", "RAISE_HAND", "SMILE"])
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
] as const

function emptySignal(): LiveSignal {
  return {
    brightness: 0,
    sharpness: 0,
    motion: 0,
    facePresent: false,
    faceConfidence: 0,
    yaw: 0,
    blinkScore: 0,
    smileScore: 0,
    landmarkCount: 0,
    handPresent: false,
    handLandmarkCount: 0,
    faceLandmarks: [],
    handLandmarks: [],
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
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
  return Math.max(0, ...categories.filter((item) => item.categoryName && wanted.has(item.categoryName)).map((item) => item.score ?? 0))
}

function estimateBlink(landmarks: Landmark[], result: DetectorResult) {
  const blendshape = Math.max(categoryScore(result, ["eyeBlinkLeft"]), categoryScore(result, ["eyeBlinkRight"]))
  const leftRatio = distance(landmarks[159], landmarks[145]) / Math.max(0.001, distance(landmarks[33], landmarks[133]))
  const rightRatio = distance(landmarks[386], landmarks[374]) / Math.max(0.001, distance(landmarks[362], landmarks[263]))
  const geometry = Math.max(0, Math.min(1, (0.18 - Math.min(leftRatio || 1, rightRatio || 1)) * 8))
  return Math.max(blendshape, geometry)
}

function estimateSmile(landmarks: Landmark[], result: DetectorResult) {
  const blendshape = categoryScore(result, ["mouthSmileLeft", "mouthSmileRight"])
  const faceWidth = Math.max(0.001, distance(landmarks[234], landmarks[454]))
  const mouthWidth = distance(landmarks[61], landmarks[291]) / faceWidth
  const mouthOpen = distance(landmarks[13], landmarks[14]) / faceWidth
  const geometry = Math.max(0, Math.min(1, (mouthWidth - 0.34) * 4 + mouthOpen * 0.55))
  return Math.max(blendshape, geometry)
}

function estimateYaw(landmarks: Landmark[]) {
  const nose = landmarks[1]
  const leftCheek = landmarks[234]
  const rightCheek = landmarks[454]
  if (!nose || !leftCheek || !rightCheek) return 0
  const faceWidth = Math.max(0.001, rightCheek.x - leftCheek.x)
  return Math.max(-1, Math.min(1, ((nose.x - leftCheek.x) / faceWidth - 0.5) * 2))
}

function stepTitle(step?: HumanityV2ClientStep) {
  switch (step) {
    case "LOOK_CENTER": return "Center your face"
    case "TURN_LEFT": return "Turn your head left"
    case "TURN_RIGHT": return "Turn your head right"
    case "BLINK": return "Blink once"
    case "RAISE_HAND": return "Raise one hand"
    case "SMILE": return "Smile"
    default: return "Ready"
  }
}

function stepHelp(step?: HumanityV2ClientStep) {
  switch (step) {
    case "LOOK_CENTER": return "Look directly into the camera and keep your face steady."
    case "TURN_LEFT": return "Turn clearly to your left and hold the pose."
    case "TURN_RIGHT": return "Turn clearly to your right and hold the pose."
    case "BLINK": return "Blink naturally once while your face remains inside the frame."
    case "RAISE_HAND": return "Raise a hand near face height until the hand mesh appears."
    case "SMILE": return "Smile naturally and hold it briefly."
    default: return "The server will issue the exact challenge sequence."
  }
}

function targetHoldMs(step: HumanityV2ClientStep) {
  if (step === "BLINK") return 300
  if (step === "RAISE_HAND" || step === "SMILE") return 650
  return 700
}

function validateContinuousStep(step: HumanityV2ClientStep, signal: LiveSignal, blinkLatched: boolean) {
  if (!signal.facePresent || signal.landmarkCount < 450) return { ok: false, reason: "Face mesh not locked" }
  if (signal.faceConfidence < 62) return { ok: false, reason: "Face signal is weak; improve lighting or move closer" }

  switch (step) {
    case "LOOK_CENTER": {
      const ok = Math.abs(signal.yaw) < 0.18 && signal.motion < 18
      return { ok, reason: ok ? "Centered and stable" : "Center your face and hold still" }
    }
    case "TURN_LEFT": {
      const ok = signal.yaw < -0.18
      return { ok, reason: ok ? "Left turn detected" : "Turn farther left" }
    }
    case "TURN_RIGHT": {
      const ok = signal.yaw > 0.18
      return { ok, reason: ok ? "Right turn detected" : "Turn farther right" }
    }
    case "BLINK": return { ok: blinkLatched, reason: blinkLatched ? "Blink event captured" : "Waiting for a blink" }
    case "RAISE_HAND": {
      const ok = signal.handPresent && signal.handLandmarkCount >= 16
      return { ok, reason: ok ? "Hand mesh detected" : "Raise your hand until the hand mesh appears" }
    }
    case "SMILE": {
      const ok = signal.smileScore > 0.22
      return { ok, reason: ok ? "Smile detected" : "Smile a little more clearly" }
    }
  }
}

function screenPoint(point: Landmark, width: number, height: number) {
  return { x: (1 - point.x) * width, y: point.y * height }
}

function drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, signal: LiveSignal, progress: number, step?: HumanityV2ClientStep) {
  ctx.clearRect(0, 0, width, height)
  const accent = signal.facePresent ? "rgba(52,211,153,0.96)" : "rgba(34,211,238,0.92)"
  ctx.save()
  ctx.strokeStyle = accent
  ctx.fillStyle = "rgba(224,242,254,0.96)"
  ctx.lineWidth = 2.2
  ctx.shadowColor = accent
  ctx.shadowBlur = 8
  const facePoints = [1, 33, 61, 133, 152, 234, 263, 291, 362, 454]
  for (const index of facePoints) {
    const point = signal.faceLandmarks[index]
    if (!point) continue
    const p = screenPoint(point, width, height)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.shadowBlur = 6
  ctx.strokeStyle = "rgba(216,180,254,0.96)"
  ctx.beginPath()
  for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
    const start = signal.handLandmarks[startIndex]
    const end = signal.handLandmarks[endIndex]
    if (!start || !end) continue
    const a = screenPoint(start, width, height)
    const b = screenPoint(end, width, height)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = "rgba(2,6,23,0.78)"
  ctx.fillRect(14, 14, Math.min(410, width - 28), 72)
  ctx.fillStyle = "#e0f2fe"
  ctx.font = "700 13px ui-sans-serif, system-ui"
  ctx.fillText(stepTitle(step), 28, 40)
  ctx.font = "500 12px ui-monospace, monospace"
  ctx.fillText(`FACE ${signal.facePresent ? "LOCK" : "WAIT"} · HAND ${signal.handPresent ? "LOCK" : "WAIT"} · YAW ${signal.yaw.toFixed(2)}`, 28, 64)
  const barX = 18
  const barY = height - 28
  const barW = width - 36
  ctx.fillStyle = "rgba(15,23,42,0.9)"
  ctx.fillRect(barX, barY, barW, 8)
  ctx.fillStyle = accent
  ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, progress)), 8)
  ctx.restore()
}

async function createDetectors(preferCpu: boolean): Promise<DetectorBundle> {
  const moduleUrl = VISION_MODULE_URL
  const vision = (await import(/* webpackIgnore: true */ moduleUrl)) as unknown as VisionModule
  const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM_URL)
  const primary = preferCpu ? "CPU" : "GPU"
  const secondary = primary === "GPU" ? "CPU" : "GPU"
  const faceOptions = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputFaceBlendshapes: true,
  })
  const handOptions = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.52,
    minHandPresenceConfidence: 0.52,
    minTrackingConfidence: 0.5,
  })
  const face = await vision.FaceLandmarker.createFromOptions(fileset, faceOptions(primary)).catch(() =>
    vision.FaceLandmarker.createFromOptions(fileset, faceOptions(secondary))
  )
  const hand = await vision.HandLandmarker.createFromOptions(fileset, handOptions(primary)).catch(() =>
    vision.HandLandmarker.createFromOptions(fileset, handOptions(secondary))
  ).catch(() => null)
  return { face, hand }
}

function decisionClass(decision?: string) {
  if (decision === "APPROVED") return "border-emerald-300/25 bg-emerald-300/[0.05] text-emerald-100"
  if (decision === "REJECTED") return "border-rose-300/25 bg-rose-300/[0.05] text-rose-100"
  return "border-amber-300/25 bg-amber-300/[0.05] text-amber-100"
}

export function HumanityV2AdminCameraSandbox({ campaigns }: { campaigns: CampaignOption[] }) {
  const enabledCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.enabled), [campaigns])
  const [campaignId, setCampaignId] = useState(enabledCampaigns[0]?.id ?? "")
  const [walletChain, setWalletChain] = useState("solana")
  const [walletAddress, setWalletAddress] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stepReason, setStepReason] = useState("Ready")
  const [detectorLabel, setDetectorLabel] = useState("Detector idle")
  const [liveSignal, setLiveSignal] = useState<LiveSignal>(() => emptySignal())
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)
  const [compactScan, setCompactScan] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceDetectorRef = useRef<FaceDetector | null>(null)
  const handDetectorRef = useRef<HandDetector | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const samplesRef = useRef<HumanityV2FrameSample[]>([])
  const evidenceRef = useRef<HumanityV2ClientStepEvidence[]>([])
  const liveSignalRef = useRef<LiveSignal>(emptySignal())
  const cancelRef = useRef(false)
  const lastUiUpdateRef = useRef(0)
  const lastOverlayUpdateRef = useRef(0)

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

  function resetEvidence() {
    samplesRef.current = []
    evidenceRef.current = []
    previousPixelsRef.current = null
    liveSignalRef.current = emptySignal()
    setLiveSignal(emptySignal())
    setStepIndex(0)
    setProgress(0)
    setStepReason("Ready")
  }

  function updateSignalUi(signal: LiveSignal, force = false) {
    const now = nowMs()
    if (force || now - lastUiUpdateRef.current >= UI_UPDATE_MS) {
      lastUiUpdateRef.current = now
      setLiveSignal(signal)
    }
  }

  function paintOverlay(signal: LiveSignal, currentProgress: number, step?: HumanityV2ClientStep, force = false) {
    const now = nowMs()
    if (!force && now - lastOverlayUpdateRef.current < OVERLAY_UPDATE_MS) return
    lastOverlayUpdateRef.current = now
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const width = Math.max(280, Math.round(video.clientWidth || video.videoWidth || 360))
    const height = Math.max(320, Math.round(video.clientHeight || video.videoHeight || 480))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext("2d")
    if (ctx) drawOverlay(ctx, width, height, signal, currentProgress, step)
  }

  function sampleFrame(step?: HumanityV2ClientStep): HumanityV2FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null
    canvas.width = compactScan ? 72 : 96
    canvas.height = compactScan ? 54 : 72
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const previous = previousPixelsRef.current
    let brightnessSum = 0
    let sharpnessSum = 0
    let motionSum = 0
    for (let index = 0; index < data.length; index += 4) {
      const gray = (data[index] + data[index + 1] + data[index + 2]) / 3
      brightnessSum += gray
      if (previous) motionSum += Math.abs(gray - previous[index])
      if (index >= 4) sharpnessSum += Math.abs(gray - (data[index - 4] + data[index - 3] + data[index - 2]) / 3)
    }
    previousPixelsRef.current = new Uint8ClampedArray(data)
    const pixelCount = data.length / 4
    const brightness = brightnessSum / pixelCount
    const sharpness = sharpnessSum / pixelCount
    const motion = previous ? motionSum / pixelCount : 0

    let faceLandmarks: Landmark[] = []
    let handLandmarks: Landmark[] = []
    let yaw = 0
    let blinkScore = 0
    let smileScore = 0
    const timestamp = nowMs()
    const faceDetector = faceDetectorRef.current
    if (faceDetector) {
      const detection = faceDetector.detectForVideo(video, timestamp)
      faceLandmarks = detection.faceLandmarks?.[0] ?? []
      if (faceLandmarks.length) {
        yaw = estimateYaw(faceLandmarks)
        blinkScore = estimateBlink(faceLandmarks, detection)
        smileScore = estimateSmile(faceLandmarks, detection)
      }
    }
    if (step === "RAISE_HAND" && handDetectorRef.current) {
      handLandmarks = handDetectorRef.current.detectForVideo(video, timestamp).landmarks?.[0] ?? []
    }

    const facePresent = faceLandmarks.length >= 450
    const handPresent = handLandmarks.length >= 16
    const faceConfidence = facePresent ? clamp(70 + Math.min(26, sharpness * 4)) : 0
    const sample: HumanityV2FrameSample = {
      brightness,
      sharpness,
      motion,
      facePresent,
      faceConfidence,
      yaw,
      blinkScore,
      smileScore,
      landmarkCount: faceLandmarks.length,
      handPresent,
      handLandmarkCount: handLandmarks.length,
    }
    const signal: LiveSignal = { ...sample, faceLandmarks, handLandmarks }
    liveSignalRef.current = signal
    updateSignalUi(signal)
    return sample
  }

  async function startSession() {
    if (!campaignId || !walletAddress.trim()) {
      setError("Select an enabled campaign and enter a wallet address")
      return
    }
    setError(null)
    setResult(null)
    setSignatureStatus(null)
    resetEvidence()
    setPhase("starting")
    try {
      const response = await fetch("/api/humanity/v2/challenge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, walletAddress: walletAddress.trim(), walletChain }),
      })
      const data = await response.json() as Session & { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not start Humanity V2 challenge")
      if (!Array.isArray(data.challengeSequence) || data.challengeSequence.some((step) => !ALLOWED_STEPS.has(step))) {
        throw new Error("Server returned an invalid Humanity V2 challenge sequence")
      }
      setSession(data)
      setPhase("camera")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Humanity V2 challenge")
      setPhase("error")
    }
  }

  async function allowCameraAndRun() {
    if (!session) return
    setError(null)
    cancelRef.current = false
    resetEvidence()
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API is unavailable in this browser")
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: compactScan ? 480 : 640, max: 960 },
          height: { ideal: compactScan ? 640 : 480, max: 960 },
          frameRate: { ideal: compactScan ? 15 : 20, max: 24 },
        },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error("Camera preview is not mounted")
      video.srcObject = stream
      await video.play()
      setDetectorLabel("Loading MediaPipe face + hand detectors…")
      const detectors = await createDetectors(compactScan)
      faceDetectorRef.current = detectors.face
      handDetectorRef.current = detectors.hand
      setDetectorLabel(detectors.hand ? "MediaPipe face + hand" : "MediaPipe face / hand unavailable")
      await runChallenge(session)
    } catch (cause) {
      stopCamera()
      setError(cause instanceof Error ? `Camera challenge failed: ${cause.message}` : "Camera challenge failed")
      setPhase("error")
    }
  }

  async function runChallenge(activeSession: Session) {
    setPhase("running")
    const sampleDelay = compactScan ? MOBILE_SAMPLE_MS : DESKTOP_SAMPLE_MS
    const challengeStartedAt = nowMs()
    for (let index = 0; index < activeSession.challengeSequence.length; index += 1) {
      if (cancelRef.current) return
      const step = activeSession.challengeSequence[index]
      setStepIndex(index)
      setProgress(0)
      setStepReason(stepHelp(step))
      let validSince: number | null = null
      let blinkLatched = false
      const stepStartedAt = nowMs()
      const holdTarget = targetHoldMs(step)

      while (!cancelRef.current) {
        const now = nowMs()
        if (now - stepStartedAt > STEP_TIMEOUT_MS) {
          throw new Error(`${stepTitle(step)} timed out. Improve lighting and retry the same server challenge.`)
        }
        const sample = sampleFrame(step)
        if (sample) samplesRef.current.push(sample)
        if (step === "BLINK" && liveSignalRef.current.blinkScore > 0.28) blinkLatched = true
        const validation = validateContinuousStep(step, liveSignalRef.current, blinkLatched)
        if (validation.ok) validSince ??= now
        else validSince = null
        const heldForMs = validSince === null ? 0 : now - validSince
        const currentProgress = Math.min(1, heldForMs / holdTarget)
        setProgress(currentProgress)
        setStepReason(validation.reason)
        paintOverlay(liveSignalRef.current, currentProgress, step)
        if (currentProgress >= 1) {
          evidenceRef.current.push({
            step,
            capturedAtMs: Math.round(nowMs() - challengeStartedAt),
            heldForMs: Math.max(250, Math.round(heldForMs)),
          })
          break
        }
        await new Promise((resolve) => setTimeout(resolve, sampleDelay))
      }
      await new Promise((resolve) => setTimeout(resolve, 180))
    }
    await submitEvidence(activeSession)
  }

  async function submitEvidence(activeSession: Session) {
    setPhase("submitting")
    stopCamera()
    const derived = deriveHumanityV2ClientTelemetry({
      samples: samplesRef.current,
      evidence: evidenceRef.current,
      challengeSequence: activeSession.challengeSequence,
      secureContext: window.isSecureContext,
    })
    const response = await fetch("/api/humanity/v2/challenge/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: activeSession.sessionId,
        walletAddress: walletAddress.trim(),
        walletChain,
        scores: derived.scores,
        stepEvidence: evidenceRef.current,
      }),
    })
    const data = await response.json() as Result & { error?: string; reasonCodes?: string[] }
    if (!response.ok) {
      const detail = data.reasonCodes?.length ? ` (${data.reasonCodes.join(", ")})` : ""
      throw new Error(`${data.error ?? "Humanity V2 submission failed"}${detail}`)
    }
    setResult(data)
    setPhase("result")
  }

  async function signProof() {
    if (!result) return
    setError(null)
    setSignatureStatus(null)
    setPhase("signing")
    try {
      const signed = await requestHumanityV2WalletSignature({
        walletChain,
        walletAddress: walletAddress.trim(),
        message: result.proofMessage,
      })
      const response = await fetch("/api/humanity/v2/challenge/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId: result.verificationId,
          walletAddress: walletAddress.trim(),
          walletChain,
          signature: signed.signature,
        }),
      })
      const data = await response.json() as { error?: string; signatureVerified?: boolean; verificationMethod?: string }
      if (!response.ok) throw new Error(data.error ?? "Wallet signature verification failed")
      if (!data.signatureVerified) throw new Error(data.error ?? "Wallet signature did not verify")
      setSignatureStatus(`Verified with ${data.verificationMethod ?? signed.provider}. The decision remains ${result.decision}.`)
      setPhase("signed")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet signature failed")
      setPhase("result")
    }
  }

  function retrySameSession() {
    stopCamera()
    resetEvidence()
    setError(null)
    setPhase(session ? "camera" : "idle")
  }

  function clearCompletedRun() {
    stopCamera()
    resetEvidence()
    setSession(null)
    setResult(null)
    setError(null)
    setSignatureStatus(null)
    setDetectorLabel("Detector idle")
    setPhase("idle")
  }

  const currentStep = session?.challengeSequence[stepIndex]
  const challengeSummary = session?.challengeSequence.map(stepTitle).join(" → ")

  if (!enabledCampaigns.length) {
    return (
      <div className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.035] p-6 text-sm text-amber-100">
        <ShieldAlert className="mr-2 inline size-4" /> Create and enable a Humanity V2 campaign before using the camera sandbox.
      </div>
    )
  }

  return (
    <section className="rounded-3xl border border-cyan-300/15 bg-slate-950/45 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-cyan-300/20 text-cyan-100">Admin-only camera sandbox</Badge>
            <Badge variant="outline" className="border-amber-300/20 text-amber-100">Review-only telemetry</Badge>
            <Badge variant="outline" className="border-violet-300/20 text-violet-100">{detectorLabel}</Badge>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-white">Live Humanity V2 challenge</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">The camera follows the exact server-issued sequence. No raw video is uploaded; only derived telemetry and ordered step evidence are submitted.</p>
        </div>
        <Video className="size-5 text-cyan-300" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <label className="grid gap-2 text-xs text-slate-400">
          Campaign
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} disabled={phase !== "idle"} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300/40">
            {enabledCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.challengeLevel}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-xs text-slate-400">
          Chain
          <select value={walletChain} onChange={(event) => setWalletChain(event.target.value)} disabled={phase !== "idle"} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300/40">
            <option value="solana">Solana</option>
            <option value="evm">EVM</option>
          </select>
        </label>
        <label className="grid gap-2 text-xs text-slate-400">
          Wallet address
          <input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} disabled={phase !== "idle"} placeholder={walletChain === "solana" ? "Solana public key" : "0x…"} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
        </label>
      </div>

      {session ? (
        <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-6 text-slate-400">
          <span className="text-slate-200">Issued sequence:</span> {challengeSummary}<br />
          Session expires {new Date(session.expiresAt).toLocaleString()} · attempts remaining {session.attemptsRemaining} · {session.trustMode}
        </div>
      ) : null}

      {error ? <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] p-4 text-sm text-rose-100"><XCircle className="mr-2 inline size-4" />{error}</div> : null}

      {(phase === "camera" || phase === "running" || phase === "submitting" || phase === "error") && session ? (
        <div className="mt-5 grid gap-4">
          <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-cyan-300/20 bg-black" style={{ aspectRatio: compactScan ? "3 / 4" : "4 / 3" }}>
            <video ref={videoRef} playsInline muted className="size-full -scale-x-100 bg-black object-contain" />
            <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 size-full" />
            <canvas ref={sampleCanvasRef} className="hidden" />
          </div>
          <div className="rounded-2xl border border-white/[0.07] bg-slate-950/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-medium text-white">{phase === "running" ? stepTitle(currentStep) : phase === "submitting" ? "Submitting evidence" : "Camera ready"}</p><p className="mt-1 text-sm text-slate-400">{phase === "running" ? stepHelp(currentStep) : stepReason}</p></div>
              <span className="font-mono text-xs text-cyan-200">FACE {liveSignal.facePresent ? "LOCK" : "WAIT"} · HAND {liveSignal.handPresent ? "LOCK" : "WAIT"}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>Step {Math.min(stepIndex + 1, session.challengeSequence.length)}/{session.challengeSequence.length}</span><span>Confidence {Math.round(liveSignal.faceConfidence)}%</span><span>Yaw {liveSignal.yaw.toFixed(2)}</span><span>Blink {Math.round(liveSignal.blinkScore * 100)}%</span><span>Smile {Math.round(liveSignal.smileScore * 100)}%</span></div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className={`mt-5 rounded-2xl border p-4 ${decisionClass(result.decision)}`}>
          <p className="font-semibold text-white">Decision: {result.decision} · score {Math.round(result.humanSessionScore)}</p>
          <p className="mt-2 text-sm leading-6">{result.reasonCodes.join(" · ")}</p>
          <p className="mt-2 text-xs text-slate-400">Signing proves wallet control only; it does not upgrade a MANUAL_REVIEW result to APPROVED.</p>
          {signatureStatus ? <p className="mt-3 text-sm text-emerald-200"><CheckCircle2 className="mr-2 inline size-4" />{signatureStatus}</p> : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {phase === "idle" ? <button type="button" onClick={startSession} className={buttonVariants()}><Camera className="size-4" /> Start server challenge</button> : null}
        {phase === "starting" ? <span className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" />Creating server-bound session…</span> : null}
        {phase === "camera" ? <button type="button" onClick={allowCameraAndRun} className={buttonVariants()}><Camera className="size-4" /> Allow camera & run</button> : null}
        {phase === "running" || phase === "submitting" ? <span className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" />{phase === "running" ? "Validating live signal…" : "Submitting ordered evidence…"}</span> : null}
        {phase === "result" && result?.decision !== "REJECTED" ? <button type="button" onClick={signProof} className={buttonVariants()}><Signature className="size-4" /> Sign canonical proof</button> : null}
        {phase === "signing" ? <span className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" />Waiting for wallet signature…</span> : null}
        {phase === "error" && session ? <button type="button" onClick={retrySameSession} className={buttonVariants({ variant: "outline" })}><RefreshCw className="size-4" /> Retry same challenge</button> : null}
        {(phase === "result" || phase === "signed") ? <button type="button" onClick={clearCompletedRun} className={buttonVariants({ variant: "outline" })}><RefreshCw className="size-4" /> Clear completed run</button> : null}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.025] p-4 text-xs leading-6 text-amber-100/80">
        <ShieldAlert className="mr-2 inline size-4" /> This sandbox intentionally cannot auto-approve browser telemetry. Server-attested anti-spoof evidence is still required before public Humanity approval is enabled.
      </div>
    </section>
  )
}
