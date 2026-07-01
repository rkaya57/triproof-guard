"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, RefreshCw, Signature, Video, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  createMediaPipeFaceSampler,
  type MediaPipeFaceSample,
  type MediaPipeFaceSampler,
  type NormalizedLandmark,
} from "@/lib/humanity/browser-mediapipe"
import { requestBrowserWalletSignature } from "@/lib/humanity/browser-wallet-signature"

type Session = { sessionId: string; nonce: string; challengeSequence: string[]; expiresAt: string; level: string }
type Result = { verificationId: string; decision: string; humanSessionScore: number; reasonCodes: string[]; proofExpiresAt: string; signMessage: string }
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
  faceLandmarks: NormalizedLandmark[]
  handLandmarks: NormalizedLandmark[]
}

const STEP_HOLD_MS = 1200
const STEP_TIMEOUT_MS = 14000
const SAMPLE_MS = 90

function emptySignal(): LiveSignal {
  return { facePresent: false, handPresent: false, yaw: 0, blinkScore: 0, smileScore: 0, confidence: 0, motion: 0, faceLandmarks: [], handLandmarks: [] }
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
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
    case "RAISE_HAND": return "Elini yüz hizasına kaldır; mor el noktaları görünmeli."
    case "SMILE": return "Kameraya bakarken kısa süre gülümse."
    default: return "Challenge hazırlanıyor."
  }
}

