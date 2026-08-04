from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing expected block: {label}")
    if text.count(old) != 1:
        raise SystemExit(f"Expected one match for {label}, found {text.count(old)}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, new: str, label: str) -> str:
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"Missing start marker: {label}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"Missing end marker: {label}")
    return text[:start_index] + new + text[end_index:]


client_path = Path("components/airdrop/airdrop-tasks-client.tsx")
client = client_path.read_text()

client = replace_once(
    client,
    '''async function readError(response: Response) {
  const data = await response.json().catch(() => ({}))
  return data.error ?? "Request failed"
}
''',
    '''async function readError(response: Response) {
  const data = await response.json().catch(() => ({}))
  return data.error ?? "Request failed"
}

function mergeAirdropResponse(current: AirdropResponse | null, incoming: AirdropResponse) {
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

function formatSubmissionTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""
  return parsed.toLocaleString()
}
''',
    "client response helpers",
)

client = replace_once(
    client,
    '  const [busyTask, setBusyTask] = useState<string | null>(null)\n  const [scamGuardResult, setScamGuardResult] = useState<ScamGuardResult | null>(null)\n',
    '  const [busyTask, setBusyTask] = useState<string | null>(null)\n  const [refreshing, setRefreshing] = useState(false)\n  const [scamGuardResult, setScamGuardResult] = useState<ScamGuardResult | null>(null)\n',
    "client refreshing state",
)

client = replace_between(
    client,
    '  async function refresh() {\n',
    '  useEffect(() => {\n',
    '''  async function refresh(options?: { silent?: boolean }) {
    const silent = Boolean(options?.silent)
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
      if (!response.ok) {
        throw new Error(await readError(response))
      }

      const body = (await response.json()) as AirdropResponse
      if (!Array.isArray(body.tasks)) {
        throw new Error("Airdrop task response is not ready yet.")
      }

      setData((current) => mergeAirdropResponse(current, body))
      setScamGuardResult(
        body.tasks.find((task) => task.type === "HUMANITY_GATE_FEEDBACK")?.submission
          ?.humanityTestResult ?? null
      )
    } catch (err) {
      if (!silent) setData(null)
      setError(err instanceof Error ? err.message : "Could not load airdrop tasks.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

''',
    "client refresh function",
)

client = replace_between(
    client,
    '  async function submitTask(event: FormEvent<HTMLFormElement>, task: AirdropTask) {\n',
    '  async function runScamGuardTest() {\n',
    '''  async function submitTask(event: FormEvent<HTMLFormElement>, task: AirdropTask) {
    event.preventDefault()
    const formElement = event.currentTarget
    const currentSubmission = task.submission
    const completingScamGuardFeedback =
      task.type === "HUMANITY_GATE_FEEDBACK" &&
      currentSubmission?.status === "PENDING" &&
      Boolean(currentSubmission.humanityTestResult) &&
      !currentSubmission.feedbackText

    if (
      busyTask === task.slug ||
      ((currentSubmission?.status === "PENDING" || currentSubmission?.status === "APPROVED") &&
        !completingScamGuardFeedback)
    ) {
      setMessage(
        currentSubmission?.status === "APPROVED"
          ? "This task is already approved."
          : "This task is already waiting for admin review."
      )
      await refresh({ silent: true })
      return
    }

    setBusyTask(task.slug)
    setError(null)
    setMessage(null)

    try {
      const form = new FormData(formElement)
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

      if (!response.ok) {
        const responseError = await readError(response)
        if (response.status === 409) {
          await refresh({ silent: true })
          setMessage(responseError)
          return
        }
        throw new Error(responseError)
      }

      const body = (await response.json()) as { submission: NonNullable<AirdropTask["submission"]> }
      setData((current) => {
        if (!current) return current
        const previousStatus = task.submission?.status
        return {
          ...current,
          summary: {
            ...current.summary,
            pendingCount: previousStatus === "PENDING" ? current.summary.pendingCount : current.summary.pendingCount + 1,
            rejectedCount: previousStatus === "REJECTED" ? Math.max(0, current.summary.rejectedCount - 1) : current.summary.rejectedCount,
          },
          tasks: current.tasks.map((currentTask) =>
            currentTask.slug === task.slug
              ? { ...currentTask, submission: body.submission }
              : currentTask
          ),
        }
      })
      setMessage("Proof submitted successfully. It is now waiting for admin review.")
      formElement.reset()
      await refresh({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setBusyTask((current) => (current === task.slug ? null : current))
    }
  }

''',
    "client submit function",
)

client = replace_once(
    client,
    '      await refresh()\n',
    '      await refresh({ silent: true })\n',
    "scamguard silent refresh",
)

client = replace_once(
    client,
    '''          const approved = submission?.status === "APPROVED"
          const scamGuardTask = task.type === "HUMANITY_GATE_FEEDBACK"
          const threatPoolTask = task.type === "THREAT_REPORT"
          const testResult = scamGuardResult ?? submission?.humanityTestResult ?? null
''',
    '''          const approved = submission?.status === "APPROVED"
          const pending = submission?.status === "PENDING"
          const rejected = submission?.status === "REJECTED"
          const scamGuardTask = task.type === "HUMANITY_GATE_FEEDBACK"
          const threatPoolTask = task.type === "THREAT_REPORT"
          const testResult = scamGuardResult ?? submission?.humanityTestResult ?? null
          const scamGuardNeedsFeedback = scamGuardTask && pending && Boolean(testResult) && !submission?.feedbackText
          const submissionLocked = approved || (pending && !scamGuardNeedsFeedback)
          const taskBusy = busyTask === task.slug
''',
    "client task status variables",
)

client = replace_once(
    client,
    '''                {!approved && !threatPoolTask && (
                  <form onSubmit={(event) => submitTask(event, task)} className="space-y-3">
''',
    '''                {submissionLocked && !threatPoolTask && (
                  <div className={`rounded-xl border p-4 text-sm ${approved ? "border-green-400/25 bg-green-400/10 text-green-100" : "border-yellow-400/25 bg-yellow-400/10 text-yellow-100"}`}>
                    <p className="flex items-center gap-2 font-medium">
                      {approved ? <CheckCircle2 className="size-4" /> : <ClipboardCheck className="size-4" />}
                      {approved ? "Task approved" : "Proof submitted — pending admin review"}
                    </p>
                    <p className="mt-2 leading-6 text-slate-300">
                      {approved
                        ? `${submission?.pointsAwarded ?? task.points} points were credited. This task cannot be completed again.`
                        : "Your evidence is in the review queue. The submit button is locked until an admin decides."}
                    </p>
                    {submission?.createdAt && (
                      <p className="mt-2 font-mono text-xs text-slate-400">Submitted: {formatSubmissionTime(submission.createdAt)}</p>
                    )}
                  </div>
                )}

                {rejected && !threatPoolTask && (
                  <div className="rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
                    <p className="flex items-center gap-2 font-medium"><AlertCircle className="size-4" /> Proof rejected</p>
                    <p className="mt-2 leading-6 text-slate-300">Correct the evidence below and resubmit. The same task record will be reused.</p>
                  </div>
                )}

                {!submissionLocked && !threatPoolTask && (
                  <form onSubmit={(event) => submitTask(event, task)} className="space-y-3">
''',
    "client locked status panel",
)

client = replace_once(
    client,
    '                        <Input name="evidenceUrl" placeholder="https://x.com/yourhandle/status/..." disabled={locked} required />\n',
    '                        <Input name="evidenceUrl" placeholder="https://x.com/yourhandle/status/..." disabled={locked || taskBusy} required />\n',
    "quote input busy state",
)

client = replace_once(
    client,
    '                          disabled={locked || Boolean(submission?.feedbackText)}\n',
    '                          disabled={locked || taskBusy || Boolean(submission?.feedbackText)}\n',
    "feedback input busy state",
)

client = replace_once(
    client,
    '                          disabled={locked}\n',
    '                          disabled={locked || taskBusy}\n',
    "proof input busy state",
)

client = replace_once(
    client,
    '''                      disabled={
                        locked ||
                        busyTask === task.slug ||
                        (scamGuardTask && (!testResult || Boolean(submission?.feedbackText)))
                      }
                      className="w-full"
                    >
                      {busyTask === task.slug ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                      {locked ? "Register to unlock" : "Submit for admin approval"}
''',
    '''                      disabled={
                        locked ||
                        taskBusy ||
                        submissionLocked ||
                        (scamGuardTask && (!testResult || Boolean(submission?.feedbackText)))
                      }
                      className="w-full"
                    >
                      {taskBusy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
                      {locked
                        ? "Register to unlock"
                        : taskBusy
                          ? "Submitting proof..."
                          : rejected
                            ? "Resubmit corrected proof"
                            : "Submit for admin approval"}
''',
    "submit button state",
)

client = replace_once(
    client,
    '''          <Button
            onClick={refresh}
''',
    '''          <Button
            onClick={() => void refresh({ silent: true })}
''',
    "client manual refresh handler",
) if '          <Button\n            onClick={refresh}\n' in client else client

client_path.write_text(client)

admin_path = Path("components/admin/airdrop-review-console.tsx")
admin = admin_path.read_text()

admin = replace_once(
    admin,
    '''type AdminResponse = {
  totals: Record<string, number>
  submissions: AdminSubmission[]
}
''',
    '''type AdminResponse = {
  totalCount: number
  totals: Record<string, number>
  submissions: AdminSubmission[]
}
''',
    "admin response total count",
)

admin = replace_between(
    admin,
    '  const loadTasks = useCallback(async () => {\n',
    '  const load = useCallback(async () => {\n',
    '''  const loadTasks = useCallback(async () => {
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

''',
    "admin task loader",
)

admin = replace_between(
    admin,
    '  const load = useCallback(async () => {\n',
    '  useEffect(() => {\n',
    '''  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/admin/airdrop/submissions?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not load airdrop submissions")
      setData(body as AdminResponse)
      setSelectedIds((current) => current.filter((id) => (body as AdminResponse).submissions.some((submission) => submission.id === id && submission.status === "PENDING")))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load airdrop submissions")
    } finally {
      setLoading(false)
    }
  }, [])

''',
    "admin submission loader",
)

admin = replace_between(
    admin,
    '  async function review(id: string, action: "approve" | "reject", notes: string) {\n',
    '  async function bulkReview(action: "approve" | "reject") {\n',
    '''  async function review(id: string, action: "approve" | "reject", notes: string) {
    if (busyId) return
    setBusyId(id)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/admin/airdrop/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNotes: notes }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Review failed")

      const nextStatus: SubmissionStatus = action === "approve" ? "APPROVED" : "REJECTED"
      setData((current) => {
        if (!current) return current
        return {
          ...current,
          totals: {
            ...current.totals,
            PENDING: Math.max(0, (current.totals.PENDING ?? 0) - 1),
            [nextStatus]: (current.totals[nextStatus] ?? 0) + 1,
          },
          submissions: current.submissions.map((submission) =>
            submission.id === id
              ? {
                  ...submission,
                  status: nextStatus,
                  pointsAwarded: action === "approve" ? submission.task.points : 0,
                  adminNotes: notes.trim() || null,
                  reviewedAt: new Date().toISOString(),
                }
              : submission
          ),
        }
      })
      setMessage(action === "approve" ? "Submission approved and points credited." : "Submission rejected.")
      setSelectedIds((current) => current.filter((selectedId) => selectedId !== id))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed")
      await load()
    } finally {
      setBusyId(null)
    }
  }

''',
    "admin single review",
)

admin = replace_between(
    admin,
    '  async function bulkReview(action: "approve" | "reject") {\n',
    '  return (\n',
    '''  async function bulkReview(action: "approve" | "reject") {
    const ids = selectedIds.filter((id) => pendingSubmissions.some((submission) => submission.id === id))
    if (!ids.length || busyId) return

    setBusyId("bulk")
    setMessage(null)
    setError(null)

    try {
      const results = await Promise.all(
        ids.map(async (id) => {
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
          return { id, ok: response.ok, error: response.ok ? null : await readError(response) }
        })
      )

      const succeeded = results.filter((result) => result.ok)
      const failed = results.filter((result) => !result.ok)
      setSelectedIds(failed.map((result) => result.id))
      await load()

      if (failed.length) {
        setError(`${succeeded.length} reviewed, ${failed.length} failed. ${failed[0]?.error ?? "Refresh and try again."}`)
      } else {
        setMessage(action === "approve" ? `${succeeded.length} submissions approved.` : `${succeeded.length} submissions rejected.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk review failed")
      await load()
    } finally {
      setBusyId(null)
    }
  }

''',
    "admin bulk review",
)

admin = replace_once(
    admin,
    '["Total", data?.submissions.length ?? 0, "Last 100 submissions", "text-primary"],',
    '["Total", data?.totalCount ?? 0, `Showing latest ${data?.submissions.length ?? 0}`, "text-primary"],',
    "admin accurate total card",
)

admin = replace_once(
    admin,
    '''                              event.target.checked
                                ? [...current, submission.id]
                                : current.filter((id) => id !== submission.id)
''',
    '''                              event.target.checked
                                ? Array.from(new Set([...current, submission.id]))
                                : current.filter((id) => id !== submission.id)
''',
    "admin deduplicated selection",
)

admin_path.write_text(admin)

print("Airdrop task status and review UI fixes applied.")
