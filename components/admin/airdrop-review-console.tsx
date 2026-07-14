"use client"

import { useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED"

type AdminSubmission = {
  id: string
  status: SubmissionStatus
  evidenceUrl: string | null
  evidenceImageData: string | null
  feedbackText: string | null
  humanityTestResult: unknown
  pointsAwarded: number
  adminNotes: string | null
  createdAt: string
  reviewedAt: string | null
  task: {
    slug: string
    title: string
    type: string
    points: number
  }
  user: {
    id: string
    name: string
    email: string
  }
  profile: {
    xHandle: string | null
    rewardWallet: string | null
    totalPoints: number
    eligibilityStatus: string
  }
  reviewedBy: null | {
    id: string
    name: string
    email: string
  }
}

type AdminResponse = {
  totals: Record<string, number>
  submissions: AdminSubmission[]
}

function statusClass(status: SubmissionStatus) {
  if (status === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
}

export function AirdropReviewConsole() {
  const [data, setData] = useState<AdminResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const response = await fetch("/api/admin/airdrop/submissions", { cache: "no-store" })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(body.error ?? "Could not load airdrop submissions")
      setLoading(false)
      return
    }
    setData(body)
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  async function review(id: string, action: "approve" | "reject", notes: string) {
    setBusyId(id)
    setMessage(null)
    setError(null)
    const response = await fetch(`/api/admin/airdrop/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNotes: notes }),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(body.error ?? "Review failed")
      setBusyId(null)
      return
    }
    setMessage(action === "approve" ? "Submission approved and points credited." : "Submission rejected.")
    setBusyId(null)
    await load()
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="dashboard-hero relative overflow-hidden rounded-3xl border border-primary/30 bg-primary/5 p-6 shadow-[0_0_70px_rgba(56,189,248,0.08)]">
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-4 w-fit border-primary/40 bg-primary/10 text-cyan-100">
              Season 0 Admin Queue
            </Badge>
            <h1 className="text-gradient text-3xl font-semibold sm:text-5xl">Airdrop task review</h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Review X screenshots, quote URLs and Humanity Gate feedback. Approved submissions immediately credit points to the user profile.
            </p>
          </div>
          <Button onClick={load} variant="outline" className="text-white" disabled={loading}>
            <RefreshCcw data-icon="inline-start" /> Refresh
          </Button>
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

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Pending", data?.totals.PENDING ?? 0, "Needs review", "text-yellow-300"],
          ["Approved", data?.totals.APPROVED ?? 0, "Points credited", "text-green-300"],
          ["Rejected", data?.totals.REJECTED ?? 0, "Proof failed", "text-red-300"],
          ["Total", data?.submissions.length ?? 0, "Last 100 submissions", "text-primary"],
        ].map(([label, value, detail, color]) => (
          <Card key={label as string} className="glass-panel premium-card animated-border">
            <CardHeader>
              <CardDescription>{detail as string}</CardDescription>
              <CardTitle className={`font-mono text-3xl ${color as string}`}>{String(value)}</CardTitle>
              <p className="text-sm text-slate-300">{label as string}</p>
            </CardHeader>
          </Card>
        ))}
      </section>

      {loading ? (
        <Card className="glass-panel h-72 animate-pulse" />
      ) : !data?.submissions.length ? (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Gift className="text-primary" /> No submissions yet
            </CardTitle>
            <CardDescription>Community task proofs will appear here after users register and submit evidence.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="grid gap-4">
          {data.submissions.map((submission) => (
            <Card key={submission.id} className="glass-panel premium-card animated-border">
              <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={statusClass(submission.status)}>{submission.status}</Badge>
                    <Badge variant="outline" className="border-primary/30 text-primary">{submission.task.points} pts</Badge>
                    <Badge variant="secondary">{submission.task.type}</Badge>
                  </div>
                  <CardTitle className="text-white">{submission.task.title}</CardTitle>
                  <CardDescription className="mt-2">
                    {submission.user.name} / {submission.user.email} / {submission.profile.xHandle ?? "no X handle"}
                  </CardDescription>
                </div>
                <div className="rounded-xl border border-border bg-background/45 p-3 text-sm text-slate-300">
                  <p className="font-mono text-primary">{submission.profile.totalPoints} total pts</p>
                  <p className="mt-1 break-all">{submission.profile.rewardWallet ?? "no reward wallet"}</p>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-3">
                  {submission.evidenceUrl && (
                    <a href={submission.evidenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary hover:bg-primary/10">
                      <ExternalLink className="size-4" /> Open evidence URL
                    </a>
                  )}
                  {submission.evidenceImageData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={submission.evidenceImageData} alt="Airdrop task screenshot proof" className="max-h-96 w-full rounded-xl border border-border object-contain" />
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-background/35 p-6 text-sm text-slate-400">
                      No screenshot attached.
                    </div>
                  )}
                </div>
                <ReviewPanel
                  submission={submission}
                  busy={busyId === submission.id}
                  onReview={review}
                />
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </div>
  )
}

function ReviewPanel({
  submission,
  busy,
  onReview,
}: {
  submission: AdminSubmission
  busy: boolean
  onReview: (id: string, action: "approve" | "reject", notes: string) => void
}) {
  const [notes, setNotes] = useState(submission.adminNotes ?? "")

  return (
    <div className="space-y-3">
      {submission.feedbackText && (
        <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-4 text-sm text-slate-200">
          <p className="mb-2 font-medium text-purple-100">Humanity feedback</p>
          <p className="leading-6">{submission.feedbackText}</p>
        </div>
      )}
      {submission.humanityTestResult ? (
        <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-background/45 p-3 text-xs text-slate-300">
          {JSON.stringify(submission.humanityTestResult, null, 2)}
        </pre>
      ) : null}
      <label className="grid gap-2 text-sm text-slate-300">
        Admin notes
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Reason for approval or rejection"
        />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={() => onReview(submission.id, "approve", notes)}
          disabled={busy}
          className="bg-green-500 text-green-950 hover:bg-green-400"
        >
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trophy data-icon="inline-start" />}
          Approve and credit
        </Button>
        <Button
          type="button"
          onClick={() => onReview(submission.id, "reject", notes)}
          disabled={busy}
          variant="destructive"
        >
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <XCircle data-icon="inline-start" />}
          Reject
        </Button>
      </div>
      {submission.reviewedBy && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="size-3.5" /> Reviewed by {submission.reviewedBy.email}
        </p>
      )}
    </div>
  )
}
