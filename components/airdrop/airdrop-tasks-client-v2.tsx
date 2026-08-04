"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Gift,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RefreshCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
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

function statusTone(status?: SubmissionStatus | null) {
  if (status === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  if (status === "PENDING") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  return "border-primary/30 bg-primary/10 text-cyan-100"
}

function statusLabel(status?: SubmissionStatus | null) {
  if (status === "APPROVED") return "Approved"
  if (status === "REJECTED") return "Rejected — resubmit available"
  if (status === "PENDING") return "Pending admin review"
  return "Not submitted"
}

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

function threatPoolLabel(status: AirdropResponse["dailyThreatPool"]["status"], points: number) {
  if (status === "CREDITED") return `Verified today: +${points} pts`
  if (status === "PENDING_REVIEW") return "Report pending review"
  if (status === "AWAITING_PROFILE") return `+${points} pts awaiting profile`
  return `Up to +${points} pts today`
}

export function AirdropTasksClientV2() {
  const [data, setData] = useState<AirdropResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [unauthorized, setUnauthorized] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [scamGuardResult, setScamGuardResult] = useState<ScamGuardResult | null>(null)

  async function refresh(silent = false) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/airdrop/me?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      if (response.status === 401) {
        setUnauthorized(true)
        return
      }
      if (!response.ok) throw new Error(await readError(response))

      const body = (await response.json()) as AirdropResponse
      if (!Array.isArray(body.tasks)) throw new Error("Airdrop task response is not ready yet.")
      setData((current) => mergeResponse(current, body))
      setScamGuardResult(
        body.tasks.find((task) => task.type === "HUMANITY_GATE_FEEDBACK")?.submission?.humanityTestResult ?? null
      )
    } catch (err) {
      if (!silent) setData(null)
      setError(err instanceof Error ? err.message : "Could not load airdrop tasks.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const completion = useMemo(() => {
    if (!data?.tasks.length) return 0
    const countableTasks = data.tasks.filter((task) => task.type !== "THREAT_REPORT")
    if (!countableTasks.length) return 0
    const approved = countableTasks.filter((task) => task.submission?.status === "APPROVED").length
    return Math.round((approved / countableTasks.length) * 100)
  }, [data])

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setError(null)
    setMessage(null)
    try {
      const form = new FormData(formElement)
      const response = await fetch("/api/airdrop/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xHandle: form.get("xHandle"), rewardWallet: form.get("rewardWallet") }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setMessage("Airdrop registration saved. Task proof forms are now unlocked.")
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    }
  }

  async function submitTask(event: FormEvent<HTMLFormElement>, task: AirdropTask) {
    event.preventDefault()
    const formElement = event.currentTarget
    const current = task.submission
    const completingScamGuardFeedback =
      task.type === "HUMANITY_GATE_FEEDBACK" &&
      current?.status === "PENDING" &&
      Boolean(current.humanityTestResult) &&
      !current.feedbackText

    if (busyTask === task.slug) return
    if ((current?.status === "PENDING" || current?.status === "APPROVED") && !completingScamGuardFeedback) {
      setMessage(current.status === "APPROVED" ? "This task is already approved." : "This proof is already waiting for admin review.")
      await refresh(true)
      return
    }

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
        body: JSON.stringify({
          taskSlug: task.slug,
          evidenceUrl: form.get("evidenceUrl"),
          feedbackText: form.get("feedbackText"),
          evidenceImageData,
        }),
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
      setData((state) => {
        if (!state) return state
        const previousStatus = task.submission?.status
        return {
          ...state,
          summary: {
            ...state.summary,
            pendingCount: previousStatus === "PENDING" ? state.summary.pendingCount : state.summary.pendingCount + 1,
            rejectedCount: previousStatus === "REJECTED" ? Math.max(0, state.summary.rejectedCount - 1) : state.summary.rejectedCount,
          },
          tasks: state.tasks.map((item) => item.slug === task.slug ? { ...item, submission: body.submission } : item),
        }
      })
      formElement.reset()
      setMessage("Proof submitted successfully. It is now waiting for admin review.")
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
      setMessage("ScamGuard test completed. Add feedback below to finish the task submission.")
      await refresh(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "ScamGuard test failed")
    } finally {
      setBusyTask(null)
    }
  }

  if (loading) {
    return <div className="flex flex-col gap-6"><div className="dashboard-hero h-72 animate-pulse rounded-3xl" /><div className="grid gap-4 lg:grid-cols-3">{Array.from({ length: 5 }).map((_, index) => <Card key={index} className="glass-panel h-72 animate-pulse" />)}</div></div>
  }

  if (unauthorized) {
    return (
      <Card className="glass-panel premium-card mx-auto max-w-2xl">
        <CardHeader><CardTitle className="flex items-center gap-2 text-white"><LockKeyhole className="text-primary" /> Account required</CardTitle><CardDescription>Sign in before joining the contribution season.</CardDescription></CardHeader>
        <CardContent className="flex gap-3"><Link href="/register" className={buttonVariants()}>Create account</Link><Link href="/login" className={buttonVariants({ variant: "outline" })}>Login</Link></CardContent>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card className="glass-panel premium-card mx-auto max-w-2xl border-yellow-400/30">
        <CardHeader><CardTitle className="flex items-center gap-2 text-yellow-100"><AlertCircle /> Airdrop tasks could not load</CardTitle><CardDescription>{error ?? "Try again."}</CardDescription></CardHeader>
        <CardContent><Button variant="outline" onClick={() => void refresh()}>Try again</Button></CardContent>
      </Card>
    )
  }

  const profile = data.profile

  return (
    <div className="flex flex-col gap-7">
      <section className="dashboard-hero relative overflow-hidden rounded-3xl border border-primary/25 p-6 sm:p-8">
        <div className="relative z-10 grid gap-7 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <div className="mb-4 flex flex-wrap gap-2"><Badge variant="secondary"><Sparkles className="size-3.5" /> Season 0 contribution</Badge><Badge variant="outline" className="border-amber-400/30 text-amber-100">No token guarantee</Badge></div>
            <h1 className="text-gradient text-4xl font-semibold sm:text-6xl">Airdrop Tasks</h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-300">Complete each task once, submit evidence and wait for admin review. Pending and approved tasks are automatically locked against repeat submissions.</p>
            <div className="mt-6 flex flex-wrap gap-3"><a href={triproofXUrl} target="_blank" rel="noreferrer" className={buttonVariants()}>Open Tri-Proof X <ExternalLink data-icon="inline-end" /></a><Button variant="outline" className="text-white" disabled={refreshing} onClick={() => void refresh(true)}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Refresh status</Button></div>
          </div>
          <Card className="glass-panel border-emerald-400/20 bg-emerald-400/5">
            <CardHeader><div className="flex items-center justify-between"><Gift className="text-emerald-300" /><Badge variant="outline" className={profile ? "border-green-400/30 text-green-200" : "border-yellow-400/30 text-yellow-200"}>{profile ? "Registered" : "Registration needed"}</Badge></div><CardTitle className="text-white">Contribution profile</CardTitle></CardHeader>
            <CardContent className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-border bg-background/45 p-3"><p className="text-xs text-muted-foreground">Approved points</p><p className="font-mono text-2xl text-white">{data.summary.seasonPoints}</p></div><div className="rounded-xl border border-border bg-background/45 p-3"><p className="text-xs text-muted-foreground">Pending proofs</p><p className="font-mono text-2xl text-white">{data.summary.pendingCount}</p></div></div><div><div className="mb-2 flex justify-between text-sm"><span className="text-slate-300">Approved progress</span><span className="font-mono text-primary">{completion}%</span></div><Progress value={completion} /></div></CardContent>
          </Card>
        </div>
      </section>

      {(message || error) && <Card className={`glass-panel ${error ? "border-red-400/30 bg-red-400/10" : "border-green-400/30 bg-green-400/10"}`}><CardContent className="flex items-center gap-3 p-4 text-sm">{error ? <AlertCircle className="size-4 text-red-200" /> : <CheckCircle2 className="size-4 text-green-200" />}<span className={error ? "text-red-100" : "text-green-100"}>{error ?? message}</span></CardContent></Card>}

      {!profile && (
        <Card className="glass-panel premium-card border-primary/25">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><WalletCards className="text-primary" /> Join the contribution registry</CardTitle><CardDescription>Link one X handle and one reward wallet to your account.</CardDescription></CardHeader>
          <CardContent><form onSubmit={register} className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end"><label className="grid gap-2 text-sm text-slate-300">X handle<Input name="xHandle" placeholder="@yourhandle" required /></label><label className="grid gap-2 text-sm text-slate-300">Reward wallet<Input name="rewardWallet" placeholder="Solana or EVM wallet address" required /></label><Button type="submit">Register <ArrowRight /></Button></form></CardContent>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {data.tasks.map((task) => {
          const Icon = taskIcon(task.type)
          const submission = task.submission
          const approved = submission?.status === "APPROVED"
          const pending = submission?.status === "PENDING"
          const rejected = submission?.status === "REJECTED"
          const scamGuardTask = task.type === "HUMANITY_GATE_FEEDBACK"
          const threatPoolTask = task.type === "THREAT_REPORT"
          const testResult = scamGuardResult ?? submission?.humanityTestResult ?? null
          const scamGuardNeedsFeedback = scamGuardTask && pending && Boolean(testResult) && !submission?.feedbackText
          const submissionLocked = approved || (pending && !scamGuardNeedsFeedback)
          const taskBusy = busyTask === task.slug
          const targetUrl = task.targetUrl ?? (task.type === "TELEGRAM_JOIN" ? triproofTelegramUrl : triproofXUrl)

          return (
            <Card key={task.slug} className="glass-panel premium-card animated-border">
              <CardHeader><div className="mb-3 flex items-center justify-between gap-3"><span className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="size-5" /></span><Badge variant="outline" className={threatPoolTask ? "border-primary/30 text-primary" : statusTone(submission?.status)}>{threatPoolTask ? threatPoolLabel(data.dailyThreatPool.status, data.dailyThreatPool.points) : statusLabel(submission?.status)}</Badge></div><CardTitle className="text-white">{task.title}</CardTitle><CardDescription className="text-slate-300">{task.description}</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3"><span className="text-sm text-slate-300">Admin-approved reward</span><span className="font-mono text-primary">{task.points} pts</span></div>

                {task.type !== "THREAT_REPORT" && task.type !== "HUMANITY_GATE_FEEDBACK" && <a href={targetUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>{task.type === "X_FOLLOW" ? "Follow @TriProof_" : task.type === "X_QUOTE" ? "Open post to quote" : "Join Tri-Proof Telegram"} <ExternalLink /></a>}

                {threatPoolTask && <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-slate-200"><p className="mb-3 leading-6">A verified report can earn points once per UTC day.</p><Link href="/threat-reports" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>Report to Threat Pool <ArrowRight /></Link></div>}

                {scamGuardTask && <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-3 text-sm text-slate-200">{testResult ? <div className="space-y-2"><p className="flex items-center gap-2 font-medium text-purple-100"><BadgeCheck className="size-4" /> ScamGuard test completed</p><p className="font-mono text-xs">Score {testResult.scamGuardReadinessScore} / {testResult.decision}</p></div> : <Button type="button" className="w-full" disabled={!profile || Boolean(busyTask)} onClick={() => void runScamGuardTest()}>{busyTask === "scamguard-test" ? <Loader2 className="animate-spin" /> : <ShieldAlert />} Run one-time ScamGuard test</Button>}</div>}

                {submissionLocked && !threatPoolTask && <div className={`rounded-xl border p-4 text-sm ${approved ? "border-green-400/25 bg-green-400/10 text-green-100" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"}`}><p className="flex items-center gap-2 font-medium">{approved ? <CheckCircle2 className="size-4" /> : <ClipboardCheck className="size-4" />}{approved ? "Task approved" : "Proof submitted — pending admin review"}</p><p className="mt-2 leading-6 text-slate-300">{approved ? `${submission?.pointsAwarded ?? task.points} points were credited. This task is permanently locked.` : "Your evidence is in the review queue. The form and submit button are locked until an admin decides."}</p>{submission?.createdAt && <p className="mt-2 font-mono text-xs text-slate-400">Submitted: {formatDate(submission.createdAt)}</p>}</div>}

                {rejected && !threatPoolTask && <div className="rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100"><p className="flex items-center gap-2 font-medium"><AlertCircle className="size-4" /> Proof rejected</p><p className="mt-2 leading-6 text-slate-300">Correct the evidence and resubmit below. The same task record will be reused.</p></div>}

                {!submissionLocked && !threatPoolTask && (
                  <form onSubmit={(event) => void submitTask(event, task)} className="space-y-3">
                    {task.type === "X_QUOTE" && <label className="grid gap-2 text-sm text-slate-300">Quote URL<Input name="evidenceUrl" placeholder="https://x.com/yourhandle/status/..." disabled={!profile || taskBusy} required /></label>}
                    {scamGuardTask && testResult && <label className="grid gap-2 text-sm text-slate-300">Feedback after testing<Textarea name="feedbackText" placeholder="What was clear, confusing, slow or trustworthy?" disabled={!profile || taskBusy || Boolean(submission?.feedbackText)} required minLength={20} /></label>}
                    {(task.proofRequired || scamGuardTask) && <label className="grid gap-2 text-sm text-slate-300">Screenshot proof {scamGuardTask && "(optional)"}<Input name="proof" type="file" accept="image/png,image/jpeg,image/webp" disabled={!profile || taskBusy} required={task.proofRequired} /></label>}
                    <Button type="submit" className="w-full" disabled={!profile || taskBusy || (scamGuardTask && (!testResult || Boolean(submission?.feedbackText)))}>{taskBusy ? <Loader2 className="animate-spin" /> : <Send />}{!profile ? "Register to unlock" : taskBusy ? "Submitting proof..." : rejected ? "Resubmit corrected proof" : "Submit for admin approval"}</Button>
                  </form>
                )}

                {submission?.adminNotes && <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">Admin note: {submission.adminNotes}</div>}
              </CardContent>
            </Card>
          )
        })}
      </section>

      {data.leaderboard.length > 0 && <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><Trophy className="text-primary" /> Contribution leaderboard</CardTitle><CardDescription>Only admin-approved points are included.</CardDescription></CardHeader><CardContent className="grid gap-2">{data.leaderboard.slice(0, 10).map((entry) => <div key={`${entry.rank}-${entry.name}`} className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border p-3 ${entry.isCurrentUser ? "border-primary/40 bg-primary/10" : "border-border bg-background/35"}`}><span className="font-mono text-primary">#{entry.rank}</span><div><p className="font-medium text-white">{entry.name}</p><p className="text-xs text-slate-400">{entry.xHandle ?? "No X handle"} · {entry.approvedCount} approved</p></div><span className="font-mono text-white">{entry.totalPoints} pts</span></div>)}</CardContent></Card>}
    </div>
  )
}
