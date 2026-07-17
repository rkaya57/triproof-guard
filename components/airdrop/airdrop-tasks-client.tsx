"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Gift,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Upload,
  UserPlus,
  WalletCards,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED"
type TaskType = "X_FOLLOW" | "X_QUOTE" | "HUMANITY_GATE_FEEDBACK"

type HumanityResult = {
  completedAt: string
  decision: string
  humanSessionScore: number
  reasonCodes: string[]
}

type AirdropTask = {
  id: string
  slug: string
  title: string
  description: string
  type: TaskType
  points: number
  proofRequired: boolean
  submission: null | {
    id: string
    status: SubmissionStatus
    evidenceUrl: string | null
    feedbackText: string | null
    humanityTestResult: HumanityResult | null
    pointsAwarded: number
    adminNotes: string | null
    reviewedAt: string | null
    createdAt: string
  }
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
  tasks: AirdropTask[]
}

const triproofXUrl = "https://x.com/TriProof_"
const quoteSearchUrl = "https://x.com/TriProof_"

function statusTone(status?: SubmissionStatus | null) {
  if (status === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  if (status === "PENDING") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
  return "border-primary/30 bg-primary/10 text-cyan-100"
}

function statusLabel(status?: SubmissionStatus | null) {
  if (status === "APPROVED") return "Approved"
  if (status === "REJECTED") return "Rejected"
  if (status === "PENDING") return "Pending admin review"
  return "Not submitted"
}

function taskIcon(type: TaskType) {
  if (type === "X_FOLLOW") return UserPlus
  if (type === "X_QUOTE") return MessageSquareText
  return ShieldCheck
}

async function fileToDataUrl(file: File) {
  if (file.size > 1_250_000) {
    throw new Error("Screenshot is too large. Use an image under 1.25 MB.")
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read screenshot."))
    reader.readAsDataURL(file)
  })
}

async function readError(response: Response) {
  const data = await response.json().catch(() => ({}))
  return data.error ?? "Request failed"
}

