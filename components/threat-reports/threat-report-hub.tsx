"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, CheckCircle2, ExternalLink, FileWarning, Loader2, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type PublicReport = {
  id: string
  projectName: string
  target: string
  targetKind: string
  chain: string | null
  category: string
  description: string
  evidenceUrl: string | null
  evidenceNote: string | null
  publishedAt: string | null
  promotedIntelEntryId: string | null
}

const categories = [
  ["phishing", "Phishing or fake site"],
  ["wallet_drainer", "Wallet drainer"],
  ["fake_airdrop", "Fake airdrop or claim"],
  ["rug_pull", "Rug pull"],
  ["impersonation", "Project impersonation"],
  ["malicious_contract", "Malicious contract"],
  ["other", "Other"],
] as const

const targetKinds = [
  ["DOMAIN", "Domain or URL"],
  ["SOLANA_ADDRESS", "Solana wallet or program"],
  ["EVM_ADDRESS", "EVM wallet or spender"],
  ["TOKEN", "Token mint or contract"],
  ["CONTRACT", "EVM contract"],
] as const

function labelFor(items: ReadonlyArray<readonly [string, string]>, value: string) {
  return items.find(([key]) => key === value)?.[1] ?? value.replaceAll("_", " ")
}

export function ThreatReportHub({ initialReports, isSignedIn, initialTarget = "", initialTargetKind = "DOMAIN" }: { initialReports: PublicReport[]; isSignedIn: boolean; initialTarget?: string; initialTargetKind?: string }) {
  const [reports] = useState(initialReports)
  const [query, setQuery] = useState("")
  const [form, setForm] = useState({ projectName: "", target: initialTarget, targetKind: initialTargetKind, chain: "unknown", category: "phishing", description: "", evidenceUrl: "", evidenceNote: "" })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const filteredReports = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return reports
    return reports.filter((report) => [report.projectName, report.target, report.category, report.chain].some((value) => value?.toLowerCase().includes(needle)))
  }, [query, reports])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/threat-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) })
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!response.ok) throw new Error(body.error ?? "Threat report could not be submitted.")
      setMessage(body.message ?? "Report submitted for admin review.")
      setForm({ projectName: "", target: "", targetKind: "DOMAIN", chain: "unknown", category: "phishing", description: "", evidenceUrl: "", evidenceNote: "" })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Threat report could not be submitted.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="glass-panel border-primary/25 bg-primary/5">
          <CardHeader>
            <Badge variant="outline" className="w-fit border-red-400/35 bg-red-400/10 text-red-100"><ShieldAlert /> Community-reviewed intelligence</Badge>
            <CardTitle className="text-3xl">Threat Reports</CardTitle>
            <CardDescription className="max-w-2xl text-base leading-7">A moderated public pool of reported scam projects, phishing domains, malicious contracts, and wallet-drainer infrastructure. Every listing is reviewed by Tri-Proof admins before publication.</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-yellow-400/25 bg-yellow-400/5">
          <CardHeader>
            <AlertTriangle className="size-6 text-yellow-300" />
            <CardTitle className="text-lg">Use as a signal, not proof</CardTitle>
            <CardDescription>Listings are evidence-led safety reports, not legal findings. Verify the target and never share seed phrases or private keys.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-2xl font-semibold">Published threat pool</h2><p className="mt-1 text-sm text-muted-foreground">{reports.length} reviewed {reports.length === 1 ? "report" : "reports"} available.</p></div>
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, domain, chain..." className="max-w-sm" aria-label="Search threat reports" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {filteredReports.map((report) => <Card key={report.id} className="premium-card overflow-hidden border-red-400/20 bg-card/70"><CardHeader className="gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className="border-red-400/35 bg-red-400/10 text-red-100">Reviewed report</Badge>{report.promotedIntelEntryId && <Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary">ScamGuard intel</Badge>}</div><CardTitle className="text-xl">{report.projectName}</CardTitle><CardDescription className="break-all font-mono text-xs text-primary">{report.target}</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="flex flex-wrap gap-2 text-xs"><span className="rounded border border-border px-2 py-1 text-muted-foreground">{labelFor(categories, report.category)}</span><span className="rounded border border-border px-2 py-1 text-muted-foreground">{labelFor(targetKinds, report.targetKind)}</span>{report.chain && <span className="rounded border border-border px-2 py-1 text-muted-foreground">{report.chain}</span>}</div><p className="text-sm leading-6 text-muted-foreground">{report.description}</p>{report.evidenceNote && <p className="border-l-2 border-primary/60 pl-3 text-sm text-muted-foreground">{report.evidenceNote}</p>}<div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground"><span>{report.publishedAt ? new Date(report.publishedAt).toLocaleDateString() : "Reviewed"}</span>{report.evidenceUrl && <a href={report.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Evidence <ExternalLink className="size-3.5" /></a>}</div></CardContent></Card>)}
            {!filteredReports.length && <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground md:col-span-2"><FileWarning className="mx-auto mb-3 size-6 text-primary" />No published reports match this search.</div>}
          </div>
        </div>

        <Card className="h-fit border-primary/30 bg-card/80 xl:sticky xl:top-6">
          <CardHeader>
            <Badge variant="outline" className="w-fit border-primary/35 bg-primary/10 text-primary">Submit for review</Badge>
            <CardTitle>Report a suspicious project</CardTitle>
            <CardDescription>Your report stays private until an admin reviews and publishes it. Please submit concrete, first-hand evidence.</CardDescription>
          </CardHeader>
          <CardContent>
            {!isSignedIn ? <div className="grid gap-4"><p className="text-sm leading-6 text-muted-foreground">Sign in so we can prevent spam and follow up on the evidence if needed.</p><Link href="/login?next=%2Fthreat-reports" className={buttonVariants()}><CheckCircle2 /> Sign in to submit</Link><Link href="/register?next=%2Fthreat-reports" className={buttonVariants({ variant: "outline" })}>Create account</Link></div> : <form onSubmit={submit} className="grid gap-4"><label className="grid gap-2 text-sm font-medium">Project or campaign name<Input required value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} placeholder="Example Project" /></label><label className="grid gap-2 text-sm font-medium">Target<SelectField value={form.targetKind} onChange={(value) => setForm({ ...form, targetKind: value })} options={targetKinds} /></label><Input required value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} placeholder="domain, wallet, token, or contract" aria-label="Threat target" /><div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-sm font-medium">Category<SelectField value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={categories} /></label><label className="grid gap-2 text-sm font-medium">Chain<SelectField value={form.chain} onChange={(value) => setForm({ ...form, chain: value })} options={[["unknown", "Unknown"], ["solana", "Solana"], ["evm", "EVM"], ["multichain", "Multichain"]]} /></label></div><label className="grid gap-2 text-sm font-medium">What happened?<Textarea required minLength={30} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the behavior, wallet prompt, transaction, impersonation, or loss pattern." /></label><label className="grid gap-2 text-sm font-medium">Evidence URL <span className="font-normal text-muted-foreground">(optional)</span><Input type="url" value={form.evidenceUrl} onChange={(event) => setForm({ ...form, evidenceUrl: event.target.value })} placeholder="https://..." /></label><label className="grid gap-2 text-sm font-medium">Evidence note <span className="font-normal text-muted-foreground">(optional)</span><Textarea maxLength={1000} value={form.evidenceNote} onChange={(event) => setForm({ ...form, evidenceNote: event.target.value })} placeholder="Transaction, public post, or other context." /></label>{error && <p className="rounded-md border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}{message && <p className="rounded-md border border-green-400/30 bg-green-400/10 p-3 text-sm text-green-100">{message}</p>}<Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <ShieldAlert />} Submit for review</Button></form>}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function SelectField({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]> }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">{options.map(([key, label]) => <option key={key} value={key} className="bg-background">{label}</option>)}</select>
}
