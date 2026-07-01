"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, RefreshCw, Signature, Video, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { createMediaPipeFaceSampler, type MediaPipeFaceSampler, type NormalizedLandmark } from "@/lib/humanity/browser-mediapipe"
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

type FrameSample = {
  brightness: number
  sharpness: number
  motion: number
  facePresent?: boolean
  handPresent?: boolean
  faceConfidence?: number
  landmarkCount?: number
  handLandmarkCount?: number
  yaw?: number
  blinkScore?: number
  smileScore?: number
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

type Phase = "idle" | "starting" | "camera" | "running" | "submitting" | "result" | "signing" | "joined" | "error"

const STEP_HOLD_MS = 1200
const STEP_TIMEOUT_MS = 14000

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  if (!clean.length) return fallback
  return clean.reduce((sum, value) => sum + value, 0) / clean.length
}

function stepTitle(step?: string) {
  switch (step) {
    case "LOOK_CENTER":
      return "Yüzünü ortala"
    case "TURN_LEFT":
      return "Başını sola çevir"
    case "TURN_RIGHT":
      return "Başını sağa çevir"
    case "BLINK":
      return "Göz kırp"
    case "RAISE_HAND":
      return "Elini kaldır"
    case "SMILE":
      return "Gülümse"
    default:
      return "Hazır ol"
  }
}

function stepHelp(step?: string) {
  switch (step) {
    case "LOOK_CENTER":
      return "Yüz mesh ekranda sabit görünene kadar kameraya düz bak."
    case "TURN_LEFT":
      return "Kameraya göre başını belirgin şekilde sola çevir ve bekle."
    case "TURN_RIGHT":
      return "Kameraya göre başını belirgin şekilde sağa çevir ve bekle."
    case "BLINK":
      return "Gözlerini kapatıp aç. Blink sinyali yakalanınca geçer."
    case "RAISE_HAND":
      return "Elini yüz hizasına kaldır. El noktaları görünene kadar bekle."
    case "SMILE":
      return "Kısa süre gülümse."
    default:
      return "Challenge başlatılıyor."
  }
}

function validateStep(step: string | undefined, signal: LiveSignal) {
  if (!signal.facePresent) return { ok: false, reason: "Yüz bulunamadı" }
  if (signal.confidence < 45) return { ok: false, reason: "Yüz güveni düşük" }

  switch (step) {
    case "LOOK_CENTER":
      return Math.abs(signal.yaw) < 0.22
        ? { ok: true, reason: "Yüz ortalandı" }
        : { ok: false, reason: "Yüzünü daha ortaya al" }
    case "TURN_LEFT":
      return signal.yaw < -0.18
        ? { ok: true, reason: "Sol dönüş algılandı" }
        : { ok: false, reason: "Başını daha sola çevir" }
    case "TURN_RIGHT":
      return signal.yaw > 0.18
        ? { ok: true, reason: "Sağ dönüş algılandı" }
        : { ok: false, reason: "Başını daha sağa çevir" }
    case "BLINK":
      return signal.blinkScore > 0.42
        ? { ok: true, reason: "Göz kırpma algılandı" }
        : { ok: false, reason: "Göz kırpma bekleniyor" }
    case "RAISE_HAND":
      return signal.handPresent
        ? { ok: true, reason: "El algılandı" }
        : { ok: false, reason: "Elini kameraya göster" }
    case "SMILE":
      return signal.smileScore > 0.25
        ? { ok: true, reason: "Gülümseme algılandı" }
        : { ok: false, reason: "Gülümseme bekleniyor" }
    default:
      return { ok: true, reason: "Hazır" }
  }
}

