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

type FrameSample = {
  brightness: number
  sharpness: number
  motion: number
  facePresent: boolean
  faceConfidence: number
}

type LiveSignal = {
  facePresent: boolean
  handPresent: boolean
  confidence: number
  motion: number
  brightness: number
  sharpness: number
}

const STEP_HOLD_MS = 900
const STEP_TIMEOUT_MS = 12000
const DESKTOP_SAMPLE_MS = 180
const MOBILE_SAMPLE_MS = 260
const UI_UPDATE_MS = 320
const OVERLAY_UPDATE_MS = 160

function emptySignal(): LiveSignal {
  return {
    facePresent: false,
    handPresent: false,
    confidence: 0,
    motion: 0,
    brightness: 0,
    sharpness: 0,
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function average(values: number[], fallback = 0) {
  const clean = values.filter((value) => Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : fallback
}

function nowMs() {
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
    case "LOOK_CENTER": return "Yüzün çerçevenin içinde ve ışık yüzüne gelsin."
    case "TURN_LEFT": return "Başını belirgin şekilde sola çevir ve kısa süre sabit tut."
    case "TURN_RIGHT": return "Başını belirgin şekilde sağa çevir ve kısa süre sabit tut."
    case "BLINK": return "Yüzün görünürken bir kez göz kırp."
    case "RAISE_HAND": return "Elini yüz hizasına kaldır ve hafif hareket ettir."
    case "SMILE": return "Kameraya bakıp kısa süre gülümse."
    default: return "Challenge hazırlanıyor."
  }
}

function validateStep(step: string | undefined, signal: LiveSignal) {
  if (!signal.facePresent && step !== "RAISE_HAND") return { ok: false, reason: "Yüz bulunamadı" }
  if (signal.facePresent && signal.confidence < 45 && step !== "RAISE_HAND") return { ok: false, reason: "Işığı artır / yüzünü yaklaştır" }

  switch (step) {
    case "LOOK_CENTER": {
      const ok = signal.facePresent && signal.motion < 24 && signal.confidence >= 55
      return ok ? { ok, reason: "Yüz ortalandı" } : { ok, reason: "Yüzünü merkeze al" }
    }
    case "TURN_LEFT":
    case "TURN_RIGHT": {
      const ok = signal.facePresent && signal.motion > 9
      return ok ? { ok, reason: "Baş hareketi algılandı" } : { ok, reason: "Başını daha belirgin çevir" }
    }
    case "BLINK": {
      const ok = signal.facePresent && signal.motion > 8
      return ok ? { ok, reason: "Göz kırpma / mikro hareket algılandı" } : { ok, reason: "Göz kırpma bekleniyor" }
    }
    case "RAISE_HAND": {
      const ok = signal.motion > 12 || signal.handPresent
      return ok ? { ok, reason: "El / hareket algılandı" } : { ok, reason: "Elini kameraya göster" }
    }
    case "SMILE": {
      const ok = signal.facePresent && signal.confidence >= 55 && signal.motion < 28
      return ok ? { ok, reason: "Yüz ifadesi sabitlendi" } : { ok, reason: "Yüzünü sabit tut ve gülümse" }
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

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + width, y, x + width, y + height, radius)
  ctx.arcTo(x + width, y + height, x, y + height, radius)
  ctx.arcTo(x, y + height, x, y, radius)
  ctx.arcTo(x, y, x + width, y, radius)
  ctx.closePath()
}

function drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, signal: LiveSignal, progress: number, currentStep?: string) {
  ctx.clearRect(0, 0, width, height)

  const frameW = width * 0.58
  const frameH = height * 0.58
  const frameX = (width - frameW) / 2
  const frameY = (height - frameH) / 2
  const color = signal.facePresent ? "rgba(34,197,94,0.95)" : "rgba(56,189,248,0.95)"

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.shadowColor = color
  ctx.shadowBlur = 10
  drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 28)
  ctx.stroke()
  ctx.shadowBlur = 0

  ctx.strokeStyle = "rgba(125,211,252,0.28)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(width / 2, frameY)
  ctx.lineTo(width / 2, frameY + frameH)
  ctx.moveTo(frameX, frameY + frameH / 2)
  ctx.lineTo(frameX + frameW, frameY + frameH / 2)
  ctx.stroke()

  ctx.fillStyle = "rgba(2,6,23,0.72)"
  drawRoundedRect(ctx, 16, 16, Math.min(330, width - 32), 76, 12)
  ctx.fill()
  ctx.fillStyle = "#e0f2fe"
  ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif"
  ctx.fillText(stepTitle(currentStep), 30, 42)
  ctx.font = "500 12px ui-monospace, SFMono-Regular, Menlo, monospace"
  ctx.fillText(`FACE ${signal.facePresent ? "LOCK" : "WAIT"} · CONF ${Math.round(signal.confidence)}% · MOTION ${signal.motion.toFixed(1)}`, 30, 68)

  ctx.fillStyle = "rgba(15,23,42,0.88)"
  drawRoundedRect(ctx, 18, height - 36, width - 36, 12, 999)
  ctx.fill()
  ctx.fillStyle = color
  drawRoundedRect(ctx, 18, height - 36, (width - 36) * Math.max(0.04, progress), 12, 999)
  ctx.fill()
  ctx.restore()
}

export function AdminCameraChallenge({ campaignId, walletAddress, walletChain }: { campaignId: string; walletAddress: string; walletChain: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
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

  function sampleFrame(): FrameSample | null {
    const video = videoRef.current
    const canvas = sampleCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null
    canvas.width = compactScan ? 72 : 88
    canvas.height = compactScan ? 54 : 66
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
    const facePresent = brightness > 34 && brightness < 238 && sharpness > 0.95
    const confidence = facePresent ? clamp(45 + sharpness * 8 + Math.max(0, 20 - Math.abs(118 - brightness) * 0.08)) : 0
    const signal: LiveSignal = {
      facePresent,
      handPresent: motion > 18,
      confidence,
      motion,
      brightness,
      sharpness,
    }
    liveSignalRef.current = signal
    updateUi(signal, progress)
    return { brightness, sharpness, motion, facePresent, faceConfidence: confidence }
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
    for (let i = 0; i < session.challengeSequence.length; i++) {
      if (cancelRef.current) return
      const step = session.challengeSequence[i]
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
        const sample = sampleFrame()
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
      await new Promise((resolve) => setTimeout(resolve, 280))
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
    const brightnessOk = brightnessAvg > 35 && brightnessAvg < 235
    const motionPeak = Math.max(0, ...samples.map((sample) => sample.motion))
    const scores = {
      facePresenceScore: clamp(brightnessOk ? faceConfidenceAvg + Math.min(15, sharpnessAvg * 2) : 35),
      headPoseScore: clamp(50 + Math.min(38, motionPeak * 3)),
      eyeBlinkScore: clamp(45 + Math.min(35, motionPeak * 2.2)),
      handGestureScore: clamp(session.challengeSequence.includes("RAISE_HAND") ? (motionPeak > 12 ? 84 : 42) : 80),
      motionTimingScore: clamp(70 + Math.min(20, motionAvg * 2)),
      frameConsistencyScore: clamp(88 - Math.abs(110 - brightnessAvg) * 0.18),
      replayRiskScore: clamp(sharpnessAvg < 1.6 ? 72 : 28 - Math.min(18, motionAvg)),
      injectionRiskScore: clamp(samples.length < 18 ? 68 : 12),
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
            detector: compactScan ? "admin_camera_lite_mobile" : "admin_camera_lite_desktop",
            stepTimingsMs: timingsRef.current,
            sampleCount: samples.length,
            faceSeenCount,
            avgBrightness: Math.round(brightnessAvg),
            avgMotion: Math.round(motionAvg),
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
    samplesRef.current = []
    timingsRef.current = []
    previousPixelsRef.current = null
    const resetSignal = emptySignal()
    liveSignalRef.current = resetSignal
    setLiveSignal(resetSignal)
    const overlay = overlayCanvasRef.current
    overlay?.getContext("2d")?.clearRect(0, 0, overlay.width, overlay.height)
  }

  const currentStep = session?.challengeSequence[stepIndex]

  return (
    <div className="glass-panel premium-card animated-border rounded-3xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">Lite liveness scan</Badge>
            <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Performance safe</Badge>
            {compactScan && <Badge variant="outline" className="border-purple-400/30 bg-purple-400/10 text-purple-100">Mobile portrait</Badge>}
            {phase === "running" && <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Step {stepIndex + 1}/{session?.challengeSequence.length ?? 0}</Badge>}
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Humanity Scan</h2>
          <p className="mt-1 text-sm text-slate-300">Donmayı azaltan lite kamera taraması. Video telefonda portrait açılır; yüzü kapatan panel artık kameranın üstüne binmez.</p>
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
              <span className="font-mono text-cyan-200">Face {liveSignal.facePresent ? "LOCK" : "WAIT"} / Motion {liveSignal.motion.toFixed(1)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-300"><span>Status: {stepReason}</span><span>Confidence: {Math.round(liveSignal.confidence)}%</span><span>Brightness: {Math.round(liveSignal.brightness)}</span></div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {phase === "idle" && <button onClick={startSession} className={`${buttonVariants()} glow-primary`}><Camera data-icon="inline-start" /> Start real humanity scan</button>}
        {phase === "starting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Creating secure challenge...</p>}
        {phase === "camera" && <button onClick={allowCamera} className={buttonVariants({ variant: "outline" })}>Allow camera and begin scan</button>}
        {phase === "running" && <p className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-slate-300">Yüzünü çerçevede tut. Sistem daha az CPU kullanmak için örnekleri kontrollü aralıklarla alıyor.</p>}
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
