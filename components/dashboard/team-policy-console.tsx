"use client"

import { useEffect, useMemo, useState } from "react"
import { Activity, Ban, CircleAlert, Clock3, Plus, Radio, ShieldCheck, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Rule = { id: string; type: string; value: string | null; action: string }
type Policy = { id: string; name: string; active: boolean; rules: Rule[] }
type Violation = { id: string; target: string; source: string; chain: string | null; action: string; reason: string; createdAt: string; policy: { name: string } | null }
type Summary = { total: number; blocked: number; reviewed: number; last24Hours: number; sources: Array<{ source: string; count: number }> }

const ruleOptions = [
  ["DOMAIN_BLOCK", "Block domain"],
  ["DOMAIN_ALLOWLIST", "Allow only this domain"],
  ["EVM_SPENDER_BLOCK", "Block EVM spender"],
  ["UNLIMITED_APPROVAL_BLOCK", "Block unlimited approvals"],
  ["SOLANA_AUTHORITY_CHANGE_BLOCK", "Block Solana authority changes"],
]

function sourceLabel(value: string) {
  if (value === "chrome_extension") return "Chrome extension"
  if (value === "telegram_guardian") return "Telegram Guardian"
  if (value === "api_v1") return "B2B API"
  return value.replaceAll("_", " ")
}

function relativeTime(value: string) {
  const delta = Math.max(0, Date.now() - new Date(value).getTime())
  if (delta < 60_000) return "just now"
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
  return `${Math.floor(delta / 86_400_000)}d ago`
}

export function TeamPolicyConsole() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [violations, setViolations] = useState<Violation[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, blocked: 0, reviewed: 0, last24Hours: 0, sources: [] })
  const [name, setName] = useState("Production wallet policy")
  const [ruleType, setRuleType] = useState("DOMAIN_BLOCK")
  const [value, setValue] = useState("")
  const [action, setAction] = useState("BLOCK")
  const [source, setSource] = useState("all")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function load() {
    const response = await fetch("/api/team-policies", { cache: "no-store" })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error ?? "Could not load policies.")
    setPolicies(body.policies ?? [])
    setViolations(body.violations ?? [])
    setSummary(body.summary ?? { total: 0, blocked: 0, reviewed: 0, last24Hours: 0, sources: [] })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((error) => setMessage(error.message))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function create() {
    setPending(true)
    setMessage("")
    try {
      const response = await fetch("/api/team-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, rules: [{ type: ruleType, value: value || null, action }] }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not create policy.")
      setValue("")
      setMessage("Policy is active across B2B scans, linked Telegram Guardians, and connected Chrome extensions.")
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create policy.")
    } finally {
      setPending(false)
    }
  }

  async function update(id: string, payload: Record<string, unknown>) {
    setPending(true)
    setMessage("")
    try {
      const response = await fetch("/api/team-policies", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not update policy.")
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update policy.")
    } finally {
      setPending(false)
    }
  }

  async function remove(id: string) {
    setPending(true)
    setMessage("")
    try {
      const response = await fetch(`/api/team-policies?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not delete policy.")
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete policy.")
    } finally {
      setPending(false)
    }
  }

  const needsValue = ruleType === "DOMAIN_BLOCK" || ruleType === "DOMAIN_ALLOWLIST" || ruleType === "EVM_SPENDER_BLOCK"
  const filteredViolations = useMemo(() => source === "all" ? violations : violations.filter((item) => item.source === source), [source, violations])

  return <div className="grid gap-5">
    <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
      <Card className="glass-panel premium-card animated-border"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Security operations</p><CardTitle className="mt-2 flex items-center gap-2 text-white"><ShieldCheck className="text-primary" />Team Policy Engine</CardTitle><CardDescription className="mt-2 max-w-2xl">Define non-negotiable controls once, then enforce and observe them in your B2B API, Telegram Guardian, and connected Chrome extensions.</CardDescription></div><Badge variant="outline" className="border-primary/35 bg-primary/10 text-primary"><Radio data-icon="inline-start" />Live enforcement</Badge></div></CardHeader><CardContent className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} aria-label="Policy name" /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ruleType} onChange={(event) => setRuleType(event.target.value)}>{ruleOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{needsValue ? <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={ruleType === "EVM_SPENDER_BLOCK" ? "0x spender address" : "example.com"} maxLength={280} /> : <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">No value required</div>}<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={action} onChange={(event) => setAction(event.target.value)}><option value="BLOCK">Block</option><option value="REVIEW">Review</option></select><Button type="button" onClick={create} disabled={pending || !name.trim() || (needsValue && !value.trim())}><Plus data-icon="inline-start" />Add policy</Button></CardContent></Card>
      <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="text-primary" />Activity signal</CardTitle><CardDescription>Every non-allow decision is retained with its source and reason.</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-2">{summary.sources.length ? summary.sources.map((item) => <Badge key={item.source} variant="outline" className="border-border bg-background/45 text-muted-foreground">{sourceLabel(item.source)}: {item.count}</Badge>) : <p className="text-sm text-muted-foreground">No policy matches recorded yet.</p>}</div><p className="mt-5 text-xs leading-5 text-muted-foreground">Configure a webhook with <code className="text-primary">policy.blocked</code> or <code className="text-primary">policy.review</code> to receive signed incident events outside the dashboard.</p></CardContent></Card>
    </section>

    {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: "Total matches", value: summary.total, icon: Activity, tone: "text-primary" }, { label: "Blocked", value: summary.blocked, icon: Ban, tone: "text-rose-300" }, { label: "Review required", value: summary.reviewed, icon: CircleAlert, tone: "text-amber-200" }, { label: "Last 24 hours", value: summary.last24Hours, icon: Clock3, tone: "text-emerald-300" }].map((item) => <Card key={item.label} className="glass-panel premium-card"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 text-3xl font-semibold text-foreground">{item.value}</p></div><item.icon className={item.tone} /></CardContent></Card>)}
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <Card className="glass-panel premium-card"><CardHeader><CardTitle>Active policy sets</CardTitle><CardDescription>Block stops the action. Review opens a mandatory decision checkpoint.</CardDescription></CardHeader><CardContent className="grid gap-3">{policies.length ? policies.map((policy) => <div key={policy.id} className="rounded-lg border border-border bg-background/45 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-foreground">{policy.name}</p><p className="mt-1 text-xs text-muted-foreground">{policy.rules.length} active rule{policy.rules.length === 1 ? "" : "s"} {policy.active ? "across all connected surfaces" : "paused"}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void update(policy.id, { active: !policy.active })}>{policy.active ? "Pause" : "Activate"}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => void remove(policy.id)}><Trash2 data-icon="inline-start" />Delete</Button></div></div><div className="mt-3 flex flex-wrap gap-2">{policy.rules.map((rule) => <Badge key={rule.id} variant="outline" className="gap-1 border-primary/30 text-primary">{rule.action} / {rule.type.replaceAll("_", " ")}{rule.value ? ` / ${rule.value}` : ""}<button type="button" aria-label="Remove rule" onClick={() => void update(policy.id, { removeRuleId: rule.id })}>x</button></Badge>)}</div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No team policies yet.</p>}</CardContent></Card>
      <Card className="glass-panel premium-card"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Ban className="text-amber-300" />Policy activity</CardTitle><CardDescription>Chrome, Telegram Guardian, and B2B API decisions in one audit trail.</CardDescription></div><select aria-label="Filter policy activity source" className="h-9 rounded-md border border-input bg-background px-2 text-xs" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option>{summary.sources.map((item) => <option key={item.source} value={item.source}>{sourceLabel(item.source)}</option>)}</select></div></CardHeader><CardContent className="grid max-h-[650px] gap-3 overflow-y-auto">{filteredViolations.length ? filteredViolations.map((item) => <article key={item.id} className="rounded-lg border border-border bg-background/45 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="truncate text-sm font-medium">{item.policy?.name ?? "Deleted policy"}</p><Badge variant="outline" className={item.action === "BLOCK" ? "border-rose-300/35 text-rose-200" : "border-amber-300/35 text-amber-200"}>{item.action}</Badge></div><p className="mt-2 break-all text-xs text-primary">{item.target}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>{sourceLabel(item.source)}</span><span>{item.chain ?? "unknown chain"}</span><span>{relativeTime(item.createdAt)}</span></div></article>) : <p className="py-8 text-center text-sm text-muted-foreground">No policy events match this filter.</p>}</CardContent></Card>
    </section>
  </div>
}
