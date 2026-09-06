"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, CheckCircle2, Fingerprint, Loader2, RefreshCw, ShieldAlert, Signature, Sparkles, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  createTriProofCaptureIntegrityCollector,
  type TriProofBrowserCaptureIntegrityCollector,
} from "@/lib/humanity/v2/browser-capture-integrity"
import { requestHumanityV2WalletSignature } from "@/lib/humanity/v2/browser-wallet-signature"
import {
  deriveHumanityV2ClientTelemetry,
  type HumanityV2ClientStep,
  type HumanityV2ClientStepEvidence,
  type HumanityV2FrameSample,
} from "@/lib/humanity/v2/client-telemetry"

type CampaignOption = {
  id: string
  name: string
  slug: string
  challengeLevel: string
  enabled: boolean
}

type LightColor = "RED" | "GREEN" | "BLUE" | "WHITE"
type LightPulse = { index: number; color: LightColor; displayMs: number; settleMs: number; intensity: number }
type LightChallenge = { engine: "TRIPROOF_LIVENESS_V2_2"; frameWidth: 32; frameHeight: 32; pulses: LightPulse[] }

type Session = {
  sessionId: string
  nonce: string
  challengeSequence: HumanityV2ClientStep[]
  livenessChallenge: LightChallenge
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

type LivenessResult = {
  verdict: "PASS" | "REVIEW" | "FAIL"
  engineVersion: "2.2"
  livenessScore: number
  antiSpoofScore: number
  chromaticResponseScore: number
  spatialResponseScore: number
  frameDiversityScore: number
  textureScore: number
  timingScore: number
  captureIntegrityScore: number
  temporalConsistencyScore: number
  replayRiskScore: number
  injectionRiskScore: number
  virtualCameraRiskScore: number
  frameInjectionRiskScore: number
  deepfakeHeuristicRiskScore: number
  reasonCodes: string[]
}

type Phase = "idle" | "starting" | "camera" | "motion" | "light" | "submitting" | "result" | "signing" | "signed" | "error"
type Landmark = { x: number; y: number; z?: number }
type DetectorResult = {
  faceLandmarks?: Landmark[][]
  faceBlendshapes?: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>
  landmarks?: Landmark[][]
}
type FaceDetector = { detectForVideo: (video: HTMLVideoElement, timestampMs: number) => DetectorResult; close?: () => void }
type HandDetector = { detectForVideo: (video: HTMLVideoElement, timestampMs: number) => DetectorResult; close?: () => void }
type VisionFileset = unknown
type VisionModule = {
  FilesetResolver: { forVisionTasks: (path: string) => Promise<VisionFileset> }
  FaceLandmarker: { createFromOptions: (fileset: VisionFileset, options: object) => Promise<FaceDetector> }
  HandLandmarker: { createFromOptions: (fileset: VisionFileset, options: object) => Promise<HandDetector> }
}

type LiveSignal = HumanityV2FrameSample

const VISION_MODULE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm"
const VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const FACE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
const HAND_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
const ALLOWED_STEPS = new Set<HumanityV2ClientStep>(["LOOK_CENTER", "TURN_LEFT", "TURN_RIGHT", "BLINK", "RAISE_HAND", "SMILE"])
const LIGHT_COLORS = new Set<LightColor>(["RED", "GREEN", "BLUE", "WHITE"])
const STEP_TIMEOUT_MS = 18_000

const FACE_CONTOURS = [
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61],
  [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78],
  [70, 63, 105, 66, 107],
  [336, 296, 334, 293, 300],
  [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164],
] as const

const FACE_GUIDE_CONNECTIONS = [
  [10, 1], [152, 1], [234, 1], [454, 1], [33, 168], [263, 168], [61, 1], [291, 1],
  [127, 33], [356, 263], [93, 61], [323, 291], [133, 6], [362, 6], [168, 0], [1, 13],
] as const

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
] as const

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
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
  return Math.max(blendshape, Math.max(0, Math.min(1, (mouthWidth - 0.34) * 4 + mouthOpen * 0.55)))
}

function estimateYaw(landmarks: Landmark[]) {
  const nose = landmarks[1]
  const left = landmarks[234]
  const right = landmarks[454]
  if (!nose || !left || !right) return 0
  const width = Math.max(0.001, right.x - left.x)
  return Math.max(-1, Math.min(1, ((nose.x - left.x) / width - 0.5) * 2))
}