export function AirdropTasksClient() {
  const [data, setData] = useState<AirdropResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyTask, setBusyTask] = useState<string | null>(null)
  const [humanityResult, setHumanityResult] = useState<HumanityResult | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/airdrop/me", { cache: "no-store" })
      if (response.status === 401) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      if (!response.ok) {
        throw new Error(await readError(response))
      }

      const body = (await response.json()) as AirdropResponse
      if (!Array.isArray(body.tasks)) {
        throw new Error("Airdrop task response is not ready yet.")
      }

      setData(body)
      setHumanityResult(
        body.tasks.find((task) => task.type === "HUMANITY_GATE_FEEDBACK")?.submission
          ?.humanityTestResult ?? null
      )
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : "Could not load airdrop tasks.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  const completion = useMemo(() => {
    if (!data?.tasks.length) return 0
    return Math.round((data.summary.approvedCount / data.tasks.length) * 100)
  }, [data])

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    const form = new FormData(event.currentTarget)
    const response = await fetch("/api/airdrop/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        xHandle: form.get("xHandle"),
        rewardWallet: form.get("rewardWallet"),
      }),
    })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    setMessage("Airdrop registration saved. You can submit task proofs now.")
    await refresh()
  }

  async function submitTask(event: FormEvent<HTMLFormElement>, task: AirdropTask) {
    event.preventDefault()
    setBusyTask(task.slug)
    setError(null)
    setMessage(null)

    try {
      const form = new FormData(event.currentTarget)
      const file = form.get("proof")
      const evidenceImageData =
        file instanceof File && file.size > 0 ? await fileToDataUrl(file) : undefined
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
      if (!response.ok) throw new Error(await readError(response))
      setMessage("Submission sent. Admin approval will unlock points.")
      event.currentTarget.reset()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setBusyTask(null)
    }
  }

  async function runHumanityTest() {
    setBusyTask("humanity-test")
    setError(null)
    setMessage(null)
    try {
      const response = await fetch("/api/airdrop/humanity-test", { method: "POST" })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { result: HumanityResult }
      setHumanityResult(body.result)
      setMessage("Humanity Gate test completed once. Add your feedback to submit it for review.")
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Humanity Gate test failed")
    } finally {
      setBusyTask(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="dashboard-hero h-72 animate-pulse rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="glass-panel h-60 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (unauthorized) {
    return (
      <Card className="glass-panel premium-card mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <LockKeyhole className="text-primary" /> Registration required
          </CardTitle>
          <CardDescription>
            You need a Tri-Proof account before joining the contribution season.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Link href="/register" className={`${buttonVariants()} glow-primary hover-lift`}>
            Create account <ArrowRight data-icon="inline-end" />
          </Link>
          <Link href="/login" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
            Login
          </Link>
        </CardContent>
      </Card>
    )
  }

  const profile = data?.profile
  const tasks = data?.tasks ?? []

  if (!data && error) {
    return (
      <Card className="glass-panel premium-card mx-auto max-w-2xl border-yellow-400/30 bg-yellow-400/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-100">
            <AlertCircle className="text-yellow-200" /> Airdrop tasks are not ready
          </CardTitle>
          <CardDescription className="text-slate-200">{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={refresh} variant="outline" className="text-white">
            Try again
          </Button>
          <Link href="/dashboard" className={`${buttonVariants({ variant: "outline" })} hover-lift`}>
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="dashboard-hero reveal-up relative overflow-hidden rounded-3xl border border-primary/25 p-6 shadow-[0_0_80px_rgba(56,189,248,0.08)] sm:p-8">
        <div className="pointer-events-none absolute right-[-4rem] top-[-5rem] size-72 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="relative z-10 grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-primary">
                <Sparkles className="size-3.5" /> Season 0 contribution
              </Badge>
              <Badge variant="outline" className="border-amber-400/30 bg-amber-400/10 text-amber-100">
                No token guarantee
              </Badge>
            </div>
            <h1 className="text-gradient animate-gradient-text text-4xl font-semibold sm:text-6xl">
              Airdrop Tasks
            </h1>
            <p className="mt-5 max-w-3xl leading-7 text-slate-300">
              Register once, complete the official X and Humanity Gate tasks, submit proof, then wait for admin approval before points are credited to your profile.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href={triproofXUrl} target="_blank" rel="noreferrer" className={`${buttonVariants()} glow-primary hover-lift`}>
                Open Tri-Proof X <ExternalLink data-icon="inline-end" />
              </a>
              <Link href="/dashboard" className={`${buttonVariants({ variant: "outline" })} text-white`}>
                Back to dashboard
              </Link>
            </div>
          </div>

          <Card className="glass-panel premium-card animated-border border-emerald-400/20 bg-emerald-400/5">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <Gift className="text-emerald-300" />
                <Badge variant="outline" className={profile ? "border-emerald-400/30 text-emerald-200" : "border-yellow-400/30 text-yellow-200"}>
                  {profile ? "Registered" : "Registration needed"}
                </Badge>
              </div>
              <CardTitle className="text-white">Contribution profile</CardTitle>
              <CardDescription className="text-slate-300">
                Points are only counted after manual admin approval.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Approved points</p>
                  <p className="mt-1 font-mono text-2xl text-white">{data?.summary.seasonPoints ?? 0}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/45 p-3">
                  <p className="text-xs text-muted-foreground">Pending proofs</p>
                  <p className="mt-1 font-mono text-2xl text-white">{data?.summary.pendingCount ?? 0}</p>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-slate-300">Approved task progress</span>
                  <span className="font-mono text-primary">{completion}%</span>
                </div>
                <Progress value={completion} className="h-2" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {(message || error) && (
        <Card className={`glass-panel ${error ? "border-red-400/30 bg-red-400/10" : "border-green-400/30 bg-green-400/10"}`}>
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            {error ? <AlertCircle className="size-4 text-red-200" /> : <CheckCircle2 className="size-4 text-green-200" />}
            <span className={error ? "text-red-100" : "text-green-100"}>{error ?? message}</span>
          </CardContent>
        </Card>
      )}

      {!profile && (
        <Card className="glass-panel premium-card animated-border border-primary/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <WalletCards className="text-primary" /> Join the airdrop contribution registry
            </CardTitle>
            <CardDescription>
              This connects your account, X handle and reward wallet before task proofs are accepted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={register} className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
              <label className="grid gap-2 text-sm text-slate-300">
                X handle
                <Input name="xHandle" placeholder="@yourhandle" required />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Reward wallet
                <Input name="rewardWallet" placeholder="Solana or EVM wallet address" required />
              </label>
              <Button type="submit" className="glow-primary">
                Register <ArrowRight data-icon="inline-end" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {tasks.map((task) => {
          const Icon = taskIcon(task.type)
          const submission = task.submission
          const locked = !profile
          const approved = submission?.status === "APPROVED"
          const humanityTask = task.type === "HUMANITY_GATE_FEEDBACK"
          const testResult = humanityResult ?? submission?.humanityTestResult ?? null

          return (
            <Card key={task.slug} className="glass-panel premium-card hover-lift animated-border">
              <CardHeader>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="glow-primary flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <Badge variant="outline" className={statusTone(submission?.status)}>
                    {statusLabel(submission?.status)}
                  </Badge>
                </div>
                <CardTitle className="text-white">{task.title}</CardTitle>
                <CardDescription className="text-slate-300">{task.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border bg-background/45 p-3">
                  <span className="text-sm text-slate-300">Admin-approved reward</span>
                  <span className="font-mono text-primary">{task.points} pts</span>
                </div>

                {task.type === "X_FOLLOW" && (
                  <a href={triproofXUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Follow @TriProof_ <ExternalLink data-icon="inline-end" />
                  </a>
                )}

                {task.type === "X_QUOTE" && (
                  <a href={quoteSearchUrl} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline" })} w-full text-white`}>
                    Open Tri-Proof posts <ExternalLink data-icon="inline-end" />
                  </a>
                )}

                {humanityTask && (
                  <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-3 text-sm text-slate-200">
                    {testResult ? (
                      <div className="space-y-2">
                        <p className="flex items-center gap-2 font-medium text-purple-100">
                          <BadgeCheck className="size-4" /> Humanity test completed
                        </p>
                        <p className="font-mono text-xs">Score {testResult.humanSessionScore} / {testResult.decision}</p>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        onClick={runHumanityTest}
                        disabled={locked || busyTask === "humanity-test"}
                        className="w-full"
                      >
                        {busyTask === "humanity-test" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Camera data-icon="inline-start" />}
                        Run one-time Humanity test
                      </Button>
                    )}
                  </div>
                )}

                {!approved && (
                  <form onSubmit={(event) => submitTask(event, task)} className="space-y-3">
                    {task.type === "X_QUOTE" && (
                      <label className="grid gap-2 text-sm text-slate-300">
                        Quote URL
                        <Input name="evidenceUrl" placeholder="https://x.com/yourhandle/status/..." disabled={locked} required />
                      </label>
                    )}

                    {humanityTask && testResult && (
                      <label className="grid gap-2 text-sm text-slate-300">
                        Feedback after testing
                        <Textarea
                          name="feedbackText"
                          placeholder="What felt clear, confusing, slow, or trustworthy in the Humanity Gate test?"
                          disabled={locked || Boolean(submission?.feedbackText)}
                          required
                          minLength={20}
                        />
                      </label>
                    )}

                    {(task.proofRequired || humanityTask) && (
                      <label className="grid gap-2 text-sm text-slate-300">
                        Screenshot proof {humanityTask && "(optional)"}
                        <Input
                          name="proof"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={locked}
                          required={task.proofRequired}
                        />
                      </label>
                    )}

                    <Button
                      type="submit"
                      disabled={
                        locked ||
                        busyTask === task.slug ||
                        (humanityTask && (!testResult || Boolean(submission?.feedbackText)))
                      }
                      className="w-full"
                    >
                      {busyTask === task.slug ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                      Submit for admin approval
                    </Button>
                  </form>
                )}

                {submission?.adminNotes && (
                  <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3 text-sm text-yellow-100">
                    Admin note: {submission.adminNotes}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Trophy className="text-amber-300" /> Points policy
            </CardTitle>
            <CardDescription>Points are a contribution score, not a token promise.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              "Registering is required before any proof is accepted.",
              "Screenshots and URLs are manually reviewed by admins.",
              "Approved tasks add points to your account automatically.",
              "Duplicate, fake or low-quality submissions can be rejected.",
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-xl border border-border bg-background/45 p-3 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <ClipboardCheck className="text-primary" /> What admins review
            </CardTitle>
            <CardDescription>Admin approval is the only path that credits task points.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {[
              ["X follow", "Screenshot confirms @TriProof_ follow state."],
              ["Quote post", "X quote URL and screenshot prove the post is public."],
              ["Humanity feedback", "One-time test result plus useful feedback is checked."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="font-medium text-white">{title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="glass-panel premium-card data-scan flex flex-col justify-between gap-5 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-semibold text-white">Admin approval protects the season</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            Every proof enters a review queue. Once approved, the task points are written to your airdrop profile total.
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-primary/30 text-primary">
          <Upload className="size-3.5" /> Proof-based scoring
        </Badge>
      </section>
    </div>
  )
}
