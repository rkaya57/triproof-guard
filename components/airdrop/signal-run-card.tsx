"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Crosshair,
  Gamepad2,
  Gauge,
  Loader2,
  LockKeyhole,
  Play,
  Radio,
  ScanEye,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TimerReset,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Decision = "SAFE" | "BLOCK"

type SignalCard = {
  id: string
  category: string
  title: string
  description: string
  signals: string[]
}

type SignalRunState = {
  status: "READY" | "ACTIVE" | "COMPLETED" | "EXHAUSTED"
  challengeDate: string
  attemptsUsed: number
  attemptsRemaining: number
  bestCorrectAnswers: number
  correctAnswers: number
  pointsAwarded: number
  streak: number
  completedAt: string | null
  nextResetAt: string
}

type SignalRunResponse = {
  registered?: boolean
  signalRun?: SignalRunState
  session?: { id: string; expiresAt: string; cards: SignalCard[] }
  totalPoints?: number | null
  passed?: boolean
  error?: string
}

type ActiveSession = NonNullable<SignalRunResponse["session"]>

async function readResponse(response: Response) {
  return (await response.json().catch(() => null)) as SignalRunResponse | null
}

function formatReset(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "at UTC reset"
  return date.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
}

export function SignalRunCard() {
  const [state, setState] = useState<SignalRunState | null>(null)
  const [registered, setRegistered] = useState(false)
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Array<{ cardId: string; decision: Decision }>>([])
  const [secondsLeft, setSecondsLeft] = useState(45)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [choiceLocked, setChoiceLocked] = useState(false)
  const [lastDecision, setLastDecision] = useState<Decision | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answersRef = useRef<Array<{ cardId: string; decision: Decision }>>([])
  const sessionRef = useRef<ActiveSession | null>(null)
  const chooseRef = useRef<(decision: Decision) => void>(() => undefined)

  async function load() {
    setLoading(true)
    try {
      const response = await fetch(`/api/airdrop/signal-run?ts=${Date.now()}`, { cache: "no-store" })
      const body = await readResponse(response)
      if (!response.ok || !body?.signalRun) throw new Error(body?.error ?? "Could not load Signal Run.")
      setState(body.signalRun)
      setRegistered(Boolean(body.registered))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Signal Run.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { sessionRef.current = session }, [session])

  const activeCard = session?.cards[index] ?? null

  async function submitRound(finalAnswers: Array<{ cardId: string; decision: Decision }>) {
    const active = sessionRef.current
    if (!active || submitting) return
    setSubmitting(true)
    setChoiceLocked(true)
    setError(null)
    try {
      const response = await fetch("/api/airdrop/signal-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", sessionId: active.id, answers: finalAnswers }),
      })
      const body = await readResponse(response)
      if (!response.ok || !body?.signalRun) {
        if (response.status === 409) {
          setSession(null)
          setIndex(0)
          setAnswers([])
          await load()
        }
        throw new Error(body?.error ?? "Could not score Signal Run.")
      }
      setState(body.signalRun)
      setSession(null)
      setIndex(0)
      setAnswers([])
      if (body.passed) {
        setNotice(`Signal Run cleared. +${body.signalRun.pointsAwarded} points credited with a ${body.signalRun.streak}-day streak.`)
        window.dispatchEvent(new Event("airdrop:points-updated"))
      } else if (body.signalRun.status === "EXHAUSTED") {
        setNotice(`Best score: ${body.signalRun.bestCorrectAnswers}/8. Today's attempts are complete; a new run opens ${formatReset(body.signalRun.nextResetAt)}.`)
      } else {
        setNotice(`${body.signalRun.correctAnswers}/8 correct. ${body.signalRun.attemptsRemaining} attempts remaining today.`)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not score Signal Run.")
      setChoiceLocked(false)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (!session) return
    const updateClock = () => {
      const remaining = Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) void submitRound(answersRef.current)
    }
    updateClock()
    const timer = window.setInterval(updateClock, 250)
    return () => window.clearInterval(timer)
  }, [session])

  async function start() {
    if (starting || !registered) return
    setStarting(true)
    setNotice(null)
    setError(null)
    try {
      const response = await fetch("/api/airdrop/signal-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      const body = await readResponse(response)
      if (!response.ok || !body?.signalRun) throw new Error(body?.error ?? "Could not start Signal Run.")
      setState(body.signalRun)
      if (!body.session) return
      setSession(body.session)
      setIndex(0)
      setAnswers([])
      setChoiceLocked(false)
      setLastDecision(null)
      setSecondsLeft(Math.max(0, Math.ceil((new Date(body.session.expiresAt).getTime() - Date.now()) / 1000)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start Signal Run.")
    } finally {
      setStarting(false)
    }
  }

  function choose(decision: Decision) {
    if (!activeCard || choiceLocked || submitting) return
    setChoiceLocked(true)
    setLastDecision(decision)
    const nextAnswers = [...answersRef.current, { cardId: activeCard.id, decision }]
    setAnswers(nextAnswers)
    if (index === (session?.cards.length ?? 1) - 1) {
      window.setTimeout(() => { void submitRound(nextAnswers) }, 520)
      return
    }
    window.setTimeout(() => {
      setIndex((value) => value + 1)
      setChoiceLocked(false)
      setLastDecision(null)
    }, 500)
  }

  chooseRef.current = choose

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !sessionRef.current) return
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") chooseRef.current("SAFE")
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") chooseRef.current("BLOCK")
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const statusLabel = useMemo(() => {
    if (loading) return "Checking daily run"
    if (!registered) return "Profile required"
    if (session) return "Run in progress"
    if (state?.status === "COMPLETED") return "Reward credited"
    if (state?.status === "EXHAUSTED") return "Daily attempts complete"
    return "Ready to play"
  }, [loading, registered, session, state?.status])

  return (
    <Card className="relative overflow-hidden border-cyan-400/35 bg-[#041222] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-cyan-200/80" />
      <CardHeader className="relative border-b border-cyan-400/15 bg-[#06192b]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.14)]"><Crosshair className="size-6" /><span className="absolute right-1.5 top-1.5 size-1.5 animate-pulse rounded-full bg-emerald-300" /></span>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100"><Radio className="size-3" /> Daily game</Badge><Badge variant="outline" className="border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-100"><Zap className="size-3" /> Up to 105 pts</Badge></div>
              <CardTitle className="text-2xl text-white">Signal Run</CardTitle>
              <CardDescription className="mt-2 max-w-2xl leading-6 text-slate-300">Classify live security signals as safe or block before the timer closes. Pass with 6 of 8 correct decisions.</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start">
            <div className="hidden border-r border-cyan-400/15 pr-3 text-right sm:block"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Secure feed</p><p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-emerald-200"><span className="size-1.5 animate-pulse rounded-full bg-emerald-300" /> Live</p></div>
            <Badge variant="outline" className={session ? "border-amber-300/35 bg-amber-300/10 text-amber-100" : state?.status === "COMPLETED" ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}>{statusLabel}</Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {loading ? <div className="h-52 animate-pulse rounded-lg border border-cyan-400/15 bg-slate-950/60" /> : session && activeCard ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <section className="relative overflow-hidden rounded-lg border border-cyan-300/30 bg-[#061426] p-5 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.03)] sm:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
              <div className="signal-run-scanline pointer-events-none absolute inset-x-0 top-0 h-24" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-cyan-300/70" />
              <div key={activeCard.id} className={`signal-run-card relative ${lastDecision ? `signal-run-card-${lastDecision.toLowerCase()}` : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-cyan-200"><Activity className="size-3.5" /> Signal {index + 1} / {session.cards.length}</span><span className={`flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-lg ${secondsLeft <= 10 ? "border-rose-300/35 bg-rose-300/10 text-rose-200" : "border-amber-300/30 bg-amber-300/[0.06] text-amber-200"}`}><Gauge className="size-4" /> {secondsLeft}s</span></div>
                <div className="mt-3 h-2 overflow-hidden rounded-full border border-cyan-300/10 bg-slate-950"><div className="h-full bg-cyan-300 transition-[width] duration-200" style={{ width: `${Math.max(0, (secondsLeft / 45) * 100)}%` }} /></div>
                <div className="mt-7 flex items-start gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><ScanEye className="size-5" /></span><div><p className="font-mono text-xs uppercase tracking-[0.15em] text-slate-500">{activeCard.category}</p><h3 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{activeCard.title}</h3></div></div>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">{activeCard.description}</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-3">{activeCard.signals.map((signal) => <div key={signal} className="flex items-center gap-2 border border-slate-700 bg-slate-950/75 px-3 py-2 text-xs text-slate-300"><span className="size-1.5 shrink-0 rounded-full bg-cyan-300" />{signal}</div>)}</div>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <Button type="button" onClick={() => choose("SAFE")} disabled={choiceLocked || submitting} className="h-14 border border-emerald-200/40 bg-emerald-300 text-emerald-950 shadow-[0_8px_26px_rgba(52,211,153,0.18)] hover:bg-emerald-200"><ShieldCheck className="size-5" /> Safe signal <BadgeCheck className="ml-auto size-4" /></Button>
                  <Button type="button" onClick={() => choose("BLOCK")} disabled={choiceLocked || submitting} className="h-14 border border-rose-100/40 bg-rose-300 text-rose-950 shadow-[0_8px_26px_rgba(251,113,133,0.16)] hover:bg-rose-200"><ShieldX className="size-5" /> Block signal <XCircle className="ml-auto size-4" /></Button>
                </div>
                {lastDecision && <div className={`pointer-events-none absolute inset-0 grid place-items-center ${lastDecision === "SAFE" ? "text-emerald-200" : "text-rose-200"}`}><div className={`signal-run-capture border px-5 py-3 text-center font-mono text-sm font-bold uppercase tracking-[0.2em] ${lastDecision === "SAFE" ? "border-emerald-200/60 bg-emerald-300/15" : "border-rose-200/60 bg-rose-300/15"}`}>{lastDecision === "SAFE" ? "Safe route captured" : "Threat blocked"}</div></div>}
              </div>
            </section>
            <aside className="grid content-start gap-3">
              <div className="border border-cyan-300/20 bg-[#081a2e] p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.15em] text-slate-500">Decision progress</p><Crosshair className="size-4 text-cyan-200" /></div><p className="mt-2 font-mono text-3xl text-white">{answers.length}<span className="text-slate-600">/8</span></p><div className="mt-4 grid grid-cols-4 gap-2">{session.cards.map((card, cardIndex) => <span key={card.id} className={`h-2.5 border ${cardIndex < answers.length ? "border-cyan-200/40 bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.7)]" : cardIndex === index ? "border-amber-200/50 bg-amber-300" : "border-slate-700 bg-slate-900"}`} />)}</div></div>
              <div className="border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-6 text-amber-50"><TimerReset className="mb-2 size-4 text-amber-200" /><p className="font-medium text-amber-100">Mission rule</p><p className="mt-1 text-amber-50/80">One wrong answer does not end the run. Read every signal before you classify it.</p></div>
              <div className="border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4"><div className="flex items-center justify-between"><p className="text-xs uppercase tracking-[0.15em] text-fuchsia-100">Round energy</p><Gamepad2 className="size-4 text-fuchsia-200" /></div><div className="mt-3 flex h-2 gap-1">{Array.from({ length: 8 }).map((_, energyIndex) => <span key={energyIndex} className={`flex-1 ${energyIndex < answers.length ? "bg-fuchsia-300 shadow-[0_0_10px_rgba(232,121,249,.8)]" : "bg-slate-800"}`} />)}</div><p className="mt-3 text-xs text-fuchsia-100/75">Clear all eight signals to finish the run.</p></div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
            <div><div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-cyan-200"><Radio className="size-3.5 animate-pulse" /> Daily security drill</div><div className="grid gap-3 sm:grid-cols-3">
              <div className="relative overflow-hidden border border-cyan-300/20 bg-slate-950/60 p-4"><div className="absolute inset-x-0 top-0 h-px bg-cyan-200/70" /><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Daily attempts</p><p className="mt-2 font-mono text-2xl text-white">{state?.attemptsRemaining ?? 3}<span className="text-slate-600">/3</span></p></div>
              <div className="relative overflow-hidden border border-emerald-300/20 bg-slate-950/60 p-4"><div className="absolute inset-x-0 top-0 h-px bg-emerald-200/70" /><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Best score</p><p className="mt-2 font-mono text-2xl text-white">{state?.bestCorrectAnswers ?? 0}<span className="text-slate-600">/8</span></p></div>
              <div className="relative overflow-hidden border border-amber-300/20 bg-slate-950/60 p-4"><div className="absolute inset-x-0 top-0 h-px bg-amber-200/70" /><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current streak</p><p className="mt-2 flex items-center gap-2 font-mono text-2xl text-white"><Sparkles className="size-5 text-amber-300" />{state?.streak ?? 0} days</p></div>
            </div></div>
            {!registered ? <Button disabled className="h-12"><LockKeyhole /> Create profile to play</Button> : state?.status === "COMPLETED" ? <Button disabled className="h-12 border border-emerald-300/35 bg-emerald-300/15 text-emerald-100"><CheckCircle2 /> +{state.pointsAwarded} points earned</Button> : state?.status === "EXHAUSTED" ? <Button disabled className="h-12"><XCircle /> New run at UTC reset</Button> : <Button onClick={() => void start()} disabled={starting} className="h-12 border border-cyan-100/30 bg-cyan-300 px-6 text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.22)] hover:bg-cyan-200">{starting ? <Loader2 className="animate-spin" /> : <Play />} Start daily run</Button>}
            </div>
        )}
        {(notice || error) && <div className={`mt-4 flex gap-3 border p-3 text-sm ${error ? "border-rose-300/25 bg-rose-300/[0.08] text-rose-100" : "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"}`}>{error ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Trophy className="mt-0.5 size-4 shrink-0" />}<span>{error ?? notice}</span></div>}
      </CardContent>
    </Card>
  )
}
