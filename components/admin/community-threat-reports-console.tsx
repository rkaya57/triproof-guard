"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type Report = { id: string; projectName: string; target: string; targetKind: string; chain: string | null; category: string; description: string; evidenceUrl: string | null; evidenceNote: string | null; status: string; reviewerNote: string | null; promotedIntelEntryId: string | null; createdAt: string; reporter: { name: string; email: string }; reviewer: { name: string; email: string } | null }

export function CommunityThreatReportsConsole() {
  const [reports, setReports] = useState<Report[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/scamguard/community-reports", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as { reports?: Report[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? "Threat reports could not be loaded.")
      setReports(body.reports ?? [])
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Threat reports could not be loaded.") } finally { setLoading(false) }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  const pending = useMemo(() => reports.filter((report) => report.status === "PENDING"), [reports])

  async function review(id: string, status: "PUBLISHED" | "REJECTED", promoteToIntel = false) {
    setSaving(`${id}-${status}-${promoteToIntel}`)
    setError("")
    try {
      const response = await fetch("/api/admin/scamguard/community-reports", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, promoteToIntel, reviewerNote: notes[id] ?? "" }) })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Threat report review failed.")
      await load()
    } catch (reviewError) { setError(reviewError instanceof Error ? reviewError.message : "Threat report review failed.") } finally { setSaving("") }
  }

  return <Card className="glass-panel premium-card"><CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle>Community threat review queue</CardTitle><CardDescription>Publish only evidence-backed reports. Publishing to ScamGuard intelligence creates a reviewed `KNOWN_BAD` entry used by the scanner.</CardDescription></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button></CardHeader><CardContent className="grid gap-4">{error && <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}<div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{pending.length}</span> report{pending.length === 1 ? "" : "s"} waiting for review.</div>{reports.map((report) => <div key={report.id} className="rounded-lg border border-border bg-background/45 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded border border-primary/30 px-2 py-1 text-primary">{report.status}</span><span className="rounded border border-border px-2 py-1 text-muted-foreground">{report.category.replaceAll("_", " ")}</span><span className="rounded border border-border px-2 py-1 text-muted-foreground">{report.targetKind}</span></div><p className="mt-3 font-semibold">{report.projectName}</p><p className="mt-1 break-all font-mono text-xs text-primary">{report.target}</p><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{report.description}</p>{report.evidenceNote && <p className="mt-2 border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground">{report.evidenceNote}</p>}<p className="mt-3 text-xs text-muted-foreground">Submitted by {report.reporter.email} · {new Date(report.createdAt).toLocaleString()}</p>{report.evidenceUrl && <a className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={report.evidenceUrl} target="_blank" rel="noreferrer">Open evidence <ExternalLink className="size-3.5" /></a>}</div>{report.status === "PENDING" && <div className="grid min-w-56 gap-2"><Textarea value={notes[report.id] ?? ""} onChange={(event) => setNotes({ ...notes, [report.id]: event.target.value })} maxLength={1000} placeholder="Internal review note (optional)" /><Button variant="outline" disabled={Boolean(saving)} onClick={() => void review(report.id, "REJECTED")}><XCircle /> Reject</Button><Button variant="outline" disabled={Boolean(saving)} onClick={() => void review(report.id, "PUBLISHED")}><CheckCircle2 /> Publish only</Button><Button disabled={Boolean(saving)} onClick={() => void review(report.id, "PUBLISHED", true)}>{saving === `${report.id}-PUBLISHED-true` ? <Loader2 className="animate-spin" /> : <ShieldAlert />} Publish + add to engine</Button></div>}</div>{report.status !== "PENDING" && <p className="mt-3 text-xs text-muted-foreground">Reviewed by {report.reviewer?.email ?? "Unknown"}{report.promotedIntelEntryId ? " · Promoted to ScamGuard intelligence" : ""}{report.reviewerNote ? ` · ${report.reviewerNote}` : ""}</p>}</div>)}{!reports.length && !loading && <p className="py-6 text-center text-sm text-muted-foreground">No community reports have been submitted yet.</p>}</CardContent></Card>
}
