"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  CircleAlert,
  Crosshair,
  Gauge,
  Loader2,
  LockKeyhole,
  Play,
  ShieldCheck,
  ShieldX,
  Sparkles,
  TimerReset,
  Trophy,
  XCircle,
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
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answersRef = useRef<Array<{ cardId: string; decision: Decision }>>([])
  const sessionRef = useRef<ActiveSession | null>(null)

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
  const completion = session ? Math.round((answers.length / session.cards.length) * 100) : 0

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
    const nextAnswers = [...answersRef.current, { cardId: activeCard.id, decision }]
    setAnswers(nextAnswers)
    if (index === (session?.cards.length ?? 1) - 1) {
      window.setTimeout(() => { void submitRound(nextAnswers) }, 260)
      return
    }
    window.setTimeout(() => {
      setIndex((value) => value + 1)
      setChoiceLocked(false)
    }, 220)
  }

  const statusLabel = useMemo(() => {
    if (loading) return "Checking daily run"
    if (!registered) return "Profile required"
    if (session) return "Run in progress"
    if (state?.status === "COMPLETED") return "Reward credited"
    if (state?.status === "EXHAUSTED") return "Daily attempts complete"
    return "Ready to play"
  }, [loading, registered, session, state?.status])

  return (
    <Card className="overflow-hidden border-cyan-400/25 bg-[#061525] shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
      <CardHeader className="border-b border-cyan-400/15 bg-[#071a2b]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><Crosshair className="size-6" /></span>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-cyan-300/30 text-cyan-100">Daily game</Badge><Badge variant="outline" className="border-emerald-300/30 text-emerald-100">Up to 105 pts</Badge></div>
              <CardTitle className="text-2xl text-white">Signal Run</CardTitle>
              <CardDescription className="mt-2 max-w-2xl leading-6 text-slate-300">Classify live security signals as safe or block before the timer closes. Pass with 6 of 8 correct decisions.</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={session ? "border-amber-300/35 bg-amber-300/10 text-amber-100" : state?.status === "COMPLETED" ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100" : "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"}>{statusLabel}</Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5">
        {loading ? <div className="h-52 animate-pulse rounded-lg border border-cyan-400/15 bg-slate-950/60" /> : session && activeCard ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <section className="relative overflow-hidden rounded-lg border border-cyan-300/25 bg-slate-950/50 p-5 sm:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.12)_1px,transparent_1px)] [background-size:28px_28px]" />
              <div className="relative">
                <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-xs uppercase tracking-[0.16em] text-cyan-200">Signal {index + 1} / {session.cards.length}</span><span className={`flex items-center gap-2 font-mono text-lg ${secondsLeft <= 10 ? "text-rose-200" : "text-amber-200"}`}><Gauge className="size-4" /> {secondsLeft}s</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-300 transition-[width] duration-200" style={{ width: `${Math.max(0, (secondsLeft / 45) * 100)}%` }} /></div>
                <p className="mt-8 font-mono text-xs uppercase tracking-[0.15em] text-slate-500">{activeCard.category}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{activeCard.title}</h3>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">{activeCard.description}</p>
                <div className="mt-6 grid gap-2 sm:grid-cols-3">{activeCard.signals.map((signal) => <div key={signal} className="border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">{signal}</div>)}</div>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <Button type="button" onClick={() => choose("SAFE")} disabled={choiceLocked || submitting} className="h-14 bg-emerald-300 text-emerald-950 hover:bg-emerald-200"><ShieldCheck className="size-5" /> Safe signal</Button>
                  <Button type="button" onClick={() => choose("BLOCK")} disabled={choiceLocked || submitting} className="h-14 bg-rose-300 text-rose-950 hover:bg-rose-200"><ShieldX className="size-5" /> Block signal</Button>
                </div>
              </div>
            </section>
            <aside className="grid content-start gap-3">
              <div className="border border-slate-700 bg-slate-950/55 p-4"><p className="text-xs uppercase tracking-[0.15em] text-slate-500">Decision progress</p><p className="mt-2 font-mono text-3xl text-white">{answers.length}<span className="text-slate-600">/8</span></p><div className="mt-4 grid grid-cols-4 gap-2">{session.cards.map((card, cardIndex) => <span key={card.id} className={`h-2.5 ${cardIndex < answers.length ? "bg-cyan-300" : cardIndex === index ? "bg-amber-300" : "bg-slate-800"}`} />)}</div></div>
              <div className="border border-amber-300/20 bg-amber-300/[0.05] p-4 text-sm leading-6 text-amber-50"><TimerReset className="mb-2 size-4 text-amber-200" />One wrong answer does not end the run. Read every signal before you classify it.</div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-slate-700 bg-slate-950/50 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Daily attempts</p><p className="mt-2 font-mono text-2xl text-white">{state?.attemptsRemaining ?? 3}<span className="text-slate-600">/3</span></p></div>
              <div className="border border-slate-700 bg-slate-950/50 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Best score</p><p className="mt-2 font-mono text-2xl text-white">{state?.bestCorrectAnswers ?? 0}<span className="text-slate-600">/8</span></p></div>
              <div className="border border-slate-700 bg-slate-950/50 p-4"><p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current streak</p><p className="mt-2 flex items-center gap-2 font-mono text-2xl text-white"><Sparkles className="size-5 text-amber-300" />{state?.streak ?? 0} days</p></div>
            </div>
            {!registered ? <Button disabled className="h-12"><LockKeyhole /> Create profile to play</Button> : state?.status === "COMPLETED" ? <Button disabled className="h-12 border border-emerald-300/35 bg-emerald-300/15 text-emerald-100"><CheckCircle2 /> +{state.pointsAwarded} points earned</Button> : state?.status === "EXHAUSTED" ? <Button disabled className="h-12"><XCircle /> New run at UTC reset</Button> : <Button onClick={() => void start()} disabled={starting} className="h-12 bg-cyan-300 text-slate-950 hover:bg-cyan-200">{starting ? <Loader2 className="animate-spin" /> : <Play />} Start daily run</Button>}
          </div>
        )}
        {(notice || error) && <div className={`mt-4 flex gap-3 border p-3 text-sm ${error ? "border-rose-300/25 bg-rose-300/[0.08] text-rose-100" : "border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100"}`}>{error ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <Trophy className="mt-0.5 size-4 shrink-0" />}<span>{error ?? notice}</span></div>}
      </CardContent>
    </Card>
  )
}
