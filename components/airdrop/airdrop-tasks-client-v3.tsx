"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  Gift,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RefreshCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED"
type TaskType = "X_FOLLOW" | "X_QUOTE" | "TELEGRAM_JOIN" | "THREAT_REPORT" | "HUMANITY_GATE_FEEDBACK"
type FilterMode = "all" | "available" | "pending" | "completed"

type ScamGuardResult = {
  completedAt: string
  decision: string
  scamGuardReadinessScore: number
  reasonCodes: string[]
}

type TaskSubmission = {
  id: string
  status: SubmissionStatus
  evidenceUrl: string | null
  feedbackText: string | null
  humanityTestResult: ScamGuardResult | null
  pointsAwarded: number
  adminNotes: string | null
  reviewedAt: string | null
  createdAt: string
}

type AirdropTask = {
  id: string
  slug: string
  title: string
  description: string
  targetUrl: string | null
  type: TaskType
  points: number
  proofRequired: boolean
  submission: TaskSubmission | null
}

type AirdropResponse = {
  user: { id: string; name: string; email: string }
  profile: null | {
    id: string
    xHandle: string | null
    rewardWallet: string | null
    totalPoints: number
    eligibilityStatus: string
    createdAt: string
  }
  summary: {
    seasonPoints: number
    approvedCount: number
    pendingCount: number
    rejectedCount: number
    registered: boolean
  }
  dailyThreatPool: {
    status: "READY" | "PENDING_REVIEW" | "CREDITED" | "AWAITING_PROFILE"
    points: number
  }
  leaderboard: Array<{
    rank: number
    name: string
    xHandle: string | null
    totalPoints: number
    approvedCount: number
    isCurrentUser: boolean
  }>
  tasks: AirdropTask[]
}

const triproofXUrl = "https://x.com/TriProof_"
const triproofTelegramUrl = "https://t.me/+MuFX4GKruRU1YTRk"

function taskIcon(type: TaskType) {
  if (type === "X_FOLLOW") return UserPlus
  if (type === "X_QUOTE") return MessageSquareText
  if (type === "TELEGRAM_JOIN") return Send
  if (type === "THREAT_REPORT") return ShieldAlert
  return ShieldCheck
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString()
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}))
  return body.error ?? "Request failed"
}

async function fileToDataUrl(file: File) {
  if (file.size > 1_250_000) throw new Error("Screenshot is too large. Use an image under 1.25 MB.")
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read screenshot."))
    reader.readAsDataURL(file)
  })
}

function mergeResponse(current: AirdropResponse | null, incoming: AirdropResponse) {
  if (!current) return incoming
  const localBySlug = new Map(current.tasks.map((task) => [task.slug, task]))
  return {
    ...incoming,
    tasks: incoming.tasks.map((task) => {
      const local = localBySlug.get(task.slug)
      const localStatus = local?.submission?.status
      if (!task.submission && local?.submission && (localStatus === "PENDING" || localStatus === "APPROVED")) {
        return { ...task, submission: local.submission }
      }
      return task
    }),
  }
}

function statusView(status?: SubmissionStatus | null) {
  if (status === "APPROVED") return { label: "Approved", tone: "green", icon: CheckCircle2 }
  if (status === "PENDING") return { label: "Awaiting verification", tone: "amber", icon: ClipboardCheck }
  if (status === "REJECTED") return { label: "Needs resubmission", tone: "red", icon: AlertCircle }
  return { label: "Not started", tone: "slate", icon: ChevronRight }
}