function stepTitle(step?: HumanityV2ClientStep) {
  if (step === "LOOK_CENTER") return "Center your face"
  if (step === "TURN_LEFT") return "Turn left"
  if (step === "TURN_RIGHT") return "Turn right"
  if (step === "BLINK") return "Blink once"
  if (step === "RAISE_HAND") return "Raise one hand"
  if (step === "SMILE") return "Smile"
  return "Ready"
}

function holdTarget(step: HumanityV2ClientStep) {
  if (step === "BLINK") return 300
  if (step === "RAISE_HAND" || step === "SMILE") return 650
  return 700
}

function validateStep(step: HumanityV2ClientStep, signal: LiveSignal, blinkLatched: boolean) {
  if (!signal.facePresent || signal.landmarkCount < 450) return false
  if (signal.faceConfidence < 62) return false
  if (step === "LOOK_CENTER") return Math.abs(signal.yaw) < 0.18 && signal.motion < 18
  if (step === "TURN_LEFT") return signal.yaw < -0.18
  if (step === "TURN_RIGHT") return signal.yaw > 0.18
  if (step === "BLINK") return blinkLatched
  if (step === "RAISE_HAND") return signal.handPresent && signal.handLandmarkCount >= 16
  return signal.smileScore > 0.22
}

function pulseBackground(pulse: LightPulse | null) {
  if (!pulse) return "transparent"
  if (pulse.color === "RED") return `rgba(255, 38, 38, ${pulse.intensity})`
  if (pulse.color === "GREEN") return `rgba(38, 255, 92, ${pulse.intensity})`
  if (pulse.color === "BLUE") return `rgba(38, 110, 255, ${pulse.intensity})`
  return `rgba(255, 255, 255, ${pulse.intensity})`
}

function meshPolyline(landmarks: Landmark[], indices: readonly number[]) {
  return indices
    .map((index) => landmarks[index])
    .filter((landmark): landmark is Landmark => Boolean(landmark))
    .map((landmark) => `${landmark.x},${landmark.y}`)
    .join(" ")
}