function decisionClass(decision?: string) {
  if (decision === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (decision === "MANUAL_REVIEW") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  if (decision === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-primary/30 bg-primary/10 text-cyan-100"
}

function drawLandmarks(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  radius: number,
  alpha = 0.95
) {
  if (!landmarks.length) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = "rgba(34, 211, 238, 0.95)"
  for (let i = 0; i < landmarks.length; i += Math.max(1, Math.floor(landmarks.length / 130))) {
    const point = landmarks[i]
    ctx.beginPath()
    ctx.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawHand(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  if (!landmarks.length) return
  const fingers = [
    [0, 1, 2, 3, 4],
    [0, 5, 6, 7, 8],
    [0, 9, 10, 11, 12],
    [0, 13, 14, 15, 16],
    [0, 17, 18, 19, 20],
  ]
  ctx.save()
  ctx.strokeStyle = "rgba(74, 222, 128, 0.95)"
  ctx.lineWidth = 3
  for (const chain of fingers) {
    ctx.beginPath()
    chain.forEach((index, chainIndex) => {
      const point = landmarks[index]
      if (!point) return
      const x = point.x * width
      const y = point.y * height
      if (chainIndex === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  ctx.fillStyle = "rgba(187, 247, 208, 0.95)"
  landmarks.forEach((point) => {
    ctx.beginPath()
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
}

export function AdminCameraChallenge({
  campaignId,
  walletAddress,
  walletChain,
}: {
  campaignId: string
  walletAddress: string
  walletChain: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaPipeRef = useRef<MediaPipeFaceSampler | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const samplesRef = useRef<FrameSample[]>([])
  const timingsRef = useRef<number[]>([])
  const cancelRef = useRef(false)

  const [phase, setPhase] = useState<Phase>("idle")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [stepReason, setStepReason] = useState("Hazır")
  const [detectorLabel, setDetectorLabel] = useState("Canvas fallback")
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)
  const [liveSignal, setLiveSignal] = useState<LiveSignal>({
    facePresent: false,
    handPresent: false,
    yaw: 0,
    blinkScore: 0,
    smileScore: 0,
    confidence: 0,
    motion: 0,
    faceLandmarks: [],
    handLandmarks: [],
  })

  function stopCamera() {
    cancelRef.current = true
    mediaPipeRef.current?.dispose()
    mediaPipeRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => stopCamera()
  }, [])

  function drawOverlay(signal: LiveSignal) {
    const canvas = overlayCanvasRef.current
    const video = videoRef.current
    if (!canvas || !video || video.videoWidth === 0 || video.videoHeight === 0) return
    canvas.width = video.clientWidth || video.videoWidth
    canvas.height = video.clientHeight || video.videoHeight
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLandmarks(ctx, signal.faceLandmarks, canvas.width, canvas.height, 1.7, 0.85)
    drawHand(ctx, signal.handLandmarks, canvas.width, canvas.height)
  }

  function sampleFrame(): FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null

    const mediaPipeSample = mediaPipeRef.current?.sample()
    const width = 96
    const height = 72
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, width, height)
    const image = ctx.getImageData(0, 0, width, height)
    const data = image.data

    let brightnessSum = 0
    let edgeSum = 0
    let motionSum = 0
    const previous = previousPixelsRef.current

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3
      brightnessSum += gray
      if (previous) motionSum += Math.abs(gray - previous[i])
      if (i >= 4) {
        const prevGray = (data[i - 4] + data[i - 3] + data[i - 2]) / 3
        edgeSum += Math.abs(gray - prevGray)
      }
    }

    previousPixelsRef.current = new Uint8ClampedArray(data)
    const pixelCount = data.length / 4
    const canvasMotion = previous ? motionSum / pixelCount : 0
    const signal: LiveSignal = {
      facePresent: Boolean(mediaPipeSample?.facePresent),
      handPresent: Boolean(mediaPipeSample?.handPresent),
      yaw: mediaPipeSample?.yaw ?? 0,
      blinkScore: mediaPipeSample?.blinkScore ?? 0,
      smileScore: mediaPipeSample?.smileScore ?? 0,
      confidence: mediaPipeSample?.confidence ?? 0,
      motion: Math.max(canvasMotion, mediaPipeSample?.centerMotion ?? 0),
      faceLandmarks: mediaPipeSample?.faceLandmarks ?? [],
      handLandmarks: mediaPipeSample?.handLandmarks ?? [],
    }
    setLiveSignal(signal)
    drawOverlay(signal)

    return {
      brightness: brightnessSum / pixelCount,
      sharpness: edgeSum / pixelCount,
      motion: signal.motion,
      facePresent: signal.facePresent,
      handPresent: signal.handPresent,
      faceConfidence: signal.confidence,
      landmarkCount: mediaPipeSample?.landmarkCount,
      handLandmarkCount: mediaPipeSample?.handLandmarkCount,
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
          mediaPipeRef.current = await createMediaPipeFaceSampler(videoRef.current)
          setDetectorLabel("MediaPipe Face + Hand Mesh")
        } catch (mpError) {
          console.warn("[HumanityGate] MediaPipe unavailable, using canvas fallback", mpError)
          setDetectorLabel("Canvas fallback")
        }
      }
      void runChallenge()
    } catch (err) {
      setError(err instanceof Error ? `Camera access failed: ${err.message}` : "Camera access failed")
      setPhase("error")
    }
  }

  async function runChallenge() {
    if (!session) return
    setPhase("running")
    const steps = session.challengeSequence
    for (let i = 0; i < steps.length; i++) {
      if (cancelRef.current) return
      setStepIndex(i)
      setProgress(0)
      setStepReason(stepHelp(steps[i]))
      let validSince: number | null = null
      const started = performance.now()
      const stepStarted = performance.now()

      while (!cancelRef.current) {
        const sample = sampleFrame()
        if (sample) samplesRef.current.push(sample)
        const validation = validateStep(steps[i], liveSignal)
        const now = performance.now()

        if (validation.ok) {
          validSince ??= now
          const holdProgress = Math.min(1, (now - validSince) / STEP_HOLD_MS)
          setProgress(holdProgress)
          setStepReason(validation.reason)
          if (holdProgress >= 1) break
        } else {
          validSince = null
          setProgress(0)
          setStepReason(validation.reason)
        }

        if (now - stepStarted > STEP_TIMEOUT_MS) {
          setStepReason("Bu adım doğrulanamadı, tekrar dene")
          validSince = null
        }

        await new Promise((resolve) => setTimeout(resolve, 80))
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
    const faceConfidenceAvg = average(samples.map((sample) => sample.faceConfidence ?? Number.NaN), Number.NaN)
    const yawRange = Math.max(...samples.map((sample) => sample.yaw ?? 0), 0) - Math.min(...samples.map((sample) => sample.yaw ?? 0), 0)
    const blinkMax = Math.max(...samples.map((sample) => sample.blinkScore ?? 0), 0)
    const smileMax = Math.max(...samples.map((sample) => sample.smileScore ?? 0), 0)
    const faceSeenCount = samples.filter((sample) => sample.facePresent).length
    const handSeenCount = samples.filter((sample) => sample.handPresent).length
    const brightnessOk = brightnessAvg > 35 && brightnessAvg < 235
    const mediaPipeActive = Number.isFinite(faceConfidenceAvg) && faceSeenCount > 12

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
            yawRange: Number(yawRange.toFixed(3)),
            blinkMax: Number(blinkMax.toFixed(3)),
            smileMax: Number(smileMax.toFixed(3)),
            avgBrightness: Math.round(brightnessAvg),
            avgMotion: Math.round(motionAvg),
            avgFaceConfidence: mediaPipeActive ? Math.round(faceConfidenceAvg) : null,
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
  }

  const currentStep = session?.challengeSequence[stepIndex]

  return (
    <div className="glass-panel premium-card animated-border rounded-3xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">Live camera mode</Badge>
            <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">{detectorLabel}</Badge>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Real Humanity Challenge</h2>
          <p className="mt-1 text-sm text-slate-300">Adım doğrulanmadan geçmez. Yüz ve el landmarkları ekranda çizilir.</p>
        </div>
        <Video className="text-primary" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><XCircle className="mr-2 inline size-4" />{error}</div>}

      {(phase === "camera" || phase === "running" || phase === "submitting") && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full -scale-x-100 object-cover" />
          <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" />
          <canvas ref={sampleCanvasRef} className="hidden" />
          <div className="absolute inset-x-4 top-4 rounded-xl border border-primary/30 bg-black/75 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-white">{stepTitle(currentStep)}</p>
                <p className="text-sm text-slate-300">{stepHelp(currentStep)}</p>
              </div>
              <div className="font-mono text-sm text-cyan-200">{session ? `${stepIndex + 1}/${session.challengeSequence.length}` : "0/0"}</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <p className="mt-2 text-xs text-slate-300">{stepReason}</p>
          </div>
          <div className="absolute bottom-4 left-4 right-4 grid gap-2 rounded-xl border border-slate-700 bg-black/70 p-3 text-xs text-slate-200 backdrop-blur sm:grid-cols-5">
            <span>Face: {liveSignal.facePresent ? "OK" : "No"}</span>
            <span>Hand: {liveSignal.handPresent ? "OK" : "No"}</span>
            <span>Yaw: {liveSignal.yaw.toFixed(2)}</span>
            <span>Blink: {liveSignal.blinkScore.toFixed(2)}</span>
            <span>Conf: {Math.round(liveSignal.confidence)}</span>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {phase === "idle" && <button onClick={startSession} className={`${buttonVariants()} glow-primary`}><Camera data-icon="inline-start" /> Start real camera challenge</button>}
        {phase === "starting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Secure session başlatılıyor...</p>}
        {phase === "camera" && <button onClick={allowCamera} className={buttonVariants({ variant: "outline" })}>Allow camera and begin real scan</button>}
        {phase === "running" && <p className="text-sm text-slate-300">Ekrandaki talimatı yap. Sistem hareketi doğrulamadan ilerlemez.</p>}
        {phase === "submitting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Gerçek challenge sinyalleri gönderiliyor...</p>}
        {phase === "result" && result && (
          <div className={`rounded-2xl border p-4 ${decisionClass(result.decision)}`}>
            <p className="font-semibold text-white">Result: {result.decision.replace("_", " ")} · Score {Math.round(result.humanSessionScore)}</p>
            <p className="mt-2 font-mono text-xs text-slate-200">{JSON.stringify(result.reasonCodes)}</p>
            {result.decision === "APPROVED" && <button onClick={signWithWallet} className={`${buttonVariants()} mt-4`}><Signature data-icon="inline-start" /> Continue · Sign wallet</button>}
            {result.decision !== "APPROVED" && <button onClick={reset} className={`${buttonVariants({ variant: "outline" })} mt-4`}><RefreshCw data-icon="inline-start" /> Try again</button>}
          </div>
        )}
        {phase === "signing" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Wallet signature bekleniyor...</p>}
        {phase === "joined" && <div className="rounded-xl border border-green-400/30 bg-green-400/10 p-4 text-green-200"><CheckCircle2 className="mr-2 inline size-4" /> Sandbox campaign joined. {signatureStatus}</div>}
        {phase !== "idle" && <button onClick={reset} className={buttonVariants({ variant: "outline" })}>Reset camera challenge</button>}
      </div>
    </div>
  )
}