export function AirdropTasksClientV3() {
  const [data, setData] = useState<AirdropResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [scamGuardResult, setScamGuardResult] = useState<ScamGuardResult | null>(null)
  const [filter, setFilter] = useState<FilterMode>("all")
  const [query, setQuery] = useState("")

  const loadTasks = useCallback((silent = false, signal?: AbortSignal) => {
    return fetch(`/api/airdrop/me?ts=${Date.now()}`, {
      cache: "no-store",
      signal,
      headers: { "Cache-Control": "no-cache" },
    }).then(async (response) => {
      if (signal?.aborted) return
      if (response.status === 401) {
        setUnauthorized(true)
        return
      }
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as AirdropResponse
      if (signal?.aborted) return
      if (!Array.isArray(body.tasks)) throw new Error("Airdrop task response is not ready yet.")
      setData((current) => mergeResponse(current, body))
      setScamGuardResult(body.tasks.find((task) => task.type === "HUMANITY_GATE_FEEDBACK")?.submission?.humanityTestResult ?? null)
    }).catch((err) => {
      if (signal?.aborted) return
      if (!silent) setData(null)
      setError(err instanceof Error ? err.message : "Could not load airdrop tasks.")
    }).finally(() => {
      if (!signal?.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    })
  }, [])

  async function refresh(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    await loadTasks(silent)
  }

  useEffect(() => {
    const controller = new AbortController()
    void loadTasks(false, controller.signal)
    return () => controller.abort()
  }, [loadTasks])

  const completion = useMemo(() => {
    if (!data?.tasks.length) return 0
    const countable = data.tasks.filter((task) => task.type !== "THREAT_REPORT")
    if (!countable.length) return 0
    return Math.round((countable.filter((task) => task.submission?.status === "APPROVED").length / countable.length) * 100)
  }, [data])

  const filteredTasks = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLowerCase()
    return data.tasks.filter((task) => {
      const matchesQuery = !normalized || `${task.title} ${task.description}`.toLowerCase().includes(normalized)
      if (!matchesQuery) return false
      if (filter === "completed") return task.submission?.status === "APPROVED"
      if (filter === "pending") return task.submission?.status === "PENDING"
      if (filter === "available") return !task.submission || task.submission.status === "REJECTED"
      return true
    })
  }, [data, filter, query])

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const form = new FormData(event.currentTarget)
      const response = await fetch("/api/airdrop/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xHandle: form.get("xHandle"), rewardWallet: form.get("rewardWallet") }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setMessage("Contribution profile saved. Tasks are now unlocked.")
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>, task: AirdropTask) {
    event.preventDefault()
    const formElement = event.currentTarget
    const current = task.submission
    const completingFeedback = task.type === "HUMANITY_GATE_FEEDBACK" && current?.status === "PENDING" && Boolean(current.humanityTestResult) && !current.feedbackText
    if (busyTask === task.slug) return
    if ((current?.status === "PENDING" || current?.status === "APPROVED") && !completingFeedback) return
    setBusyTask(task.slug)
    setError(null)
    setMessage(null)
    try {
      const form = new FormData(formElement)
      const file = form.get("proof")
      const evidenceImageData = file instanceof File && file.size > 0 ? await fileToDataUrl(file) : undefined
      const response = await fetch("/api/airdrop/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskSlug: task.slug, evidenceUrl: form.get("evidenceUrl"), feedbackText: form.get("feedbackText"), evidenceImageData }),
      })
      if (!response.ok) {
        const responseError = await readError(response)
        if (response.status === 409) {
          await refresh(true)
          setMessage(responseError)
          return
        }
        throw new Error(responseError)
      }
      const body = (await response.json()) as { submission: TaskSubmission }
      setData((state) => state ? { ...state, tasks: state.tasks.map((item) => item.slug === task.slug ? { ...item, submission: body.submission } : item) } : state)
      formElement.reset()
      setMessage("Proof submitted. It is now waiting for verification.")
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setBusyTask((value) => value === task.slug ? null : value)
    }
  }

  async function runScamGuardTest() {
    if (busyTask) return
    setBusyTask("scamguard-test")
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/airdrop/scamguard-test", { method: "POST" })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { result: ScamGuardResult }
      setScamGuardResult(body.result)
      setMessage("ScamGuard test completed. Add your feedback to finish the task.")
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "ScamGuard test failed")
    } finally {
      setBusyTask(null)
    }
  }

  if (loading) {
    return <div className="grid gap-4"><div className="h-52 animate-pulse rounded-2xl border border-cyan-400/15 bg-slate-950/70" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/50" />)}</div></div>
  }

  if (unauthorized) {
    return <Card className="glass-panel mx-auto max-w-2xl"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><LockKeyhole className="text-cyan-300" /> Account required</CardTitle><CardDescription>Sign in before joining the contribution season.</CardDescription></CardHeader><CardContent className="flex gap-3"><Link href="/register" className={buttonVariants()}>Create account</Link><Link href="/login" className={buttonVariants({ variant: "outline" })}>Login</Link></CardContent></Card>
  }

  if (!data) {
    return <Card className="glass-panel mx-auto max-w-2xl border-amber-400/30"><CardHeader><CardTitle className="flex items-center gap-2 text-amber-100"><AlertCircle /> Tasks could not load</CardTitle><CardDescription>{error ?? "Try again."}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => void refresh()}>Try again</Button></CardContent></Card>
  }

  const profile = data.profile
  const availableCount = data.tasks.filter((task) => !task.submission || task.submission.status === "REJECTED").length
  const completedCount = data.tasks.filter((task) => task.submission?.status === "APPROVED").length
  const pendingCount = data.tasks.filter((task) => task.submission?.status === "PENDING").length

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.11),transparent_36%),linear-gradient(145deg,rgba(5,15,31,0.96),rgba(2,8,23,0.94))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)] sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm text-cyan-200"><Sparkles className="size-4" /><span>Contribution season</span></div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Airdrop Tasks</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Complete verified missions, earn contribution points, and build your standing in the Tri-Proof ecosystem.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={triproofXUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>Follow on X <ExternalLink className="size-4" /></a>
              <Button variant="outline" disabled={refreshing} onClick={() => void refresh(true)}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Refresh</Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-400/20 bg-[radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.24),transparent_42%),linear-gradient(145deg,rgba(18,13,45,0.96),rgba(6,10,25,0.96))] p-5">
          <div className="flex h-full flex-col justify-between gap-5">
            <div><Gift className="size-7 text-violet-300" /><p className="mt-4 text-lg font-semibold text-white">Complete tasks. Earn points. Unlock future rewards.</p><p className="mt-2 text-sm leading-6 text-slate-400">Only verified activity counts toward your contribution profile.</p></div>
            <div className="flex items-center justify-between"><Badge variant="outline" className="border-violet-400/30 bg-violet-400/10 text-violet-200">Season 0</Badge><span className="text-xs text-slate-500">No token guarantee</span></div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Total points</p><Trophy className="size-5 text-amber-300" /></div><p className="mt-3 font-mono text-3xl font-semibold text-white">{data.summary.seasonPoints}</p><div className="mt-4"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>Approved progress</span><span>{completion}%</span></div><Progress value={completion} /></div></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Tasks completed</p><CheckCircle2 className="size-5 text-emerald-300" /></div><p className="mt-3 font-mono text-3xl font-semibold text-white">{completedCount}</p><p className="mt-2 text-sm text-slate-500">{pendingCount} awaiting verification · {availableCount} available</p></div>
        <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5"><div className="flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Contribution profile</p><Users className="size-5 text-cyan-300" /></div><p className="mt-3 text-lg font-semibold text-white">{profile ? profile.xHandle ?? data.user.name : "Registration required"}</p><p className="mt-2 text-sm text-slate-500">{profile ? `${data.summary.approvedCount} approved submissions` : "Link your X handle and reward wallet to unlock tasks."}</p></div>
      </section>

      {(message || error) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-400/25 bg-red-400/10 text-red-100" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"}`}>{error ?? message}</div>}

      {!profile && <Card className="glass-panel border-cyan-400/20"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><WalletCards className="text-cyan-300" /> Join the contribution registry</CardTitle><CardDescription>Link one X handle and one reward wallet before submitting task evidence.</CardDescription></CardHeader><CardContent><form onSubmit={register} className="grid gap-3 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end"><label className="grid gap-2 text-sm text-slate-300">X handle<Input name="xHandle" placeholder="@yourhandle" required /></label><label className="grid gap-2 text-sm text-slate-300">Reward wallet<Input name="rewardWallet" placeholder="Solana or EVM wallet address" required /></label><Button type="submit">Register <ArrowRight /></Button></form></CardContent></Card>}

      <section className="rounded-2xl border border-slate-800 bg-slate-950/45 p-2 sm:p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1">
            {([
              ["all", `All tasks ${data.tasks.length}`],
              ["available", `Available ${availableCount}`],
              ["pending", `In review ${pendingCount}`],
              ["completed", `Completed ${completedCount}`],
            ] as Array<[FilterMode, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-3 py-2 text-sm transition ${filter === value ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/25" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}>{label}</button>)}
          </div>
          <label className="relative block w-full xl:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks..." className="pl-9" /></label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredTasks.map((task) => {
          const Icon = taskIcon(task.type)
          const submission = task.submission
          const approved = submission?.status === "APPROVED"
          const pending = submission?.status === "PENDING"
          const rejected = submission?.status === "REJECTED"
          const scamGuardTask = task.type === "HUMANITY_GATE_FEEDBACK"
          const threatPoolTask = task.type === "THREAT_REPORT"
          const testResult = scamGuardResult ?? submission?.humanityTestResult ?? null
          const scamGuardNeedsFeedback = scamGuardTask && pending && Boolean(testResult) && !submission?.feedbackText
          const locked = approved || (pending && !scamGuardNeedsFeedback)
          const taskBusy = busyTask === task.slug
          const targetUrl = task.targetUrl ?? (task.type === "TELEGRAM_JOIN" ? triproofTelegramUrl : triproofXUrl)
          const status = statusView(submission?.status)
          const StatusIcon = status.icon

          return <article key={task.slug} className="group flex min-h-[290px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[linear-gradient(145deg,rgba(7,17,33,0.96),rgba(3,9,21,0.96))] shadow-[0_14px_40px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:border-cyan-400/30">
            <div className="flex items-start justify-between gap-3 p-5 pb-4"><div className="flex gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/8 text-cyan-300"><Icon className="size-5" /></span><div><h3 className="font-semibold text-white">{task.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-400">{task.description}</p></div></div><span className="shrink-0 rounded-lg border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 font-mono text-xs font-semibold text-violet-200">{task.points} PTS</span></div>

            <div className="mx-5 mb-4 rounded-xl border border-slate-800/90 bg-slate-950/60 p-3">
              <div className={`flex items-center gap-2 text-xs font-medium ${status.tone === "green" ? "text-emerald-300" : status.tone === "amber" ? "text-amber-300" : status.tone === "red" ? "text-red-300" : "text-slate-400"}`}><StatusIcon className="size-4" /> {status.label}</div>
              {submission?.createdAt && <p className="mt-1 text-xs text-slate-600">Submitted {formatDate(submission.createdAt)}</p>}
              {approved && <p className="mt-1 text-xs text-emerald-400/70">{submission?.pointsAwarded ?? task.points} points credited</p>}
            </div>

            <div className="mt-auto space-y-3 border-t border-slate-800/80 p-5 pt-4">
              {task.type !== "THREAT_REPORT" && task.type !== "HUMANITY_GATE_FEEDBACK" && !locked && <a href={targetUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full justify-between`}>{task.type === "X_FOLLOW" ? "Open X profile" : task.type === "X_QUOTE" ? "Open post to quote" : "Open Telegram"}<ExternalLink className="size-4" /></a>}

              {threatPoolTask && <Link href="/threat-reports" className={`${buttonVariants({ variant: "outline" })} w-full justify-between`}>Open Threat Pool <ArrowRight className="size-4" /></Link>}

              {scamGuardTask && !testResult && <Button type="button" className="w-full" disabled={!profile || Boolean(busyTask)} onClick={() => void runScamGuardTest()}>{busyTask === "scamguard-test" ? <Loader2 className="animate-spin" /> : <ShieldAlert />} Run ScamGuard test</Button>}

              {scamGuardTask && testResult && <div className="rounded-xl border border-violet-400/20 bg-violet-400/8 p-3 text-xs text-violet-100"><p className="flex items-center gap-2 font-medium"><BadgeCheck className="size-4" /> Test completed</p><p className="mt-1 font-mono text-slate-400">Score {testResult.scamGuardReadinessScore} · {testResult.decision}</p></div>}

              {rejected && <div className="rounded-xl border border-red-400/20 bg-red-400/8 p-3 text-xs text-red-200">Your previous proof was rejected. Correct it and resubmit below.</div>}

              {!locked && !threatPoolTask && <form onSubmit={(event) => void submitTask(event, task)} className="space-y-3">
                {task.type === "X_QUOTE" && <Input name="evidenceUrl" placeholder="Your X post URL" disabled={!profile || taskBusy} required />}
                {scamGuardTask && testResult && <Textarea name="feedbackText" placeholder="What was clear, confusing or useful?" disabled={!profile || taskBusy || Boolean(submission?.feedbackText)} required minLength={20} />}
                {(task.proofRequired || scamGuardTask) && <Input name="proof" type="file" accept="image/png,image/jpeg,image/webp" disabled={!profile || taskBusy} required={task.proofRequired} />}
                <Button type="submit" className="w-full" disabled={!profile || taskBusy || (scamGuardTask && (!testResult || Boolean(submission?.feedbackText)))}>{taskBusy ? <Loader2 className="animate-spin" /> : <Send />}{!profile ? "Register to unlock" : rejected ? "Resubmit proof" : "Submit for verification"}</Button>
              </form>}

              {locked && <div className={`rounded-xl border p-3 text-xs ${approved ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-200" : "border-amber-400/20 bg-amber-400/8 text-amber-200"}`}>{approved ? "Completed and locked." : "Submission is in the verification queue."}</div>}
              {submission?.adminNotes && <div className="rounded-xl border border-amber-400/20 bg-amber-400/8 p-3 text-xs text-amber-100">Admin note: {submission.adminNotes}</div>}
            </div>
          </article>
        })}
      </section>

      {filteredTasks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-800 py-14 text-center text-sm text-slate-500">No tasks match this view.</div>}

      {data.leaderboard.length > 0 && <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[radial-gradient(circle_at_50%_120%,rgba(99,102,241,0.16),transparent_45%),rgba(2,8,23,0.82)]"><div className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><h2 className="flex items-center gap-2 font-semibold text-white"><Trophy className="size-5 text-amber-300" /> Contribution Leaderboard</h2><p className="mt-1 text-xs text-slate-500">Top contributors by admin-approved points.</p></div><Badge variant="outline" className="border-slate-700 text-slate-300">Top 10</Badge></div><div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-5">{data.leaderboard.slice(0, 10).map((entry) => <div key={`${entry.rank}-${entry.name}`} className={`rounded-xl border p-3 ${entry.isCurrentUser ? "border-violet-400/35 bg-violet-400/10" : "border-slate-800 bg-slate-950/45"}`}><div className="flex items-center justify-between"><span className={`font-mono text-sm ${entry.rank <= 3 ? "text-amber-300" : "text-cyan-300"}`}>#{entry.rank}</span>{entry.isCurrentUser && <Badge variant="secondary">You</Badge>}</div><p className="mt-3 truncate text-sm font-medium text-white">{entry.name}</p><p className="mt-1 truncate text-xs text-slate-500">{entry.xHandle ?? `${entry.approvedCount} approved`}</p><p className="mt-3 font-mono text-sm text-slate-200">{entry.totalPoints} pts</p></div>)}</div></section>}
    </div>
  )
}
