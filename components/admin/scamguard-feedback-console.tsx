"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Feedback = { id: string; verdict: string; value: string | null; normalized: string | null; chain: string | null; reason: string | null; source: string; status: string; createdAt: string; reviewedBy: { email: string } | null }

export function ScamGuardFeedbackConsole() {
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/scamguard/feedback", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as { feedback?: Feedback[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? "Feedback could not be loaded")
      setFeedback(body.feedback ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Feedback could not be loaded")
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function review(id: string, status: "PROMOTED" | "DISMISSED") {
    setSaving(id)
    setError("")
    try {
      const response = await fetch("/api/admin/scamguard/feedback", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Feedback review failed")
      await load()
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : "Feedback review failed") } finally { setSaving("") }
  }

  return <Card className="glass-panel premium-card"><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Feedback review queue</CardTitle><CardDescription>Reports stay pending until an admin reviews them. Promotion records the review only; adding trusted or known-bad intelligence remains an explicit admin decision.</CardDescription></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh</Button></CardHeader><CardContent className="grid gap-3">{error && <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}{feedback.map((item) => <div key={item.id} className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 md:grid-cols-[1fr_auto]"><div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded border border-primary/30 px-2 py-1 text-primary">{item.verdict}</span><span className="rounded border border-border px-2 py-1 text-muted-foreground">{item.status}</span></div><p className="mt-2 break-all font-mono text-sm">{item.normalized ?? item.value ?? "No target supplied"}</p><p className="mt-1 text-sm text-muted-foreground">{item.reason || "No explanation supplied."}</p><p className="mt-2 text-xs text-muted-foreground">{item.source} · {new Date(item.createdAt).toLocaleString()}</p></div>{item.status === "PENDING" && <div className="flex items-start gap-2"><Button size="sm" variant="outline" disabled={saving === item.id} onClick={() => void review(item.id, "DISMISSED")}>{saving === item.id ? <Loader2 className="animate-spin" /> : <XCircle />}Dismiss</Button><Button size="sm" disabled={saving === item.id} onClick={() => void review(item.id, "PROMOTED")}>{saving === item.id ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Review complete</Button></div>}</div>)}{!feedback.length && !loading && <p className="py-6 text-center text-sm text-muted-foreground">No feedback is waiting for review.</p>}</CardContent></Card>
}
