"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, RefreshCw, Signature, Video, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  createMediaPipeFaceSampler,
  type FaceConnectionSets,
  type LandmarkConnection,
  type MediaPipeFaceSample,
  type MediaPipeFaceSampler,
  type NormalizedLandmark,
} from "@/lib/humanity/browser-mediapipe"
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

type FrameSample = {
  brightness: number
  sharpness: number
  motion: number
  facePresent: boolean
  handPresent: boolean
  faceConfidence: number
  landmarkCount: number
  handLandmarkCount: number
  yaw: number
  blinkScore: number
  smileScore: number
}

type LiveSignal = {
  facePresent: boolean
  handPresent: boolean
  yaw: number
  blinkScore: number
  smileScore: number
  confidence: number
  motion: number
  landmarkCount: number
  handLandmarkCount: number
  faceLandmarks: NormalizedLandmark[]
  handLandmarks: NormalizedLandmark[]
}

type CanvasPoint = { x: number; y: number }

type StrokeStyle = {
  strokeStyle: string
  shadowColor?: string
  shadowBlur?: number
  lineDash?: number[]
}

const STEP_HOLD_MS = 1200
const STEP_TIMEOUT_MS = 15000
const SAMPLE_MS = 90

const EMPTY_FACE_CONNECTIONS: FaceConnectionSets = {
  tessellation: [],
  contours: [],
  lips: [],
  leftEye: [],
  rightEye: [],
  leftEyebrow: [],
  rightEyebrow: [],
  leftIris: [],
  rightIris: [],
}

const FEATURE_POINT_INDICES = [
  1, 4, 5, 6, 8, 9, 10, 13, 14, 17, 33, 46, 52, 55, 61, 63, 70, 78, 82, 87, 93, 105, 107, 133, 145, 152, 159, 168,
  172, 197, 234, 263, 276, 282, 285, 291, 293, 300, 308, 312, 317, 323, 334, 336, 362, 374, 386, 454, 468, 469, 470,
  471, 472, 473, 474, 475, 476, 477,
]

const HAND_CONNECTIONS: LandmarkConnection[] = [
  { start: 0, end: 1 }, { start: 1, end: 2 }, { start: 2, end: 3 }, { start: 3, end: 4 },
  { start: 0, end: 5 }, { start: 5, end: 6 }, { start: 6, end: 7 }, { start: 7, end: 8 },
  { start: 5, end: 9 }, { start: 9, end: 10 }, { start: 10, end: 11 }, { start: 11, end: 12 },
  { start: 9, end: 13 }, { start: 13, end: 14 }, { start: 14, end: 15 }, { start: 15, end: 16 },
  { start: 13, end: 17 }, { start: 17, end: 18 }, { start: 18, end: 19 }, { start: 19, end: 20 },
  { start: 0, end: 17 },
]

