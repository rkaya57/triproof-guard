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
type TaskType = "X_FOLLOW" | "X_QUOTE" | "TELEGRAM_JOIN" | "THREAT_REPORT" | "HUMANITY_GATE_FEEDBACK"

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
  task: { slug: string; title: string; type: TaskType; points: number }
  user: { id: string; name: string; email: string }
  profile: { xHandle: string | null; rewardWallet: string | null; totalPoints: number; eligibilityStatus: string }
  reviewedBy: null | { id: string; name: string; email: string }
}

type AdminResponse = {
  totalCount: number
  totals: Record<string, number>
  submissions: AdminSubmission[]
}

type AdminTask = {
  id: string
  slug: string
  title: string
  description: string
  targetUrl: string | null
  type: TaskType
  points: number
  proofRequired: boolean
  active: boolean
  sortOrder: number
  submissionCount: number
}

type TaskForm = {
  id: string
  title: string
  description: string
  targetUrl: string
  type: TaskType
  points: number
  proofRequired: boolean
  active: boolean
  sortOrder: number
}

const emptyTaskForm: TaskForm = {
  id: "",
  title: "",
  description: "",
  targetUrl: "",
  type: "X_FOLLOW",
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

function formatDate(value: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function AirdropReviewConsoleV2() {
  const [data, setData] = useState<AdminResponse | null>(null)
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm)
  const [loading, setLoading] = useState(true)
  const [taskLoading, setTaskLoading] = useState(true)
  const [savingTask, setSavingTask] = useState(false)
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("PENDING")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setTaskLoading(true)
    try {
      const response = await fetch(`/api/admin/airdrop/tasks?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as { tasks: AdminTask[] }
      setTasks(body.tasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load airdrop tasks")
    } finally {
      setTaskLoading(false)
    }
  }, [])

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/airdrop/submissions?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      if (!response.ok) throw new Error(await readError(response))
      const body = (await response.json()) as AdminResponse
      setData(body)
      setSelectedIds((current) => current.filter((id) => body.submissions.some((item) => item.id === id && item.status === "PENDING")))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load airdrop submissions")
    } finally {
      setLoading(false)
    }
  }, [])

  const reloadAll = useCallback(async () => {
    setError(null)
    await Promise.all([loadTasks(), loadSubmissions()])
  }, [loadSubmissions, loadTasks])

  useEffect(() => {
    void reloadAll()
  }, [reloadAll])

  const pendingSubmissions = useMemo(
    () => data?.submissions.filter((submission) => submission.status === "PENDING") ?? [],
    [data]
  )
  const visibleSubmissions = useMemo(
    () => data?.submissions.filter((submission) => submission.status === reviewFilter) ?? [],
    [data, reviewFilter]
  )

  const moderationSignals = useMemo(() => {
    const count = (values: Array<string | null>) => {
      const result = new Map<string, number>()
      values.forEach((value) => {
        const normalized = value?.trim().toLowerCase()
        if (normalized) result.set(normalized, (result.get(normalized) ?? 0) + 1)
      })
      return result
    }
    const submissions = data?.submissions ?? []
    return {
      xHandle: count(submissions.map((item) => item.profile.xHandle)),
      wallet: count(submissions.map((item) => item.profile.rewardWallet)),
      evidenceUrl: count(submissions.map((item) => item.evidenceUrl)),
    }
  }, [data])

  function qualityFlags(submission: AdminSubmission) {
    const flags: string[] = []
    const handle = submission.profile.xHandle?.trim().toLowerCase()
    const wallet = submission.profile.rewardWallet?.trim().toLowerCase()
    const url = submission.evidenceUrl?.trim().toLowerCase()
    if (handle && (moderationSignals.xHandle.get(handle) ?? 0) > 1) flags.push("Duplicate X handle")
    if (wallet && (moderationSignals.wallet.get(wallet) ?? 0) > 1) flags.push("Duplicate reward wallet")
    if (url && (moderationSignals.evidenceUrl.get(url) ?? 0) > 1) flags.push("Repeated proof URL")
    if (submission.task.type === "X_QUOTE" && !submission.evidenceUrl) flags.push("Missing quote URL")
    if (!["HUMANITY_GATE_FEEDBACK", "THREAT_REPORT"].includes(submission.task.type) && !submission.evidenceImageData) flags.push("Missing screenshot")
    if (submission.feedbackText && submission.feedbackText.length < 40) flags.push("Short feedback")
    return flags
  }

  async function saveTask() {
    if (savingTask) return
    setSavingTask(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch("/api/admin/airdrop/tasks", {
        method: taskForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskForm),
      })
      if (!response.ok) throw new Error(await readError(response))
      setMessage(taskForm.id ? "Airdrop task updated." : "Airdrop task created.")
      setTaskForm(emptyTaskForm)
      await reloadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task")
    } finally {
      setSavingTask(false)
    }
  }

  function editTask(task: AdminTask) {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description,
      targetUrl: task.targetUrl ?? "",
      type: task.type,
      points: task.points,
      proofRequired: task.proofRequired,
      active: task.active,
      sortOrder: task.sortOrder,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function toggleTask(task: AdminTask) {
    if (savingTask) return
    setSavingTask(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/airdrop/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, active: !task.active }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setMessage(task.active ? "Task paused." : "Task activated.")
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task")
    } finally {
      setSavingTask(false)
    }
  }

  async function review(id: string, action: "approve" | "reject", notes: string) {
    if (busyIds.has(id) || bulkBusy) return
    setBusyIds((current) => new Set(current).add(id))
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/admin/airdrop/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNotes: notes }),
      })
      if (!response.ok) throw new Error(await readError(response))
      setMessage(action === "approve" ? "Submission approved and points credited." : "Submission rejected.")
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
      await loadSubmissions()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed")
      await loadSubmissions()
    } finally {
      setBusyIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  async function bulkReview(action: "approve" | "reject") {
    const ids = selectedIds.filter((id) => pendingSubmissions.some((item) => item.id === id))
    if (!ids.length || bulkBusy) return
    setBulkBusy(true)
    setError(null)
    setMessage(null)
    try {
      const results = await Promise.all(ids.map(async (id) => {
        const response = await fetch(`/api/admin/airdrop/submissions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            adminNotes: action === "approve"
              ? "Bulk approved after evidence review."
              : "Bulk rejected during evidence quality review.",
          }),
        })
        return { id, ok: response.ok, error: response.ok ? null : await readError(response) }
      }))
      const successful = results.filter((result) => result.ok)
      const failed = results.filter((result) => !result.ok)
      setSelectedIds(failed.map((result) => result.id))
      await loadSubmissions()
      if (failed.length) setError(`${successful.length} reviewed, ${failed.length} failed. ${failed[0]?.error ?? "Try again."}`)
      else setMessage(action === "approve" ? `${successful.length} submissions approved.` : `${successful.length} submissions rejected.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk review failed")
      await loadSubmissions()
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="dashboard-hero rounded-3xl border border-primary/30 bg-primary/5 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><Badge variant="secondary" className="mb-4 border-primary/40 bg-primary/10 text-cyan-100">Season 0 Admin Queue</Badge><h1 className="text-gradient text-3xl font-semibold sm:text-5xl">Airdrop task review</h1><p className="mt-3 max-w-3xl text-slate-300">Manage task links and review pending evidence. Reviewed records remain read-only, and the queue always reloads without cache.</p></div>
          <Button variant="outline" className="text-white" disabled={loading || taskLoading} onClick={() => void reloadAll()}>{loading || taskLoading ? <Loader2 className="animate-spin" /> : <RefreshCcw />} Refresh all</Button>
        </div>
      </section>

      {(message || error) && <Card className={`glass-panel ${error ? "border-red-400/30 bg-red-400/10" : "border-green-400/30 bg-green-400/10"}`}><CardContent className="flex items-center gap-3 p-4 text-sm">{error ? <AlertCircle className="size-4 text-red-200" /> : <CheckCircle2 className="size-4 text-green-200" />}<span className={error ? "text-red-100" : "text-green-100"}>{error ?? message}</span></CardContent></Card>}

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Plus className="text-primary" /> Add or edit task</CardTitle><CardDescription>Set the exact post, profile, Telegram or campaign URL that users must open.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <label className="grid gap-2 text-sm text-slate-300">Title<Input value={taskForm.title} onChange={(event) => setTaskForm((state) => ({ ...state, title: event.target.value }))} placeholder="Quote the launch post" /></label>
            <label className="grid gap-2 text-sm text-slate-300">Description<Textarea value={taskForm.description} onChange={(event) => setTaskForm((state) => ({ ...state, description: event.target.value }))} placeholder="Explain the task and required evidence." /></label>
            <label className="grid gap-2 text-sm text-slate-300">Task link {taskForm.type === "X_QUOTE" ? "(required)" : "(optional)"}<Input type="url" value={taskForm.targetUrl} required={taskForm.type === "X_QUOTE"} onChange={(event) => setTaskForm((state) => ({ ...state, targetUrl: event.target.value }))} placeholder="https://x.com/TriProof_/status/..." /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">Type<select value={taskForm.type} onChange={(event) => setTaskForm((state) => ({ ...state, type: event.target.value as TaskType }))} className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm text-white"><option value="X_FOLLOW">X follow</option><option value="X_QUOTE">X quote</option><option value="TELEGRAM_JOIN">Telegram join</option><option value="THREAT_REPORT">Threat report</option><option value="HUMANITY_GATE_FEEDBACK">ScamGuard feedback</option></select></label>
              <label className="grid gap-2 text-sm text-slate-300">Points<Input type="number" min={1} value={taskForm.points} onChange={(event) => setTaskForm((state) => ({ ...state, points: Number(event.target.value) }))} /></label>
              <label className="grid gap-2 text-sm text-slate-300">Sort order<Input type="number" value={taskForm.sortOrder} onChange={(event) => setTaskForm((state) => ({ ...state, sortOrder: Number(event.target.value) }))} /></label>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-300"><label className="flex items-center gap-2 rounded-xl border border-border bg-background/45 px-3 py-2"><input type="checkbox" checked={taskForm.proofRequired} onChange={(event) => setTaskForm((state) => ({ ...state, proofRequired: event.target.checked }))} /> Screenshot required</label><label className="flex items-center gap-2 rounded-xl border border-border bg-background/45 px-3 py-2"><input type="checkbox" checked={taskForm.active} onChange={(event) => setTaskForm((state) => ({ ...state, active: event.target.checked }))} /> Active</label></div>
            <div className="flex gap-2"><Button type="button" disabled={savingTask} onClick={() => void saveTask()}>{savingTask ? <Loader2 className="animate-spin" /> : <Save />}{taskForm.id ? "Save task" : "Create task"}</Button>{taskForm.id && <Button variant="outline" className="text-white" onClick={() => setTaskForm(emptyTaskForm)}>Cancel</Button>}</div>
          </CardContent>
        </Card>

        <Card className="glass-panel premium-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-white"><Gift className="text-primary" /> Live task catalog</CardTitle><CardDescription>{tasks.length} configured tasks</CardDescription></CardHeader>
          <CardContent className="grid gap-3">{taskLoading ? <div className="h-40 animate-pulse rounded-xl border border-border" /> : tasks.map((task) => <div key={task.id} className="grid gap-3 rounded-xl border border-border bg-background/45 p-4 md:grid-cols-[1fr_auto]"><div><div className="mb-2 flex flex-wrap gap-2"><p className="font-medium text-white">{task.title}</p><Badge variant="outline" className={task.active ? "border-green-400/30 text-green-200" : "border-slate-400/30 text-slate-300"}>{task.active ? "Active" : "Paused"}</Badge><Badge variant="secondary">{task.points} pts</Badge></div><p className="text-sm leading-6 text-slate-300">{task.description}</p>{task.targetUrl && <a href={task.targetUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Open task link <ExternalLink className="size-3" /></a>}<p className="mt-2 font-mono text-xs text-slate-400">{task.type} · {task.proofRequired ? "proof required" : "proof optional"} · {task.submissionCount} submissions</p></div><div className="flex gap-2 md:flex-col"><Button variant="outline" className="text-white" onClick={() => editTask(task)}><Pencil /> Edit</Button><Button variant="outline" className="text-white" disabled={savingTask} onClick={() => void toggleTask(task)}>{task.active ? "Pause" : "Activate"}</Button></div></div>)}</CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-4">{[["Pending", data?.totals.PENDING ?? 0, "Needs review", "text-yellow-300"],["Approved", data?.totals.APPROVED ?? 0, "Points credited", "text-green-300"],["Rejected", data?.totals.REJECTED ?? 0, "Can resubmit", "text-red-300"],["Total", data?.totalCount ?? 0, `Showing latest ${data?.submissions.length ?? 0}`, "text-primary"]].map(([label, value, detail, tone]) => <Card key={String(label)} className="glass-panel premium-card"><CardHeader><CardDescription>{String(detail)}</CardDescription><CardTitle className={`font-mono text-3xl ${String(tone)}`}>{String(value)}</CardTitle><p className="text-sm text-slate-300">{String(label)}</p></CardHeader></Card>)}</section>

      <Card className="glass-panel premium-card"><CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between"><div><CardTitle className="text-white">Proof decisions</CardTitle><CardDescription>Pending proofs are actionable; approved and rejected proofs are retained as audit records.</CardDescription></div><div className="flex flex-wrap gap-2">{(["PENDING", "APPROVED", "REJECTED"] as const).map((status) => <Button key={status} size="sm" variant={reviewFilter === status ? "default" : "outline"} onClick={() => { setReviewFilter(status); setSelectedIds([]) }}>{status} ({data?.totals[status] ?? 0})</Button>)}</div></CardHeader></Card>

      {reviewFilter === "PENDING" && <Card className="glass-panel premium-card"><CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto] lg:items-center"><div><CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" /> Moderation tools</CardTitle><CardDescription>Select reviewed pending proofs, then approve or reject them together.</CardDescription></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="text-white" disabled={!pendingSubmissions.length || bulkBusy} onClick={() => setSelectedIds(pendingSubmissions.map((item) => item.id))}>Select all pending</Button><Button className="bg-green-500 text-green-950 hover:bg-green-400" disabled={!selectedIds.length || bulkBusy} onClick={() => void bulkReview("approve")}>{bulkBusy ? <Loader2 className="animate-spin" /> : <Trophy />} Bulk approve</Button><Button variant="destructive" disabled={!selectedIds.length || bulkBusy} onClick={() => void bulkReview("reject")}>Bulk reject</Button></div></CardHeader><CardContent><Badge variant="outline" className="border-yellow-400/30 text-yellow-200">{selectedIds.length} selected</Badge></CardContent></Card>}

      {loading ? <Card className="glass-panel h-72 animate-pulse" /> : visibleSubmissions.length === 0 ? <Card className="glass-panel premium-card"><CardHeader><CardTitle className="text-white">No {reviewFilter.toLowerCase()} submissions</CardTitle><CardDescription>No records are available in this filter.</CardDescription></CardHeader></Card> : <section className="grid gap-4">{visibleSubmissions.map((submission) => <Card key={submission.id} className="glass-panel premium-card animated-border"><CardHeader className="gap-4 lg:grid lg:grid-cols-[1fr_auto]"><div><div className="mb-3 flex flex-wrap gap-2">{submission.status === "PENDING" && <label className="flex items-center gap-2 rounded-full border border-border bg-background/45 px-3 py-1 text-xs text-slate-300"><input type="checkbox" checked={selectedIds.includes(submission.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? Array.from(new Set([...current, submission.id])) : current.filter((id) => id !== submission.id))} /> Select</label>}<Badge variant="outline" className={statusClass(submission.status)}>{submission.status}</Badge><Badge variant="outline" className="border-primary/30 text-primary">{submission.task.points} pts</Badge><Badge variant="secondary">{submission.task.type}</Badge>{qualityFlags(submission).map((flag) => <Badge key={flag} variant="outline" className="border-yellow-400/30 bg-yellow-400/10 text-yellow-100">{flag}</Badge>)}</div><CardTitle className="text-white">{submission.task.title}</CardTitle><CardDescription className="mt-2">{submission.user.name} · {submission.user.email} · {submission.profile.xHandle ?? "no X handle"}</CardDescription><p className="mt-2 text-xs text-slate-400">Submitted {formatDate(submission.createdAt)}</p></div><div className="rounded-xl border border-border bg-background/45 p-3 text-sm text-slate-300"><p className="font-mono text-primary">{submission.profile.totalPoints} total pts</p><p className="mt-1 break-all">{submission.profile.rewardWallet ?? "no reward wallet"}</p></div></CardHeader><CardContent className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]"><div className="space-y-3">{submission.evidenceUrl && <a href={submission.evidenceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-primary hover:bg-primary/10"><ExternalLink className="size-4" /> Open evidence URL</a>}{submission.evidenceImageData ? <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={submission.evidenceImageData} alt="Task proof" className="max-h-96 w-full rounded-xl border border-border object-contain" /></> : <div className="rounded-xl border border-dashed border-border bg-background/35 p-6 text-sm text-slate-400">No screenshot attached.</div>}{submission.feedbackText && <div className="rounded-xl border border-purple-400/20 bg-purple-400/5 p-4"><p className="mb-2 text-xs font-medium uppercase tracking-wide text-purple-200">User feedback</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-200">{submission.feedbackText}</p></div>}{submission.humanityTestResult && <details className="rounded-xl border border-border bg-background/35 p-3 text-xs text-slate-300"><summary className="cursor-pointer font-medium text-white">ScamGuard test result</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap">{JSON.stringify(submission.humanityTestResult, null, 2)}</pre></details>}</div><ReviewControls submission={submission} busy={busyIds.has(submission.id)} onReview={review} /></CardContent></Card>)}</section>}
    </div>
  )
}

function ReviewControls({ submission, busy, onReview }: { submission: AdminSubmission; busy: boolean; onReview: (id: string, action: "approve" | "reject", notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(submission.adminNotes ?? "")
  const templates = [
    "Proof looks valid. Approved and points credited.",
    "Duplicate or low-quality proof. Rejected for this task.",
    "Screenshot does not clearly show account ownership or task completion.",
    "ScamGuard feedback reviewed and accepted.",
  ]

  if (submission.status !== "PENDING") {
    return <div className="rounded-xl border border-border bg-background/35 p-4 text-sm text-slate-300"><p className="font-medium text-white">Review complete</p><p className="mt-2">Decision: <span className={submission.status === "APPROVED" ? "text-green-200" : "text-red-200"}>{submission.status}</span></p>{submission.status === "APPROVED" && <p className="mt-1">Points credited: {submission.pointsAwarded}</p>}{submission.adminNotes && <p className="mt-3 border-l-2 border-primary/50 pl-3 leading-6">{submission.adminNotes}</p>}<p className="mt-3 text-xs text-slate-400">Reviewed {formatDate(submission.reviewedAt)}</p></div>
  }

  return <div className="space-y-3 rounded-xl border border-border bg-background/35 p-4"><label className="grid gap-2 text-sm text-slate-300">Admin note<Textarea value={notes} disabled={busy} onChange={(event) => setNotes(event.target.value)} placeholder="Record why this proof was approved or rejected." /></label><div className="flex flex-wrap gap-2">{templates.map((template) => <Button key={template} type="button" size="sm" variant="outline" disabled={busy} onClick={() => setNotes(template)}>{template.split(".")[0]}</Button>)}</div><div className="grid gap-2 sm:grid-cols-2"><Button type="button" className="bg-green-500 text-green-950 hover:bg-green-400" disabled={busy} onClick={() => void onReview(submission.id, "approve", notes)}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approve</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void onReview(submission.id, "reject", notes)}>{busy ? <Loader2 className="animate-spin" /> : <XCircle />} Reject</Button></div></div>
}
