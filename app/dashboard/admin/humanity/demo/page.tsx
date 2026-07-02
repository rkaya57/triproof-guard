"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Camera, CheckCircle2, Loader2, Play, ShieldCheck, Wallet, XCircle } from "lucide-react"

import { AdminCameraChallenge } from "@/components/humanity/admin-camera-challenge"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatTimeUTC } from "@/lib/format"

type Campaign = {
  id: string
  name: string
  slug: string
  challengeLevel: string
}

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

function randomScore(base: number, spread = 12) {
  return Math.max(0, Math.min(100, Math.round(base + (Math.random() * spread * 2 - spread))))
}

function decisionClass(decision?: string) {
  if (decision === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (decision === "MANUAL_REVIEW") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  if (decision === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-primary/30 bg-primary/10 text-cyan-100"
}

export default function HumanityGateDemoPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState("")
  const [walletAddress, setWalletAddress] = useState("Ch8kCo2FW4HXQMTm2wpbLeaVZJxXa4Rg8S4KVXUxcdVm")
  const [walletChain, setWalletChain] = useState("solana")
  const [mode, setMode] = useState<"camera" | "simulator">("camera")
  const [session, setSession] = useState<Session | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  const currentStep = session?.challengeSequence[stepIndex]

  useEffect(() => {
    let cancelled = false

    async function loadCampaigns() {
      const res = await fetch("/api/humanity/campaigns", { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (cancelled) return
      if (!res.ok) {
        setError(data.error ?? "Could not load Humanity campaigns")
        return
      }
      const nextCampaigns = data.campaigns ?? []
      setError(null)
      setCampaigns(nextCampaigns)
      setCampaignId((current) => current || nextCampaigns[0]?.id || "")
    }

    void loadCampaigns()

    return () => {
      cancelled = true
    }
  }, [])

  async function startChallenge() {
    setLoading(true)
    setError(null)
    setSession(null)
    setResult(null)
    setStepIndex(0)
    try {
      const res = await fetch("/api/humanity/challenge/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, walletAddress, walletChain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Challenge could not start")
      setSession(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge could not start")
    } finally {
      setLoading(false)
    }
  }

  async function submitChallenge(mode: "good" | "gray" | "bad") {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const base = mode === "good" ? 88 : mode === "gray" ? 68 : 38
      const res = await fetch("/api/humanity/challenge/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.sessionId,
          walletAddress,
          walletChain,
          scores: {
            facePresenceScore: randomScore(base),
            headPoseScore: randomScore(base),
            eyeBlinkScore: randomScore(base),
            handGestureScore: randomScore(base),
            motionTimingScore: randomScore(base),
            frameConsistencyScore: randomScore(base),
            replayRiskScore: mode === "bad" ? randomScore(78) : randomScore(15),
            injectionRiskScore: mode === "bad" ? randomScore(76) : randomScore(12),
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Challenge submit failed")
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Challenge submit failed")
    } finally {
      setLoading(false)
    }
  }

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignId),
    [campaigns, campaignId]
  )

  return (
    <div className="flex flex-col gap-7">
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="border-purple-400/30 bg-purple-400/10 text-purple-100">Admin-only live sandbox</Badge>
          <Badge variant="outline" className="border-green-400/30 bg-green-400/10 text-green-200">Camera mode active</Badge>
        </div>
        <h1 className="text-gradient text-4xl font-semibold sm:text-5xl">Humanity Gate Demo</h1>
        <p className="mt-4 max-w-3xl text-slate-300">
          This admin-only sandbox now supports live camera-derived liveness scoring, API submission, verification storage and the wallet signature capture step. Raw video never leaves the browser.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard/admin/humanity" className={`${buttonVariants({ variant: "outline" })} text-white`}><ArrowLeft data-icon="inline-start" /> Humanity Lab</Link>
          <Link href="/dashboard/admin/humanity/verifications" className={`${buttonVariants({ variant: "outline" })} text-white`}>View verifications</Link>
        </div>
      </section>

      {error && (
        <Card className="glass-panel border-red-400/30 bg-red-400/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-200"><XCircle /> {error}</CardTitle>
            <CardDescription className="text-slate-300">If this mentions migrations, run Prisma migrate deploy.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card className="glass-panel premium-card animated-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><Wallet className="text-primary" /> Test setup</CardTitle>
          <CardDescription className="text-slate-300">Choose campaign, chain, wallet and test mode.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-4">
          <label className="grid gap-2 text-sm text-slate-300">
            Campaign
            <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-white">
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name} / {campaign.challengeLevel}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            Chain
            <select value={walletChain} onChange={(event) => setWalletChain(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-white">
              <option value="solana">Solana</option>
              <option value="evm">EVM</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-300 lg:col-span-2">
            Wallet address
            <input value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-cyan-200" />
          </label>
          <div className="flex flex-wrap gap-2 lg:col-span-4">
            <button onClick={() => setMode("camera")} className={`${buttonVariants({ variant: mode === "camera" ? "secondary" : "outline" })} text-white`}>Camera Mode</button>
            <button onClick={() => setMode("simulator")} className={`${buttonVariants({ variant: mode === "simulator" ? "secondary" : "outline" })} text-white`}>Simulator Mode</button>
          </div>
        </CardContent>
      </Card>

      {mode === "camera" ? (
        <AdminCameraChallenge campaignId={campaignId} walletAddress={walletAddress} walletChain={walletChain} />
      ) : (
        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="glass-panel premium-card animated-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Wallet className="text-primary" /> Start test session</CardTitle>
              <CardDescription className="text-slate-300">Simulator creates a live DB session without camera access.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <button disabled={!campaignId || loading} onClick={startChallenge} className={`${buttonVariants()} glow-primary`}>
                {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                Start simulator challenge
              </button>
            </CardContent>
          </Card>

          <Card className="glass-panel premium-card animated-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white"><Camera className="text-primary" /> Challenge flow</CardTitle>
              <CardDescription className="text-slate-300">Selected: {selectedCampaign?.name ?? "No campaign selected"}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!session ? (
                <p className="rounded-xl border border-border bg-background/45 p-4 text-sm text-slate-300">Start a simulator session to see the challenge sequence.</p>
              ) : (
                <>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Session</p>
                    <p className="mt-1 font-mono text-xs text-cyan-200">{session.sessionId}</p>
                    <p className="mt-2 text-sm text-slate-300">Level: {session.level} / expires: {formatTimeUTC(session.expiresAt)}</p>
                  </div>
                  <div className="grid gap-2">
                    {session.challengeSequence.map((step, index) => (
                      <button key={step + index} onClick={() => setStepIndex(index)} className={`rounded-xl border p-3 text-left transition ${stepIndex === index ? "border-primary bg-primary/10 text-white" : "border-border bg-background/45 text-slate-300"}`}>
                        <span className="font-mono text-xs text-primary">0{index + 1}</span> {step.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-4 text-sm text-slate-200">
                    Current simulated step: <span className="font-semibold text-purple-200">{currentStep?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => submitChallenge("good")} disabled={loading} className={buttonVariants({ variant: "outline" })}>Submit Good Human</button>
                    <button onClick={() => submitChallenge("gray")} disabled={loading} className={buttonVariants({ variant: "outline" })}>Submit Gray Zone</button>
                    <button onClick={() => submitChallenge("bad")} disabled={loading} className={buttonVariants({ variant: "outline" })}>Submit Bad Signal</button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {result && (
        <Card className={`glass-panel premium-card animated-border ${decisionClass(result.decision)}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck /> Humanity result: {result.decision.replace("_", " ")}</CardTitle>
            <CardDescription className="text-slate-200">Score: {result.humanSessionScore} · Verification ID: {result.verificationId}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-sm font-medium text-white">Reason codes</p>
              <p className="mt-2 font-mono text-xs text-slate-300">{JSON.stringify(result.reasonCodes)}</p>
            </div>
            <div className="rounded-xl border border-border bg-background/45 p-4">
              <p className="text-sm font-medium text-white">Message to sign next</p>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-slate-300">{result.signMessage}</pre>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-200">
              <CheckCircle2 className="size-4" /> Stored in HumanityVerification table.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