function emptySignal(): LiveSignal {
  return {
    facePresent: false,
    handPresent: false,
    yaw: 0,
    blinkScore: 0,
    smileScore: 0,
    confidence: 0,
    motion: 0,
    landmarkCount: 0,
    handLandmarkCount: 0,
    faceLandmarks: [],
    handLandmarks: [],
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

function getTimestampMs() {
  return performance.now()
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
    case "LOOK_CENTER": return "Yüz mesh sabitlenene kadar kameraya düz bak."
    case "TURN_LEFT": return "Başını kameraya göre sola çevir ve sabit tut."
    case "TURN_RIGHT": return "Başını kameraya göre sağa çevir ve sabit tut."
    case "BLINK": return "Yüz görünürken bir kez göz kırp."
    case "RAISE_HAND": return "Elini yüz hizasına kaldır; mor el mesh'i görünmeli."
    case "SMILE": return "Kameraya bakarken kısa süre gülümse."
    default: return "Challenge hazırlanıyor."
  }
}

function validateStep(step: string | undefined, signal: LiveSignal, detectorReady: boolean) {
  if (!signal.facePresent && step !== "RAISE_HAND") return { ok: false, reason: "Yüz bulunamadı" }
  if (detectorReady && step !== "RAISE_HAND" && signal.landmarkCount < 468) return { ok: false, reason: "Tam yüz mesh bekleniyor" }
  if (detectorReady && step !== "RAISE_HAND" && signal.confidence < 55) return { ok: false, reason: "Yüz mesh güveni düşük" }

  switch (step) {
    case "LOOK_CENTER": {
      const ok = detectorReady ? Math.abs(signal.yaw) < 0.2 && signal.confidence >= 70 : signal.facePresent && signal.motion < 22
      return ok ? { ok, reason: "Yüz ortalandı" } : { ok, reason: "Yüzünü merkeze al" }
    }
    case "TURN_LEFT": {
      const ok = detectorReady ? signal.yaw < -0.16 || signal.motion > 12 : signal.facePresent && signal.motion > 9
      return ok ? { ok, reason: "Sol dönüş algılandı" } : { ok, reason: "Başını daha sola çevir" }
    }
    case "TURN_RIGHT": {
      const ok = detectorReady ? signal.yaw > 0.16 || signal.motion > 12 : signal.facePresent && signal.motion > 9
      return ok ? { ok, reason: "Sağ dönüş algılandı" } : { ok, reason: "Başını daha sağa çevir" }
    }
    case "BLINK": {
      const ok = detectorReady ? signal.blinkScore > 0.3 || signal.motion > 16 : signal.facePresent && signal.motion > 11
      return ok ? { ok, reason: "Göz kırpma algılandı" } : { ok, reason: "Göz kırpma bekleniyor" }
    }
    case "RAISE_HAND": {
      const ok = detectorReady ? signal.handPresent && signal.handLandmarkCount >= 18 : signal.motion > 13
      return ok ? { ok, reason: "El algılandı" } : { ok, reason: "Elini kameraya göster" }
    }
    case "SMILE": {
      const ok = detectorReady ? signal.smileScore > 0.24 : signal.facePresent && signal.motion < 20
      return ok ? { ok, reason: "Gülümseme sinyali algılandı" } : { ok, reason: "Gülümseme bekleniyor" }
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

function toCanvasPoint(point: NormalizedLandmark, width: number, height: number): CanvasPoint {
  return { x: (1 - point.x) * width, y: point.y * height }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  connections: LandmarkConnection[],
  width: number,
  height: number,
  style: StrokeStyle,
  lineWidth: number
) {
  if (!connections.length) return
  ctx.save()
  ctx.strokeStyle = style.strokeStyle
  ctx.lineWidth = lineWidth
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.shadowColor = style.shadowColor ?? "transparent"
  ctx.shadowBlur = style.shadowBlur ?? 0
  if (style.lineDash) ctx.setLineDash(style.lineDash)
  ctx.beginPath()
  for (const connection of connections) {
    const start = landmarks[connection.start]
    const end = landmarks[connection.end]
    if (!start || !end) continue
    const a = toCanvasPoint(start, width, height)
    const b = toCanvasPoint(end, width, height)
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
  }
  ctx.stroke()
  ctx.restore()
}

function getFaceBounds(landmarks: NormalizedLandmark[], width: number, height: number) {
  if (!landmarks.length) return null
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (const point of landmarks) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    const canvasPoint = toCanvasPoint(point, width, height)
    minX = Math.min(minX, canvasPoint.x)
    minY = Math.min(minY, canvasPoint.y)
    maxX = Math.max(maxX, canvasPoint.x)
    maxY = Math.max(maxY, canvasPoint.y)
  }
  if (minX >= maxX || minY >= maxY) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

function drawHudCorners(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color = "rgba(125,211,252,0.95)") {
  const corner = Math.max(18, Math.min(width, height) * 0.16)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.shadowColor = "rgba(56,189,248,0.8)"
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.moveTo(x, y + corner)
  ctx.lineTo(x, y)
  ctx.lineTo(x + corner, y)
  ctx.moveTo(x + width - corner, y)
  ctx.lineTo(x + width, y)
  ctx.lineTo(x + width, y + corner)
  ctx.moveTo(x + width, y + height - corner)
  ctx.lineTo(x + width, y + height)
  ctx.lineTo(x + width - corner, y + height)
  ctx.moveTo(x + corner, y + height)
  ctx.lineTo(x, y + height)
  ctx.lineTo(x, y + height - corner)
  ctx.stroke()
  ctx.restore()
}

function drawHudPanel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, title: string, rows: string[]) {
  const height = 34 + rows.length * 20
  ctx.save()
  ctx.fillStyle = "rgba(2, 6, 23, 0.72)"
  drawRoundedRect(ctx, x, y, width, height, 8)
  ctx.fill()
  ctx.strokeStyle = "rgba(56,189,248,0.32)"
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = "#67e8f9"
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace"
  ctx.fillText(title, x + 12, y + 20)
  ctx.strokeStyle = "rgba(125,211,252,0.38)"
  ctx.beginPath()
  ctx.moveTo(x + 12, y + 27)
  ctx.lineTo(x + width - 12, y + 27)
  ctx.stroke()
  ctx.fillStyle = "rgba(186,230,253,0.92)"
  ctx.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace"
  rows.forEach((row, index) => ctx.fillText(row, x + 12, y + 47 + index * 20))
  ctx.restore()
}

function drawMiniBars(ctx: CanvasRenderingContext2D, x: number, y: number, values: number[]) {
  ctx.save()
  values.forEach((value, index) => {
    const barWidth = 78
    const barY = y + index * 14
    ctx.fillStyle = "rgba(15,23,42,0.82)"
    ctx.fillRect(x, barY, barWidth, 7)
    ctx.fillStyle = index % 2 === 0 ? "rgba(34,211,238,0.78)" : "rgba(168,85,247,0.72)"
    ctx.fillRect(x, barY, Math.max(4, barWidth * Math.max(0, Math.min(1, value))), 7)
  })
  ctx.restore()
}

function drawFallbackStatus(ctx: CanvasRenderingContext2D, width: number, height: number, detectorLabel: string) {
  if (detectorLabel !== "Canvas fallback") return
  ctx.save()
  ctx.fillStyle = "rgba(2,6,23,0.7)"
  drawRoundedRect(ctx, width / 2 - 96, height * 0.18, 192, 38, 8)
  ctx.fill()
  ctx.strokeStyle = "rgba(56,189,248,0.35)"
  ctx.stroke()
  ctx.fillStyle = "#7dd3fc"
  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace"
  ctx.fillText("CANVAS FALLBACK", width / 2 - 63, height * 0.18 + 24)
  ctx.restore()
}

function drawProfessionalFaceMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  connections: FaceConnectionSets
) {
  if (landmarks.length < 468) return
  const featureConnections = [
    ...connections.lips,
    ...connections.leftEye,
    ...connections.rightEye,
    ...connections.leftEyebrow,
    ...connections.rightEyebrow,
  ]

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  drawConnections(
    ctx,
    landmarks,
    connections.tessellation,
    width,
    height,
    { strokeStyle: "rgba(34,211,238,0.3)", shadowColor: "rgba(34,211,238,0.25)", shadowBlur: 2 },
    0.9
  )
  drawConnections(
    ctx,
    landmarks,
    connections.contours,
    width,
    height,
    { strokeStyle: "rgba(125,211,252,0.92)", shadowColor: "rgba(56,189,248,0.62)", shadowBlur: 5 },
    1.65
  )
  drawConnections(
    ctx,
    landmarks,
    featureConnections,
    width,
    height,
    { strokeStyle: "rgba(224,242,254,0.95)", shadowColor: "rgba(56,189,248,0.88)", shadowBlur: 8 },
    1.75
  )
  drawConnections(
    ctx,
    landmarks,
    [...connections.leftIris, ...connections.rightIris],
    width,
    height,
    { strokeStyle: "rgba(255,255,255,0.96)", shadowColor: "rgba(125,211,252,0.95)", shadowBlur: 10 },
    1.55
  )

  ctx.fillStyle = "rgba(103,232,249,0.7)"
  ctx.shadowColor = "rgba(34,211,238,0.46)"
  ctx.shadowBlur = 4
  for (const point of landmarks) {
    const p = toCanvasPoint(point, width, height)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 0.95, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = "rgba(255,255,255,0.96)"
  ctx.shadowColor = "rgba(56,189,248,0.95)"
  ctx.shadowBlur = 12
  for (const index of FEATURE_POINT_INDICES) {
    const point = landmarks[index]
    if (!point) continue
    const p = toCanvasPoint(point, width, height)
    ctx.beginPath()
    ctx.arc(p.x, p.y, index >= 468 ? 2.4 : 2.25, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  const bounds = getFaceBounds(landmarks, width, height)
  if (!bounds) return
  const padX = bounds.width * 0.08
  const padY = bounds.height * 0.06
  drawHudCorners(
    ctx,
    Math.max(18, bounds.x - padX),
    Math.max(18, bounds.y - padY),
    Math.min(width - 36, bounds.width + padX * 2),
    Math.min(height - 36, bounds.height + padY * 2)
  )
}

function drawProfessionalHandMesh(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  if (!landmarks.length) return
  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  drawConnections(
    ctx,
    landmarks,
    HAND_CONNECTIONS,
    width,
    height,
    { strokeStyle: "rgba(196,181,253,0.94)", shadowColor: "rgba(168,85,247,0.75)", shadowBlur: 10 },
    2.4
  )
  ctx.fillStyle = "rgba(233,213,255,0.95)"
  ctx.shadowColor = "rgba(168,85,247,0.95)"
  ctx.shadowBlur = 11
  for (const point of landmarks) {
    const p = toCanvasPoint(point, width, height)
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
    ctx.fill()
  }
  const bounds = getFaceBounds(landmarks, width, height)
  if (bounds) drawHudCorners(ctx, bounds.x - 12, bounds.y - 12, bounds.width + 24, bounds.height + 24, "rgba(216,180,254,0.88)")
  ctx.restore()
}

function drawScanHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  signal: LiveSignal,
  progress: number,
  currentStep: string | undefined,
  detectorLabel: string
) {
  const active = progress > 0.8
  const now = Date.now()
  ctx.save()
  ctx.strokeStyle = active ? "rgba(34,197,94,0.95)" : "rgba(56,189,248,0.9)"
  ctx.lineWidth = 2
  ctx.shadowColor = active ? "rgba(34,197,94,0.42)" : "rgba(56,189,248,0.58)"
  ctx.shadowBlur = 12
  const inset = 18
  const cut = 26
  ctx.beginPath()
  ctx.moveTo(inset + cut, inset)
  ctx.lineTo(width - inset - cut, inset)
  ctx.lineTo(width - inset, inset + cut)
  ctx.lineTo(width - inset, height - inset - cut)
  ctx.lineTo(width - inset - cut, height - inset)
  ctx.lineTo(inset + cut, height - inset)
  ctx.lineTo(inset, height - inset - cut)
  ctx.lineTo(inset, inset + cut)
  ctx.closePath()
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.setLineDash([12, 18])
  ctx.strokeStyle = "rgba(125,211,252,0.5)"
  ctx.beginPath()
  ctx.moveTo(width * 0.14, 32)
  ctx.lineTo(width * 0.86, 32)
  ctx.moveTo(width * 0.14, height - 32)
  ctx.lineTo(width * 0.86, height - 32)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.strokeStyle = "rgba(125,211,252,0.45)"
  ctx.lineWidth = 1
  for (let y = height * 0.26; y < height * 0.74; y += 22) {
    ctx.beginPath()
    ctx.moveTo(36, y)
    ctx.lineTo(52, y)
    ctx.moveTo(width - 52, y)
    ctx.lineTo(width - 36, y)
    ctx.stroke()
  }

  const scanY = height * 0.1 + ((now / 10) % (height * 0.78))
  const gradient = ctx.createLinearGradient(0, scanY - 14, 0, scanY + 14)
  gradient.addColorStop(0, "rgba(34,211,238,0)")
  gradient.addColorStop(0.5, "rgba(34,211,238,0.38)")
  gradient.addColorStop(1, "rgba(34,211,238,0)")
  ctx.fillStyle = gradient
  ctx.fillRect(0, scanY - 14, width, 28)
  ctx.strokeStyle = "rgba(125,211,252,0.72)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, scanY)
  ctx.lineTo(width, scanY)
  ctx.stroke()
  ctx.restore()

  const panelWidth = Math.min(348, Math.max(250, width - 48))
  drawHudPanel(ctx, 28, 28, panelWidth, "FACE SCAN", [
    `FACE LOCK: ${signal.facePresent ? "LOCK" : "WAIT"}`,
    `HAND LOCK: ${signal.handPresent ? "LOCK" : "WAIT"}`,
    `CONFIDENCE: ${Math.round(signal.confidence)}%`,
    `CURRENT STEP: ${stepTitle(currentStep).toUpperCase()}`,
    `YAW: ${signal.yaw.toFixed(2)}`,
    `DETECTOR MODE: ${detectorLabel}`,
  ])

  if (width > 720) {
    const rightX = width - 232
    drawHudPanel(ctx, rightX, 48, 184, "LANDMARKS", [
      `POINTS: ${signal.landmarkCount}`,
      `HAND: ${signal.handLandmarkCount}`,
      `BLINK: ${Math.round(signal.blinkScore * 100)}%`,
      `SMILE: ${Math.round(signal.smileScore * 100)}%`,
    ])
    drawMiniBars(ctx, rightX + 96, 96, [
      signal.confidence / 100,
      signal.blinkScore,
      signal.smileScore,
      progress,
    ])
  }

  if (height > 420) {
    drawHudPanel(ctx, 28, height - 104, 184, "POSE", [
      `YAW ${signal.yaw >= 0 ? "+" : ""}${signal.yaw.toFixed(2)}`,
      `MOTION ${signal.motion.toFixed(1)}`,
      `HOLD ${Math.round(progress * 100)}%`,
    ])
  }

  drawFallbackStatus(ctx, width, height, detectorLabel)
}

function smoothLandmarks(previous: NormalizedLandmark[], current: NormalizedLandmark[]) {
  if (!current.length) return []
  if (previous.length !== current.length) return current
  return current.map((point, index) => {
    const old = previous[index]
    return {
      x: old.x * 0.72 + point.x * 0.28,
      y: old.y * 0.72 + point.y * 0.28,
      z: point.z === undefined ? old.z : (old.z ?? point.z) * 0.72 + point.z * 0.28,
    }
  })
}

export function AdminCameraChallenge({ campaignId, walletAddress, walletChain }: { campaignId: string; walletAddress: string; walletChain: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaPipeRef = useRef<MediaPipeFaceSampler | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const smoothedFaceLandmarksRef = useRef<NormalizedLandmark[]>([])
  const smoothedHandLandmarksRef = useRef<NormalizedLandmark[]>([])
  const samplesRef = useRef<FrameSample[]>([])
  const timingsRef = useRef<number[]>([])
  const cancelRef = useRef(false)
  const liveSignalRef = useRef<LiveSignal>(emptySignal())

  const [phase, setPhase] = useState<Phase>("idle")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stepReason, setStepReason] = useState("Hazır")
  const [detectorLabel, setDetectorLabel] = useState("Canvas fallback")
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)
  const [liveSignal, setLiveSignal] = useState<LiveSignal>(() => emptySignal())

  function stopCamera() {
    cancelRef.current = true
    mediaPipeRef.current?.dispose()
    mediaPipeRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    smoothedFaceLandmarksRef.current = []
    smoothedHandLandmarksRef.current = []
  }

  useEffect(() => () => stopCamera(), [])

  function drawOverlay(signal: LiveSignal, currentProgress: number, currentStep?: string) {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video || video.videoWidth === 0 || video.videoHeight === 0) return
    canvas.width = video.clientWidth || video.videoWidth
    canvas.height = video.clientHeight || video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const activeDetectorLabel = mediaPipeRef.current ? "MediaPipe Face + Hand Mesh" : "Canvas fallback"
    const faceConnections = mediaPipeRef.current?.faceConnections ?? EMPTY_FACE_CONNECTIONS
    drawProfessionalFaceMesh(ctx, signal.faceLandmarks, canvas.width, canvas.height, faceConnections)
    drawProfessionalHandMesh(ctx, signal.handLandmarks, canvas.width, canvas.height)
    drawScanHud(ctx, canvas.width, canvas.height, signal, currentProgress, currentStep, activeDetectorLabel)
  }

  function sampleFrame(): FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null
    const mp: MediaPipeFaceSample | null = mediaPipeRef.current?.sample() ?? null
    canvas.width = 96
    canvas.height = 72
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
    const fallbackFace = brightness > 35 && brightness < 235 && sharpness > 1.1
    const rawFaceLandmarks = mp?.faceLandmarks ?? []
    const rawHandLandmarks = mp?.handLandmarks ?? []
    const faceLandmarks = smoothLandmarks(smoothedFaceLandmarksRef.current, rawFaceLandmarks)
    const handLandmarks = smoothLandmarks(smoothedHandLandmarksRef.current, rawHandLandmarks)
    smoothedFaceLandmarksRef.current = faceLandmarks
    smoothedHandLandmarksRef.current = handLandmarks
    const signal: LiveSignal = {
      facePresent: mp?.facePresent ?? fallbackFace,
      handPresent: mp?.handPresent ?? false,
      yaw: mp?.yaw ?? 0,
      blinkScore: mp?.blinkScore ?? 0,
      smileScore: mp?.smileScore ?? 0,
      confidence: mp?.confidence ?? (fallbackFace ? 55 : 0),
      motion: Math.max(motion, mp?.centerMotion ?? 0),
      landmarkCount: mp?.landmarkCount ?? 0,
      handLandmarkCount: mp?.handLandmarkCount ?? 0,
      faceLandmarks,
      handLandmarks,
    }
    liveSignalRef.current = signal
    setLiveSignal(signal)
    return {
      brightness,
      sharpness,
      motion: signal.motion,
      facePresent: signal.facePresent,
      handPresent: signal.handPresent,
      faceConfidence: signal.confidence,
      landmarkCount: signal.landmarkCount,
      handLandmarkCount: signal.handLandmarkCount,
      yaw: signal.yaw,
      blinkScore: signal.blinkScore,
      smileScore: signal.smileScore,
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
    setDetectorLabel("Canvas fallback")
    samplesRef.current = []
    timingsRef.current = []
    previousPixelsRef.current = null
    smoothedFaceLandmarksRef.current = []
    smoothedHandLandmarksRef.current = []
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 960, height: 720 }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
        try {
          setDetectorLabel("Loading MediaPipe...")
          mediaPipeRef.current = await createMediaPipeFaceSampler(videoRef.current)
          setDetectorLabel("MediaPipe Face + Hand Mesh")
        } catch (mpError) {
          console.warn("[HumanityGate] MediaPipe unavailable, using canvas fallback", mpError)
          setDetectorLabel("Canvas fallback")
        }
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
    const detectorReady = Boolean(mediaPipeRef.current)
    for (let i = 0; i < session.challengeSequence.length; i++) {
      if (cancelRef.current) return
      const step = session.challengeSequence[i]
      setStepIndex(i)
      setProgress(0)
      setStepReason(stepHelp(step))
      let validSince: number | null = null
      const started = getTimestampMs()
      const stepStarted = getTimestampMs()
      while (!cancelRef.current) {
        const now = getTimestampMs()
        if (now - stepStarted > STEP_TIMEOUT_MS) {
          setError(`${stepTitle(step)} doğrulanamadı. Daha iyi ışıkta ve daha belirgin hareketle tekrar dene.`)
          setPhase("error")
          stopCamera()
          return
        }
        const sample = sampleFrame()
        if (sample) samplesRef.current.push(sample)
        const validation = validateStep(step, liveSignalRef.current, detectorReady)
        let holdProgress = 0
        if (validation.ok) {
          validSince ??= now
          holdProgress = Math.min(1, (now - validSince) / STEP_HOLD_MS)
        } else {
          validSince = null
        }
        setProgress(holdProgress)
        setStepReason(validation.reason)
        drawOverlay(liveSignalRef.current, holdProgress, step)
        if (holdProgress >= 1) break
        await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS))
      }
      timingsRef.current.push(Math.round(getTimestampMs() - started))
      await new Promise((resolve) => setTimeout(resolve, 420))
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
    const yawRange = Math.max(0, ...samples.map((sample) => sample.yaw)) - Math.min(0, ...samples.map((sample) => sample.yaw))
    const blinkMax = Math.max(0, ...samples.map((sample) => sample.blinkScore))
    const smileMax = Math.max(0, ...samples.map((sample) => sample.smileScore))
    const faceSeenCount = samples.filter((sample) => sample.facePresent).length
    const handSeenCount = samples.filter((sample) => sample.handPresent).length
    const mediaPipeActive = samples.some((sample) => sample.landmarkCount >= 468) && faceSeenCount > 12
    const brightnessOk = brightnessAvg > 35 && brightnessAvg < 235
    const scores = {
      facePresenceScore: clamp(mediaPipeActive ? faceConfidenceAvg : brightnessOk ? 68 + sharpnessAvg * 2 : 35),
      headPoseScore: clamp(mediaPipeActive ? 55 + yawRange * 130 : 48 + motionAvg * 4),
      eyeBlinkScore: clamp(mediaPipeActive ? blinkMax * 145 : 45 + motionAvg * 2),
      handGestureScore: clamp(session.challengeSequence.includes("RAISE_HAND") ? (handSeenCount > 8 ? 92 : 35) : 80),
      motionTimingScore: clamp(70 + Math.min(20, motionAvg * 2)),
      frameConsistencyScore: clamp(88 - Math.abs(110 - brightnessAvg) * 0.18),
      replayRiskScore: clamp(mediaPipeActive ? Math.max(5, 42 - motionAvg - yawRange * 40 - smileMax * 10) : sharpnessAvg < 2 ? 72 : 25 - motionAvg),
      injectionRiskScore: clamp(samples.length < 40 ? 68 : 10),
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
            detector: mediaPipeActive ? "mediapipe_face_hand_mesh" : "admin_camera_canvas",
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
    setDetectorLabel("Canvas fallback")
    setSignatureStatus(null)
    samplesRef.current = []
    timingsRef.current = []
    previousPixelsRef.current = null
    smoothedFaceLandmarksRef.current = []
    smoothedHandLandmarksRef.current = []
    const resetSignal = emptySignal()
    liveSignalRef.current = resetSignal
    setLiveSignal(resetSignal)
    const overlay = overlayCanvasRef.current
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
  }

  const currentStep = session?.challengeSequence[stepIndex]

  return (
    <div className="glass-panel premium-card animated-border rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">Enterprise liveness scan</Badge>
            <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">{detectorLabel}</Badge>
            {phase === "running" && <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Step {stepIndex + 1}/{session?.challengeSequence.length ?? 0}</Badge>}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Humanity Scan</h2>
          <p className="mt-1 text-sm text-slate-300">Profesyonel HUD, yüz mesh, el mesh ve canlı liveness doğrulama. Hareket doğrulanmadan adım geçmez.</p>
        </div>
        <Video className="text-primary" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><XCircle className="mr-2 inline size-4" />{error}</div>}

      {(phase === "camera" || phase === "running" || phase === "submitting") && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-black shadow-[0_0_60px_rgba(56,189,248,0.12)]">
          <video ref={videoRef} playsInline muted className="aspect-video w-full -scale-x-100 object-cover" />
          <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 size-full" />
          <canvas ref={sampleCanvasRef} className="hidden" />
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-primary/30 bg-black/75 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold text-white">{phase === "running" ? stepTitle(currentStep) : phase === "submitting" ? "Submitting verified signals" : "Camera ready"}</p>
                <p className="text-slate-300">{phase === "running" ? stepHelp(currentStep) : stepReason}</p>
              </div>
              <span className="font-mono text-cyan-200">Face {liveSignal.facePresent ? "LOCK" : "WAIT"} / Hand {liveSignal.handPresent ? "LOCK" : "WAIT"}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-300"><span>Status: {stepReason}</span><span>Confidence: {Math.round(liveSignal.confidence)}%</span><span>Yaw: {liveSignal.yaw.toFixed(2)}</span></div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {phase === "idle" && <button onClick={startSession} className={`${buttonVariants()} glow-primary`}><Camera data-icon="inline-start" /> Start real humanity scan</button>}
        {phase === "starting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Creating secure challenge...</p>}
        {phase === "camera" && <button onClick={allowCamera} className={buttonVariants({ variant: "outline" })}>Allow camera and begin scan</button>}
        {phase === "running" && <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-slate-300">Acele etme. Sistem her adımda yüz/el sinyalini sabit görünce geçecek.</p>}
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
