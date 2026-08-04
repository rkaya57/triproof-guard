"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Trophy,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED"
type ReviewFilter = SubmissionStatus
type TaskType = "X_FOLLOW" | "X_QUOTE" | "HUMANITY_GATE_FEEDBACK"

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

type AdminTask = {
  id: string
  slug: string
  title: string
  description: string
  type: TaskType
  points: number
  proofRequired: boolean
  active: boolean
  sortOrder: number
  submissionCount: number
}

const emptyTaskForm = {
  id: "",
  title: "",
  description: "",
  type: "X_FOLLOW" as TaskType,
  points: 100,
  proofRequired: true,
  active: true,
  sortOrder: 100,
}

function statusClass(status: SubmissionStatus) {
  if (status === "APPROVED") return "border-green-400/30 bg-green-400/10 text-green-200"
  if (status === "REJECTED") return "border-red-400/30 bg-red-400/10 text-red-200"
  return "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({}))
  return body.error ?? "Request failed"
}

export function AirdropReviewConsole() {
  const [data, setData] = useState<AdminResponse | null>(null)
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [taskForm, setTaskForm] = useState(emptyTaskForm)
  const [loading, setLoading] = useState(true)
  const [taskLoading, setTaskLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("PENDING")
  const [savingTask, setSavingTask] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setTaskLoading(true)
    const response = await fetch("/api/admin/airdrop/tasks", { cache: "no-store" })
    if (!response.ok) {
      setError(await readError(response))
      setTaskLoading(false)
      return
    }
    const body = (await response.json()) as { tasks: AdminTask[] }
    setTasks(body.tasks)
    setTaskLoading(false)
  }, [])

  const load = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([load(), loadTasks()])
    }, 0)

    return () => window.clearTimeout(timer)
  }, [load, loadTasks])

  const moderationSignals = useMemo(() => {
    const submissions = data?.submissions ?? []
    const countBy = (selector: (submission: AdminSubmission) => string | null | undefined) => {
      const counts = new Map<string, number>()
      for (const submission of submissions) {
        const value = selector(submission)?.trim().toLowerCase()
        if (!value) continue
        counts.set(value, (counts.get(value) ?? 0) + 1)
      }
      return counts
    }
    return {
      xHandle: countBy((submission) => submission.profile.xHandle),
      rewardWallet: countBy((submission) => submission.profile.rewardWallet),
      evidenceUrl: countBy((submission) => submission.evidenceUrl),
    }
  }, [data])

  const pendingSubmissions = data?.submissions.filter((submission) => submission.status === "PENDING") ?? []
  const visibleSubmissions = data?.submissions.filter((submission) => submission.status === reviewFilter) ?? []

  function qualityFlags(submission: AdminSubmission) {
    const flags: string[] = []
    const xHandle = submission.profile.xHandle?.trim().toLowerCase()
    const rewardWallet = submission.profile.rewardWallet?.trim().toLowerCase()
    const evidenceUrl = submission.evidenceUrl?.trim().toLowerCase()
    if (xHandle && (moderationSignals.xHandle.get(xHandle) ?? 0) > 1) flags.push("Duplicate X handle")
    if (rewardWallet && (moderationSignals.rewardWallet.get(rewardWallet) ?? 0) > 1) flags.push("Duplicate reward wallet")
    if (evidenceUrl && (moderationSignals.evidenceUrl.get(evidenceUrl) ?? 0) > 1) flags.push("Repeated proof URL")
    if (submission.task.type === "X_QUOTE" && !submission.evidenceUrl) flags.push("Missing quote URL")
    if (submission.task.type !== "HUMANITY_GATE_FEEDBACK" && !submission.evidenceImageData) flags.push("Missing screenshot")
    if (submission.feedbackText && submission.feedbackText.length < 40) flags.push("Short feedback")
    return flags
  }

  async function saveTask() {
    setSavingTask(true)
    setMessage(null)
    setError(null)

    const response = await fetch("/api/admin/airdrop/tasks", {
      method: taskForm.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskForm),
    })

    if (!response.ok) {
      setError(await readError(response))
      setSavingTask(false)
      return
    }

    setMessage(taskForm.id ? "Airdrop task updated." : "Airdrop task created.")
    setTaskForm(emptyTaskForm)
    setSavingTask(false)
    await Promise.all([loadTasks(), load()])
  }

  function editTask(task: AdminTask) {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      points: task.points,
      proofRequired: task.proofRequired,
      active: task.active,
      sortOrder: task.sortOrder,
    })
  }

  async function toggleTask(task: AdminTask) {
    setSavingTask(true)
    setError(null)
    const response = await fetch("/api/admin/airdrop/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...task, active: !task.active }),
    })

    if (!response.ok) {
      setError(await readError(response))
      setSavingTask(false)
      return
    }

    setMessage(task.active ? "Task paused." : "Task activated.")
    setSavingTask(false)
    await loadTasks()
  }

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
    setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
    await load()
  }

  async function bulkReview(action: "approve" | "reject") {
    const ids = selectedIds.filter((id) => pendingSubmissions.some((submission) => submission.id === id))
    if (!ids.length) return

    setBusyId("bulk")
    setMessage(null)
    setError(null)

    for (const id of ids) {
      const response = await fetch(`/api/admin/airdrop/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          adminNotes:
            action === "approve"
              ? "Bulk approved after evidence review."
              : "Bulk rejected during evidence quality review.",
        }),
      })
      if (!response.ok) {
        setError(await readError(response))
        setBusyId(null)
        return
      }
    }

    setMessage(action === "approve" ? `${ids.length} submissions approved.` : `${ids.length} submissions rejected.`)
    setSelectedIds([])
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
              Review X screenshots, quote URLs and ScamGuard feedback. Approved submissions immediately credit points to the user profile.
            </p>
          </div>
          <Button
            onClick={() => void Promise.all([load(), loadTasks()])}
            variant="outline"
            className="text-white"
            disabled={loading || taskLoading}
          >
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

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Plus className="text-primary" /> Add or edit airdrop task
            </CardTitle>
            <CardDescription>
              Create new community tasks without a code deploy. Active tasks appear on the user airdrop page.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">
              Title
              <Input
                value={taskForm.title}
                onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Follow Tri-Proof on X"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              Description
              <Textarea
                value={taskForm.description}
                onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Explain exactly what users must do and what proof admins need."
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                Type
                <select
                  value={taskForm.type}
                  onChange={(event) => setTaskForm((current) => ({ ...current, type: event.target.value as TaskType }))}
                  className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-white"
                >
                  <option value="X_FOLLOW">X follow</option>
                  <option value="X_QUOTE">X quote</option>
                  <option value="HUMANITY_GATE_FEEDBACK">ScamGuard feedback</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Points
                <Input
                  type="number"
                  min={1}
                  value={taskForm.points}
                  onChange={(event) => setTaskForm((current) => ({ ...current, points: Number(event.target.value) }))}
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Sort order
                <Input
                  type="number"
                  value={taskForm.sortOrder}
                  onChange={(event) => setTaskForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-300">
              <label className="flex items-center gap-2 rounded-xl border border-border bg-background/45 px-3 py-2">
                <input
                  type="checkbox"
                  checked={taskForm.proofRequired}
                  onChange={(event) => setTaskForm((current) => ({ ...current, proofRequired: event.target.checked }))}
                />
                Screenshot proof required
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-border bg-background/45 px-3 py-2">
                <input
                  type="checkbox"
                  checked={taskForm.active}
                  onChange={(event) => setTaskForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={saveTask} disabled={savingTask}>
                {savingTask ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                {taskForm.id ? "Save task" : "Create task"}
              </Button>
              {taskForm.id && (
                <Button type="button" variant="outline" className="text-white" onClick={() => setTaskForm(emptyTaskForm)}>
                  Cancel edit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card animated-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Gift className="text-primary" /> Live task catalog
            </CardTitle>
            <CardDescription>Existing airdrop tasks and proof rules.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {taskLoading ? (
              <div className="h-40 animate-pulse rounded-xl border border-border bg-background/45" />
            ) : (
              tasks.map((task) => (
                <div key={task.id} className="grid gap-3 rounded-xl border border-border bg-background/45 p-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{task.title}</p>
                      <Badge variant="outline" className={task.active ? "border-green-400/30 text-green-200" : "border-slate-400/30 text-slate-300"}>
                        {task.active ? "Active" : "Paused"}
                      </Badge>
                      <Badge variant="secondary">{task.points} pts</Badge>
                    </div>
                    <p className="text-sm leading-6 text-slate-300">{task.description}</p>
                    <p className="mt-2 font-mono text-xs text-slate-400">
                      {task.type} / {task.proofRequired ? "proof required" : "proof optional"} / {task.submissionCount} submissions
                    </p>
                  </div>
                  <div className="flex flex-row gap-2 md:flex-col">
                    <Button type="button" variant="outline" className="text-white" onClick={() => editTask(task)}>
                      <Pencil data-icon="inline-start" /> Edit
                    </Button>
                    <Button type="button" variant="outline" className="text-white" onClick={() => toggleTask(task)} disabled={savingTask}>
                      {task.active ? "Pause" : "Activate"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

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

      <Card className="glass-panel premium-card">
        <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-white">Proof decisions</CardTitle>
            <CardDescription>Pending proof stays actionable. Reviewed proof is kept separately as a read-only audit record.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["PENDING", "Pending", data?.totals.PENDING ?? 0],
              ["APPROVED", "Approved", data?.totals.APPROVED ?? 0],
              ["REJECTED", "Rejected", data?.totals.REJECTED ?? 0],
            ] as const).map(([status, label, count]) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={reviewFilter === status ? "default" : "outline"}
                onClick={() => { setReviewFilter(status); setSelectedIds([]) }}
              >
                {label} ({count})
              </Button>
            ))}
          </div>
        </CardHeader>
      </Card>

      <Card className="glass-panel premium-card animated-border">
        <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="text-primary" /> Moderation tools
            </CardTitle>
            <CardDescription>
              Select pending proofs for bulk action. Duplicate handles, wallets and proof URLs are flagged from the latest queue.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="text-white"
              onClick={() => setSelectedIds(pendingSubmissions.map((submission) => submission.id))}
              disabled={!pendingSubmissions.length || busyId === "bulk"}
            >
              Select pending
            </Button>
            <Button
              type="button"
              className="bg-green-500 text-green-950 hover:bg-green-400"
              onClick={() => void bulkReview("approve")}
              disabled={!selectedIds.length || busyId === "bulk"}
            >
              {busyId === "bulk" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Trophy data-icon="inline-start" />}
              Bulk approve
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void bulkReview("reject")}
              disabled={!selectedIds.length || busyId === "bulk"}
            >
              Bulk reject
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm text-slate-300">
          <Badge variant="outline" className="border-yellow-400/30 text-yellow-200">{selectedIds.length} selected</Badge>
          <Badge variant="outline" className="border-primary/30 text-primary">{pendingSubmissions.length} pending</Badge>
          <span className="text-muted-foreground">Use bulk actions only after reviewing visible proof quality.</span>
        </CardContent>
      </Card>

      {loading ? (
        <Card className="glass-panel h-72 animate-pulse" />
      ) : !visibleSubmissions.length ? (
        <Card className="glass-panel premium-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Gift className="text-primary" /> No {reviewFilter.toLowerCase()} submissions
            </CardTitle>
            <CardDescription>{reviewFilter === "PENDING" ? "Community task proofs will appear here after users register and submit evidence." : "Reviewed submissions are retained here as an audit record."}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section className="grid gap-4">
          {visibleSubmissions.map((submission) => (
            <Card key={submission.id} className="glass-panel premium-card animated-border">
              <CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {submission.status === "PENDING" && (
                      <label className="flex items-center gap-2 rounded-full border border-border bg-background/45 px-3 py-1 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(submission.id)}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.target.checked
                                ? [...current, submission.id]
                                : current.filter((id) => id !== submission.id)
                            )
                          }
                        />
                        Select
                      </label>
                    )}
                    <Badge variant="outline" className={statusClass(submission.status)}>{submission.status}</Badge>
                    <Badge variant="outline" className="border-primary/30 text-primary">{submission.task.points} pts</Badge>
                    <Badge variant="secondary">{submission.task.type}</Badge>
                    {qualityFlags(submission).map((flag) => (
                      <Badge key={flag} variant="outline" className="border-yellow-400/30 bg-yellow-400/10 text-yellow-100">
                        {flag}
                      </Badge>
                    ))}
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
  const noteTemplates = [
    "Proof looks valid. Approved and points credited.",
    "Duplicate or low-quality proof. Rejected for this task.",
    "Screenshot does not clearly show account ownership or task completion.",
    "ScamGuard feedback reviewed and accepted.",
  ]

  if (submission.status !== "PENDING") {
    return (
      <div className="rounded-xl border border-border bg-background/35 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Review complete</p>
        <p className="mt-2">Decision: <span className={submission.status === "APPROVED" ? "text-green-200" : "text-red-200"}>{submission.status}</span></p>
        {submission.status === "APPROVED" && <p className="mt-1">Points credited: {submission.pointsAwarded}</p>}
        {submission.adminNotes && <p className="mt-3 border-l-2 border-primary/50 pl-3 leading-6">{submission.adminNotes}</p>}
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><ShieldCheck className="size-3.5" /> Reviewed by {submission.reviewedBy?.email ?? "Tri-Proof admin"}{submission.reviewedAt ? ` · ${new Date(submission.reviewedAt).toLocaleString()}` : ""}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {submission.feedbackText && (
        <div className="rounded-xl border border-purple-400/20 bg-purple-400/10 p-4 text-sm text-slate-200">
          <p className="mb-2 font-medium text-purple-100">ScamGuard feedback</p>
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
      <div className="flex flex-wrap gap-2">
        {noteTemplates.map((template) => (
          <Button
            key={template}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto whitespace-normal text-left text-xs text-slate-200"
            onClick={() => setNotes(template)}
          >
            {template}
          </Button>
        ))}
      </div>
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