async function createDetectors(): Promise<{ face: FaceDetector; hand: HandDetector | null }> {
  const vision = (await import(/* webpackIgnore: true */ VISION_MODULE_URL)) as unknown as VisionModule
  const fileset = await vision.FilesetResolver.forVisionTasks(VISION_WASM_URL)
  const face = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputFaceBlendshapes: true,
  }).catch(() => vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "CPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  }))
  const hand = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 1,
  }).catch(() => null)
  return { face, hand }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function HumanityV2IntegratedLivenessSandbox({ campaigns }: { campaigns: CampaignOption[] }) {
  const enabledCampaigns = useMemo(() => campaigns.filter((campaign) => campaign.enabled), [campaigns])
  const [campaignId, setCampaignId] = useState(enabledCampaigns[0]?.id ?? "")
  const [walletChain, setWalletChain] = useState("solana")
  const [walletAddress, setWalletAddress] = useState("")
  const [phase, setPhase] = useState<Phase>("idle")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [livenessResult, setLivenessResult] = useState<LivenessResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [activePulse, setActivePulse] = useState<LightPulse | null>(null)
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)
  const [liveSignal, setLiveSignal] = useState<LiveSignal>(() => emptySignal())
  const [faceMesh, setFaceMesh] = useState<Landmark[]>([])
  const [handMesh, setHandMesh] = useState<Landmark[]>([])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceDetectorRef = useRef<FaceDetector | null>(null)
  const handDetectorRef = useRef<HandDetector | null>(null)
  const captureIntegrityRef = useRef<TriProofBrowserCaptureIntegrityCollector | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const samplesRef = useRef<HumanityV2FrameSample[]>([])
  const evidenceRef = useRef<HumanityV2ClientStepEvidence[]>([])
  const liveSignalRef = useRef<LiveSignal>(emptySignal())
  const cancelRef = useRef(false)

  function stopCamera() {
    cancelRef.current = true
    captureIntegrityRef.current?.stop()
    captureIntegrityRef.current = null
    faceDetectorRef.current?.close?.()
    handDetectorRef.current?.close?.()
    faceDetectorRef.current = null
    handDetectorRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setActivePulse(null)
    setFaceMesh([])
    setHandMesh([])
  }

  useEffect(() => () => stopCamera(), [])

  function resetEvidence() {
    captureIntegrityRef.current?.stop()
    captureIntegrityRef.current = null
    samplesRef.current = []
    evidenceRef.current = []
    previousPixelsRef.current = null
    liveSignalRef.current = emptySignal()
    setLiveSignal(emptySignal())
    setLivenessResult(null)
    setFaceMesh([])
    setHandMesh([])
    setStepIndex(0)
    setProgress(0)
  }

  function sampleFrame(step: HumanityV2ClientStep): HumanityV2FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return null
    canvas.width = 80
    canvas.height = 60
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let brightnessSum = 0
    let sharpnessSum = 0
    let motionSum = 0
    const previous = previousPixelsRef.current
    for (let index = 0; index < data.length; index += 4) {
      const gray = (data[index] + data[index + 1] + data[index + 2]) / 3
      brightnessSum += gray
      if (previous) motionSum += Math.abs(gray - previous[index])
      if (index >= 4) sharpnessSum += Math.abs(gray - (data[index - 4] + data[index - 3] + data[index - 2]) / 3)
    }
    previousPixelsRef.current = new Uint8ClampedArray(data)
    const pixels = data.length / 4

    const timestamp = performance.now()
    const faceDetection = faceDetectorRef.current?.detectForVideo(video, timestamp)
    const landmarks = faceDetection?.faceLandmarks?.[0] ?? []
    const handLandmarks = handDetectorRef.current?.detectForVideo(video, timestamp).landmarks?.[0] ?? []
    setFaceMesh(landmarks)
    setHandMesh(handLandmarks)
    const facePresent = landmarks.length >= 450
    const sample: HumanityV2FrameSample = {
      brightness: brightnessSum / pixels,
      sharpness: sharpnessSum / pixels,
      motion: previous ? motionSum / pixels : 0,
      facePresent,
      faceConfidence: facePresent ? clamp(70 + Math.min(26, (sharpnessSum / pixels) * 4)) : 0,
      yaw: facePresent ? estimateYaw(landmarks) : 0,
      blinkScore: facePresent && faceDetection ? estimateBlink(landmarks, faceDetection) : 0,
      smileScore: facePresent && faceDetection ? estimateSmile(landmarks, faceDetection) : 0,
      landmarkCount: landmarks.length,
      handPresent: handLandmarks.length >= 16,
      handLandmarkCount: handLandmarks.length,
    }
    captureIntegrityRef.current?.recordAnalyzedFrame({
      rgba: data,
      width: canvas.width,
      height: canvas.height,
      landmarks,
      pixelMotion: sample.motion,
    })
    liveSignalRef.current = sample
    setLiveSignal(sample)
    return sample
  }

  function captureRgb32(capturedAtMs: number) {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) throw new Error("Camera frame is unavailable")
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) throw new Error("Could not read liveness frame")
    const cropWidth = video.videoWidth * 0.72
    const cropHeight = video.videoHeight * 0.72
    const cropX = (video.videoWidth - cropWidth) / 2
    const cropY = (video.videoHeight - cropHeight) / 2
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, 32, 32)
    const rgba = ctx.getImageData(0, 0, 32, 32).data
    const rgb = new Uint8Array(32 * 32 * 3)
    for (let source = 0, target = 0; source < rgba.length; source += 4) {
      rgb[target++] = rgba[source]
      rgb[target++] = rgba[source + 1]
      rgb[target++] = rgba[source + 2]
    }
    return { capturedAtMs, width: 32 as const, height: 32 as const, rgbBase64: bytesToBase64(rgb) }
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
      if (!response.ok) throw new Error(data.error ?? "Could not create Humanity session")
      if (!Array.isArray(data.challengeSequence) || data.challengeSequence.some((step) => !ALLOWED_STEPS.has(step))) throw new Error("Invalid server motion challenge")
      if (data.livenessChallenge?.engine !== "TRIPROOF_LIVENESS_V2_2" || data.livenessChallenge.pulses.length !== 4 || data.livenessChallenge.pulses.some((pulse) => !LIGHT_COLORS.has(pulse.color))) throw new Error("Invalid server active-light challenge")
      setSession(data)
      setPhase("camera")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create Humanity session")
      setPhase("error")
    }
  }

  async function allowCameraAndRun() {
    if (!session) return
    setError(null)
    cancelRef.current = false
    resetEvidence()
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera API is unavailable")
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 20, max: 24 } }, audio: false })
      streamRef.current = stream
      if (!videoRef.current) throw new Error("Camera preview is not mounted")
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      captureIntegrityRef.current = createTriProofCaptureIntegrityCollector({ video: videoRef.current, stream })
      const detectors = await createDetectors()
      faceDetectorRef.current = detectors.face
      handDetectorRef.current = detectors.hand
      await runMotionChallenge(session)
      const token = await runActiveLightChallenge(session)
      await submitEvidence(session, token)
    } catch (cause) {
      stopCamera()
      setError(cause instanceof Error ? cause.message : "Integrated liveness challenge failed")
      setPhase("error")
    }
  }

  async function runMotionChallenge(activeSession: Session) {
    setPhase("motion")
    const challengeStartedAt = performance.now()
    for (let index = 0; index < activeSession.challengeSequence.length; index += 1) {
      const step = activeSession.challengeSequence[index]
      setStepIndex(index)
      setProgress(0)
      let validSince: number | null = null
      let blinkLatched = false
      const started = performance.now()
      while (!cancelRef.current) {
        const now = performance.now()
        if (now - started > STEP_TIMEOUT_MS) throw new Error(`${stepTitle(step)} timed out`)
        const sample = sampleFrame(step)
        if (sample) samplesRef.current.push(sample)
        if (step === "BLINK" && liveSignalRef.current.blinkScore > 0.28) blinkLatched = true
        if (validateStep(step, liveSignalRef.current, blinkLatched)) validSince ??= now
        else validSince = null
        const held = validSince === null ? 0 : now - validSince
        setProgress(Math.min(1, held / holdTarget(step)))
        if (held >= holdTarget(step)) {
          evidenceRef.current.push({ step, capturedAtMs: Math.round(performance.now() - challengeStartedAt), heldForMs: Math.max(250, Math.round(held)) })
          break
        }
        await delay(170)
      }
      await delay(180)
    }
  }

  async function runActiveLightChallenge(activeSession: Session) {
    setPhase("light")
    setActivePulse(null)
    await delay(380)
    const started = performance.now()
    const baseline = captureRgb32(0)
    const pulses = [] as Array<ReturnType<typeof captureRgb32> & { index: number; color: LightColor }>

    for (const pulse of activeSession.livenessChallenge.pulses) {
      setActivePulse(pulse)
      await delay(pulse.settleMs)
      pulses.push({ ...captureRgb32(Math.round(performance.now() - started)), index: pulse.index, color: pulse.color })
      await delay(Math.max(120, pulse.displayMs - pulse.settleMs))
      setActivePulse(null)
      await delay(220)
    }

    const captureIntegrity = captureIntegrityRef.current?.snapshot()
    const response = await fetch("/api/humanity/v2/liveness/attest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: activeSession.sessionId,
        walletAddress: walletAddress.trim(),
        walletChain,
        baseline,
        pulses,
        captureIntegrity,
      }),
    })
    const data = await response.json() as { error?: string; result?: LivenessResult; attestationToken?: string }
    if (data.result) setLivenessResult(data.result)
    if (response.status === 202 || response.status === 422) return null
    if (!response.ok) throw new Error(data.error ?? "Tri-Proof Liveness V2.2 scoring failed")
    return data.attestationToken ?? null
  }

  async function submitEvidence(activeSession: Session, triproofLivenessToken: string | null) {
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
        triproofLivenessToken: triproofLivenessToken ?? undefined,
      }),
    })
    const data = await response.json() as Result & { error?: string }
    if (!response.ok) throw new Error(data.error ?? "Humanity submission failed")
    setResult(data)
    setPhase("result")
  }

  async function signProof() {
    if (!result) return
    setPhase("signing")
    setError(null)
    try {
      const signed = await requestHumanityV2WalletSignature({ walletChain, walletAddress: walletAddress.trim(), message: result.proofMessage })
      const response = await fetch("/api/humanity/v2/challenge/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: result.verificationId, walletAddress: walletAddress.trim(), walletChain, signature: signed.signature }),
      })
      const data = await response.json() as { error?: string; signatureVerified?: boolean; verificationMethod?: string }
      if (!response.ok || !data.signatureVerified) throw new Error(data.error ?? "Wallet signature did not verify")
      setSignatureStatus(`Wallet proof verified via ${data.verificationMethod ?? signed.provider}.`)
      setPhase("signed")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet signature failed")
      setPhase("result")
    }
  }

  function reset() {
    stopCamera()
    resetEvidence()
    setSession(null)
    setResult(null)
    setError(null)
    setSignatureStatus(null)
    setPhase("idle")
  }

  if (!enabledCampaigns.length) return <div className="rounded-3xl border border-amber-300/20 bg-amber-300/[0.035] p-6 text-sm text-amber-100"><ShieldAlert className="mr-2 inline size-4" />Create an enabled Humanity campaign first.</div>

  const currentStep = session?.challengeSequence[stepIndex]

  return (
    <section className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-slate-950/45 p-5 sm:p-6">
      {activePulse ? (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center" style={{ backgroundColor: pulseBackground(activePulse) }}>
          <div className="rounded-2xl border border-black/10 bg-black/45 px-5 py-4 text-center text-white backdrop-blur-sm">
            <Sparkles className="mx-auto mb-2 size-5" />
            <p className="font-semibold">Tri-Proof active-light pulse {activePulse.index + 1}/4</p>
            <p className="mt-1 text-xs text-white/80">Keep looking at the screen. Physical optical response and spatial consistency are scored server-side.</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-cyan-300/20 text-cyan-100">Tri-Proof Liveness V2.2</Badge>
            <Badge variant="outline" className="border-violet-300/20 text-violet-100">Capture integrity + virtual-camera defense</Badge>
            <Badge variant="outline" className="border-amber-300/20 text-amber-100">Experimental / review-only</Badge>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-white">Integrated Humanity liveness scan</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Motion and active-light challenges are combined with privacy-minimized frame cadence, continuity, loop and motion-correlation signals. Raw video and device identifiers are not stored.</p>
        </div>
        <Fingerprint className="size-5 text-cyan-300" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} disabled={phase !== "idle"} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white">
          {enabledCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.challengeLevel}</option>)}
        </select>
        <select value={walletChain} onChange={(event) => setWalletChain(event.target.value)} disabled={phase !== "idle"} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white"><option value="solana">Solana</option><option value="evm">EVM</option></select>
        <input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} disabled={phase !== "idle"} placeholder={walletChain === "solana" ? "Solana public key" : "0x…"} className="h-11 rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-sm text-white" />
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] p-4 text-sm text-rose-100"><XCircle className="mr-2 inline size-4" />{error}</div> : null}

      {session && phase !== "idle" && phase !== "starting" ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
          <div className="relative overflow-hidden rounded-2xl border border-cyan-300/20 bg-black">
            <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full -scale-x-100 object-contain" />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100">
              <g fill="none" stroke="rgba(103, 232, 249, 0.82)" strokeWidth="0.0024" strokeLinecap="round" strokeLinejoin="round">
                {FACE_CONTOURS.map((indices, contourIndex) => (
                  <polyline key={`face-contour-${contourIndex}`} points={meshPolyline(faceMesh, indices)} />
                ))}
                {FACE_GUIDE_CONNECTIONS.map(([from, to], connectionIndex) => {
                  const a = faceMesh[from]
                  const b = faceMesh[to]
                  return a && b ? <line key={`face-guide-${connectionIndex}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} opacity="0.45" /> : null
                })}
              </g>
              <g fill="rgba(165, 243, 252, 0.76)">
                {faceMesh.map((landmark, index) => index % 2 === 0 ? <circle key={`face-point-${index}`} cx={landmark.x} cy={landmark.y} r="0.0027" /> : null)}
              </g>
              <g fill="none" stroke="rgba(196, 181, 253, 0.95)" strokeWidth="0.0038" strokeLinecap="round" strokeLinejoin="round">
                {HAND_CONNECTIONS.map(([from, to], connectionIndex) => {
                  const a = handMesh[from]
                  const b = handMesh[to]
                  return a && b ? <line key={`hand-line-${connectionIndex}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null
                })}
              </g>
              <g fill="rgba(221, 214, 254, 0.96)">
                {handMesh.map((landmark, index) => <circle key={`hand-point-${index}`} cx={landmark.x} cy={landmark.y} r="0.005" />)}
              </g>
            </svg>
            <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
              <span className={`rounded-full border px-2.5 py-1 backdrop-blur-md ${faceMesh.length >= 450 ? "border-cyan-300/35 bg-cyan-950/55 text-cyan-100" : "border-white/10 bg-black/45 text-slate-400"}`}>Face mesh {faceMesh.length >= 450 ? "locked" : "searching"}</span>
              <span className={`rounded-full border px-2.5 py-1 backdrop-blur-md ${handMesh.length >= 16 ? "border-violet-300/35 bg-violet-950/55 text-violet-100" : "border-white/10 bg-black/45 text-slate-400"}`}>Hand mesh {handMesh.length >= 16 ? "locked" : "searching"}</span>
            </div>
            <canvas ref={sampleCanvasRef} className="hidden" />
          </div>
          <div className="grid gap-3">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm text-slate-300">
              <p className="font-medium text-white">{phase === "motion" ? stepTitle(currentStep) : phase === "light" ? "Active-light + capture integrity" : "Camera ready"}</p>
              <p className="mt-2 text-xs leading-6 text-slate-500">FACE {liveSignal.facePresent ? "LOCK" : "WAIT"} · {faceMesh.length} pts · HAND {handMesh.length >= 16 ? "LOCK" : "WAIT"} · yaw {liveSignal.yaw.toFixed(2)} · blink {Math.round(liveSignal.blinkScore * 100)}% · smile {Math.round(liveSignal.smileScore * 100)}%</p>
              {phase === "motion" ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-300" style={{ width: `${Math.round(progress * 100)}%` }} /></div> : null}
            </div>
            {livenessResult ? (
              <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.03] p-4 text-xs leading-6 text-slate-300">
                <p className="font-semibold text-white">Liveness {livenessResult.verdict} · {livenessResult.livenessScore}/100 · anti-spoof {livenessResult.antiSpoofScore}/100</p>
                <p>Optical {livenessResult.chromaticResponseScore} · spatial {livenessResult.spatialResponseScore} · capture integrity {livenessResult.captureIntegrityScore} · temporal {livenessResult.temporalConsistencyScore}</p>
                <p>Replay risk {livenessResult.replayRiskScore} · virtual-camera risk {livenessResult.virtualCameraRiskScore} · injection risk {livenessResult.frameInjectionRiskScore} · deepfake heuristic {livenessResult.deepfakeHeuristicRiskScore}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : <canvas ref={sampleCanvasRef} className="hidden" />}

      {result ? <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[0.035] p-4 text-sm text-amber-100"><p className="font-semibold text-white">Decision {result.decision} · Humanity score {Math.round(result.humanSessionScore)}</p><p className="mt-2 text-xs leading-6">{result.reasonCodes.join(" · ")}</p><p className="mt-2 text-xs text-slate-400">Trust mode: {result.trustMode}</p>{signatureStatus ? <p className="mt-3 text-emerald-200"><CheckCircle2 className="mr-2 inline size-4" />{signatureStatus}</p> : null}</div> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {phase === "idle" ? <button type="button" onClick={startSession} className={buttonVariants()}><Camera className="size-4" /> Start integrated scan</button> : null}
        {phase === "starting" ? <span className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" />Issuing V2.2 motion + active-light challenge…</span> : null}
        {phase === "camera" ? <button type="button" onClick={allowCameraAndRun} className={buttonVariants()}><Camera className="size-4" /> Allow camera & run</button> : null}
        {phase === "motion" || phase === "light" || phase === "submitting" ? <span className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" />{phase === "motion" ? "Validating motion + capture integrity…" : phase === "light" ? "Measuring optical + injection signals…" : "Submitting proof evidence…"}</span> : null}
        {phase === "result" && result?.decision !== "REJECTED" ? <button type="button" onClick={signProof} className={buttonVariants()}><Signature className="size-4" /> Sign canonical proof</button> : null}
        {phase === "signing" ? <span className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" />Waiting for wallet signature…</span> : null}
        {(phase === "result" || phase === "signed" || phase === "error") ? <button type="button" onClick={reset} className={buttonVariants({ variant: "outline" })}><RefreshCw className="size-4" /> Reset</button> : null}
      </div>

      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.025] p-4 text-xs leading-6 text-amber-100/80"><ShieldAlert className="mr-2 inline size-4" />V2.2 adds virtual-camera, loop, frame-injection and deepfake/reenactment heuristic risk signals. These browser-derived signals are intentionally review-only and are not treated as definitive proof that a camera is genuine or that media is a deepfake.</div>
    </section>
  )
}
