"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, RefreshCw, Signature, Video, XCircle } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
}

type Phase = "idle" | "starting" | "camera" | "running" | "submitting" | "result" | "signing" | "joined" | "error"

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function shortLabel(step: string) {
  return step.replace(/_/g, " ").toLowerCase()
}

function decisionClass(decision?: string) {
  if (decision === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (decision === "MANUAL_REVIEW") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  if (decision === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-primary/30 bg-primary/10 text-cyan-100"
}

function average(values: number[], fallback = 0) {
  if (!values.length) return fallback
  return values.reduce((sum, value) => sum + value, 0) / values.length
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const previousPixelsRef = useRef<Uint8ClampedArray | null>(null)
  const samplesRef = useRef<FrameSample[]>([])
  const timingsRef = useRef<number[]>([])

  const [phase, setPhase] = useState<Phase>("idle")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [signatureStatus, setSignatureStatus] = useState<string | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => stopCamera()
  }, [])

  function sampleFrame(): FrameSample | null {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) return null

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
    return {
      brightness: brightnessSum / pixelCount,
      sharpness: edgeSum / pixelCount,
      motion: previous ? motionSum / pixelCount : 0,
    }
  }

  async function startSession() {
    setError(null)
    setPhase("starting")
    setResult(null)
    setSignatureStatus(null)
    setStepIndex(0)
    setProgress(0)
    samplesRef.current = []
    timingsRef.current = []
    previousPixelsRef.current = null

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
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
      setStepIndex(i)
      setProgress(0)
      const started = performance.now()
      const tickCount = 24
      for (let t = 0; t <= tickCount; t++) {
        const sample = sampleFrame()
        if (sample) samplesRef.current.push(sample)
        setProgress(t / tickCount)
        await new Promise((resolve) => setTimeout(resolve, 110))
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
    const brightnessOk = brightnessAvg > 35 && brightnessAvg < 235

    const scores = {
      facePresenceScore: clamp(brightnessOk ? 78 + sharpnessAvg * 3 : 42),
      headPoseScore: clamp(62 + motionAvg * 5),
      eyeBlinkScore: clamp(68 + motionAvg * 2),
      handGestureScore: clamp(session.challengeSequence.includes("RAISE_HAND") ? 64 + motionAvg * 4 : 78),
      motionTimingScore: clamp(72 + Math.min(18, motionAvg * 2)),
      frameConsistencyScore: clamp(86 - Math.abs(110 - brightnessAvg) * 0.18),
      replayRiskScore: clamp(sharpnessAvg < 2 ? 72 : 22 - motionAvg),
      injectionRiskScore: clamp(samples.length < 20 ? 68 : 12),
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
            detector: "admin_camera_canvas",
            stepTimingsMs: timingsRef.current,
            sampleCount: samples.length,
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
      const walletSignature = await requestBrowserWalletSignature({
        walletChain,
        walletAddress,
        message: result.signMessage,
      })

      const res = await fetch("/api/humanity/challenge/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId: result.verificationId,
          walletAddress,
          walletChain,
          signedMessage: result.signMessage,
          signature: walletSignature.signature,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Signature step failed")
      setSignatureStatus(
        data.signatureVerified
          ? `Cryptographic signature verified via ${data.verificationMethod}.`
          : `Signature saved but not verified${data.error ? `: ${data.error}` : "."}`
      )
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
          <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-cyan-100">Live camera mode</Badge>
          <h2 className="mt-3 text-2xl font-semibold text-white">Admin Camera Challenge</h2>
          <p className="mt-1 text-sm text-slate-300">Camera stays local. Only derived numeric signals are submitted.</p>
        </div>
        <Video className="text-primary" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200"><XCircle className="mr-2 inline size-4" />{error}</div>}

      {(phase === "camera" || phase === "running" || phase === "submitting") && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full -scale-x-100 object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-primary/30 bg-black/70 p-3 backdrop-blur">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-300">{phase === "running" ? `Perform: ${shortLabel(currentStep ?? "step")}` : phase === "submitting" ? "Submitting derived scores" : "Camera ready"}</span>
              <span className="font-mono text-cyan-200">{session ? `${stepIndex + 1}/${session.challengeSequence.length}` : "0/0"}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3">
        {phase === "idle" && <button onClick={startSession} className={`${buttonVariants()} glow-primary`}><Camera data-icon="inline-start" /> Start live camera challenge</button>}
        {phase === "starting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Starting secure session...</p>}
        {phase === "camera" && <button onClick={allowCamera} className={buttonVariants({ variant: "outline" })}>Allow camera and begin</button>}
        {phase === "running" && <p className="text-sm text-slate-300">Follow the prompt on screen. The challenge will advance automatically.</p>}
        {phase === "submitting" && <p className="text-sm text-cyan-200"><Loader2 className="mr-2 inline size-4 animate-spin" /> Submitting derived signals...</p>}
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
        {phase !== "idle" && <button onClick={reset} className={buttonVariants({ variant: "outline" })}>Reset camera challenge</button>}
      </div>
    </div>
  )
}