function validateStep(step: string | undefined, signal: LiveSignal, detectorReady: boolean) {
  if (!signal.facePresent && step !== "RAISE_HAND") return { ok: false, reason: "Yüz bulunamadı" }
  if (detectorReady && step !== "RAISE_HAND" && signal.confidence < 45) return { ok: false, reason: "Yüz mesh güveni düşük" }

  switch (step) {
    case "LOOK_CENTER": {
      const ok = detectorReady ? Math.abs(signal.yaw) < 0.22 : signal.facePresent && signal.motion < 20
      return ok ? { ok, reason: "Yüz ortalandı" } : { ok, reason: "Yüzünü daha ortaya al" }
    }
    case "TURN_LEFT": {
      const ok = detectorReady ? signal.yaw < -0.18 : signal.facePresent && signal.motion > 8
      return ok ? { ok, reason: "Sol dönüş algılandı" } : { ok, reason: "Başını daha sola çevir" }
    }
    case "TURN_RIGHT": {
      const ok = detectorReady ? signal.yaw > 0.18 : signal.facePresent && signal.motion > 8
      return ok ? { ok, reason: "Sağ dönüş algılandı" } : { ok, reason: "Başını daha sağa çevir" }
    }
    case "BLINK": {
      const ok = detectorReady ? signal.blinkScore > 0.38 : signal.facePresent && signal.motion > 11
      return ok ? { ok, reason: "Göz kırpma algılandı" } : { ok, reason: "Göz kırpma bekleniyor" }
    }
    case "RAISE_HAND": {
      const ok = detectorReady ? signal.handPresent : signal.motion > 13
      return ok ? { ok, reason: "El algılandı" } : { ok, reason: "Elini kameraya göster" }
    }
    case "SMILE": {
      const ok = detectorReady ? signal.smileScore > 0.25 : signal.facePresent && signal.motion < 18
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

function mirrorX(point: NormalizedLandmark, width: number) {
  return (1 - point.x) * width
}

function drawFace(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  if (!landmarks.length) return
  ctx.save()
  ctx.fillStyle = "rgba(34, 211, 238, 0.95)"
  const step = Math.max(1, Math.floor(landmarks.length / 150))
  for (let i = 0; i < landmarks.length; i += step) {
    const point = landmarks[i]
    ctx.beginPath()
    ctx.arc(mirrorX(point, width), point.y * height, 1.8, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawHand(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  if (!landmarks.length) return
  const fingers = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]
  ctx.save()
  ctx.strokeStyle = "rgba(168, 85, 247, 0.95)"
  ctx.fillStyle = "rgba(216, 180, 254, 0.95)"
  ctx.lineWidth = 3
  for (const chain of fingers) {
    ctx.beginPath()
    chain.forEach((index, offset) => {
      const point = landmarks[index]
      if (!point) return
      const x = mirrorX(point, width)
      const y = point.y * height
      if (offset === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  for (const point of landmarks) {
    ctx.beginPath()
    ctx.arc(mirrorX(point, width), point.y * height, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function AdminCameraChallenge({ campaignId, walletAddress, walletChain }: { campaignId: string; walletAddress: string; walletChain: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaPipeRef = useRef<MediaPipeFaceSampler | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
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
  const [liveSignal, setLiveSignal] = useState<LiveSignal>(liveSignalRef.current)

  function stopCamera() {
    cancelRef.current = true
    mediaPipeRef.current?.dispose()
    mediaPipeRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => () => stopCamera(), [])

  function drawOverlay(signal: LiveSignal, reason: string, currentProgress: number) {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video || video.videoWidth === 0 || video.videoHeight === 0) return

    canvas.width = video.clientWidth || video.videoWidth
    canvas.height = video.clientHeight || video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)

    const frameW = width * 0.48
    const frameH = height * 0.66
    const frameX = (width - frameW) / 2
    const frameY = height * 0.14
    ctx.strokeStyle = currentProgress > 0.8 ? "rgba(34,197,94,0.95)" : "rgba(56,189,248,0.95)"
    ctx.lineWidth = 2
    ctx.setLineDash([12, 8])
    ctx.strokeRect(frameX, frameY, frameW, frameH)
    ctx.setLineDash([])

    drawFace(ctx, signal.faceLandmarks, width, height)
    drawHand(ctx, signal.handLandmarks, width, height)

    const scanY = frameY + ((Date.now() / 9) % frameH)
    const gradient = ctx.createLinearGradient(frameX, scanY - 18, frameX, scanY + 18)
    gradient.addColorStop(0, "rgba(56,189,248,0)")
    gradient.addColorStop(0.5, "rgba(56,189,248,0.55)")
    gradient.addColorStop(1, "rgba(56,189,248,0)")
    ctx.fillStyle = gradient
    ctx.fillRect(frameX, scanY - 18, frameW, 36)

    ctx.fillStyle = "rgba(2,6,23,0.78)"
    ctx.fillRect(14, 14, Math.min(width - 28, 520), 100)
    ctx.fillStyle = "white"
    ctx.font = "600 18px system-ui"
    ctx.fillText(stepTitle(session?.challengeSequence[stepIndex]), 30, 48)
    ctx.fillStyle = "rgba(203,213,225,0.95)"
    ctx.font = "13px system-ui"
    ctx.fillText(reason.slice(0, 64), 30, 74)
    ctx.fillStyle = currentProgress > 0.8 ? "#22c55e" : "#38bdf8"
    ctx.fillRect(30, 91, Math.max(4, currentProgress * 320), 6)
  }

  function sampleFrame(): FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null

    const mp = mediaPipeRef.current?.sample()
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
    const signal: LiveSignal = {
      facePresent: mp?.facePresent ?? fallbackFace,
      handPresent: mp?.handPresent ?? false,
      yaw: mp?.yaw ?? 0,
      blinkScore: mp?.blinkScore ?? 0,
      smileScore: mp?.smileScore ?? 0,
      confidence: mp?.confidence ?? (fallbackFace ? 55 : 0),
      motion: Math.max(motion, mp?.centerMotion ?? 0),
      faceLandmarks: mp?.faceLandmarks ?? [],
      handLandmarks: mp?.handLandmarks ?? [],
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
      landmarkCount: mp?.landmarkCount ?? 0,
      handLandmarkCount: mp?.handLandmarkCount ?? 0,
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
    liveSignalRef.current = emptySignal()
    setLiveSignal(liveSignalRef.current)
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
      const started = performance.now()
      const stepStarted = performance.now()

      while (!cancelRef.current) {
        const now = performance.now()
        if (now - stepStarted > STEP_TIMEOUT_MS) {
          setError(`${stepTitle(step)} doğrulanamadı. Daha iyi ışıkta, daha yavaş ve belirgin hareketle tekrar dene.`)
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
          setProgress(holdProgress)
        } else {
          validSince = null
          setProgress(0)
        }
        setStepReason(validation.reason)
        drawOverlay(liveSignalRef.current, validation.reason, holdProgress)

        if (holdProgress >= 1) break
        await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS))
      }
      timingsRef.current.push(Math.round(performance.now() - started))
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
    const mediaPipeActive = samples.some((sample) => sample.landmarkCount > 0) && faceSeenCount > 12
    const brightnessOk = brightnessAvg > 35 && brightnessAvg < 235

    const scores = {
      facePresenceScore: clamp(mediaPipeActive ? faceConfidenceAvg : brightnessOk ? 68 + sharpnessAvg * 2 : 35),
      headPoseScore: clamp(mediaPipeActive ? 55 + yawRange * 130 : 48 + motionAvg * 4),
      eyeBlinkScore: clamp(mediaPipeActive ? blinkMax * 145 : 45 + motionAvg * 2),
      handGestureScore: clamp(session.challengeSequence.includes("RAISE_HAND") ? (handSeenCount > 8 ? 92 : 35) : 80),
      motionTimingScore: clamp(70 + Math.min(20, motionAvg * 2)),
      frameConsistencyScore: clamp(88 - Math.abs(110 - brightnessAvg) * 0.18),
      replayRiskScore: clamp(mediaPipeActive ? Math.max(5, 42 - motionAvg - yawRange * 40) : sharpnessAvg < 2 ? 72 : 25 - motionAvg),
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
    liveSignalRef.current = emptySignal()
    setLiveSignal(liveSignalRef.current)
    const overlay = overlayCanvasRef.current
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
  }

  const currentStep = session?.challengeSequence[stepIndex]

  return (
    <div className="glass-panel premium-card animated-border rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">Live liveness challenge</Badge>
            <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">{detectorLabel}</Badge>
            {phase === "running" && <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Step {stepIndex + 1}/{session?.challengeSequence.length ?? 0}</Badge>}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Humanity Scan</h2>
          <p className="mt-1 text-sm text-slate-300">Hareket doğrulanmadan sonraki adıma geçmez. Yüz mesh ve el noktaları canlı çizilir.</p>
        </div>
        <Video className="text-primary" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><XCircle className="mr-2 inline size-4" />{error}</div>}

      {(phase === "camera" || phase === "running" || phase === "submitting") && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full -scale-x-100 object-cover" />
          <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 size-full" />
          <canvas ref={sampleCanvasRef} className="hidden" />
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-primary/30 bg-black/75 p-3 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold text-white">{phase === "running" ? stepTitle(currentStep) : phase === "submitting" ? "Submitting verified signals" : "Camera ready"}</p>
                <p className="text-slate-300">{phase === "running" ? stepHelp(currentStep) : stepReason}</p>
              </div>
              <span className="font-mono text-cyan-200">Face {liveSignal.facePresent ? "LOCK" : "WAIT"} · Hand {liveSignal.handPresent ? "LOCK" : "WAIT"}</span>
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
        {phase === "running" && <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-slate-300">Acele etme. Sistem her adımda mesh/el sinyalini sabit görünce geçecek.</p>}
        {phase === "submitting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Submitting liveness evidence...</p>}
        {phase === "result" && result && (
          <div className={`rounded-2xl border p-4 ${decisionClass(result.decision)}`}>
            <p className="font-semibold text-white">Result: {result.decision.replace("_", " ")} · Score {Math.round(result.humanSessionScore)}</p>
            <p className="mt-2 font-mono text-xs text-slate-200">{JSON.stringify(result.reasonCodes)}</p>
            {result.decision === "APPROVED" && <button onClick={signWithWallet} className={`${buttonVariants()} mt-4`}><Signature data-icon="inline-start" /> Continue · Sign wallet</button>}
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
