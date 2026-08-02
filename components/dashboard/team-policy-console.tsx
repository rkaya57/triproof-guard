"use client"

import { useEffect, useState } from "react"
import { Ban, Plus, ShieldCheck, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Rule = { id: string; type: string; value: string | null; action: string }
type Policy = { id: string; name: string; active: boolean; rules: Rule[] }
type Violation = { id: string; target: string; source: string; chain: string | null; action: string; reason: string; createdAt: string; policy: { name: string } | null }

const ruleOptions = [
  ["DOMAIN_BLOCK", "Block domain"],
  ["DOMAIN_ALLOWLIST", "Allow only this domain"],
  ["EVM_SPENDER_BLOCK", "Block EVM spender"],
  ["UNLIMITED_APPROVAL_BLOCK", "Block unlimited approvals"],
  ["SOLANA_AUTHORITY_CHANGE_BLOCK", "Block Solana authority changes"],
]

export function TeamPolicyConsole() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [violations, setViolations] = useState<Violation[]>([])
  const [name, setName] = useState("Production wallet policy")
  const [ruleType, setRuleType] = useState("DOMAIN_BLOCK")
  const [value, setValue] = useState("")
  const [action, setAction] = useState("BLOCK")
  const [message, setMessage] = useState("")
  const [pending, setPending] = useState(false)

  async function load() {
    const response = await fetch("/api/team-policies", { cache: "no-store" })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error ?? "Could not load policies.")
    setPolicies(body.policies ?? []); setViolations(body.violations ?? [])
  }
  useEffect(() => { void load().catch((error) => setMessage(error.message)) }, [])

  async function create() {
    setPending(true); setMessage("")
    try {
      const response = await fetch("/api/team-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, rules: [{ type: ruleType, value: value || null, action }] }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not create policy.")
      setValue(""); setMessage("Policy is active across B2B scans and linked Telegram Guardians."); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create policy.") } finally { setPending(false) }
  }
  async function update(id: string, payload: Record<string, unknown>) {
    setPending(true); setMessage("")
    try {
      const response = await fetch("/api/team-policies", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...payload }) })
      const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? "Could not update policy."); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update policy.") } finally { setPending(false) }
  }
  async function remove(id: string) {
    setPending(true); setMessage("")
    try { const response = await fetch(`/api/team-policies?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error ?? "Could not delete policy."); await load() } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete policy.") } finally { setPending(false) }
  }

  const needsValue = ruleType === "DOMAIN_BLOCK" || ruleType === "DOMAIN_ALLOWLIST" || ruleType === "EVM_SPENDER_BLOCK"
  return <div className="grid gap-5">
    <Card className="glass-panel premium-card animated-border"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" />Team Policy Engine</CardTitle><CardDescription>Enforce clear rules in your B2B ScamGuard scans and linked Telegram Guardian groups. Policies are decision controls, not a substitute for contract review.</CardDescription></CardHeader><CardContent className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} aria-label="Policy name" /><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ruleType} onChange={(event) => setRuleType(event.target.value)}>{ruleOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>{needsValue ? <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={ruleType === "EVM_SPENDER_BLOCK" ? "0x spender address" : "example.com"} maxLength={280} /> : <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">No value required</div>}<select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={action} onChange={(event) => setAction(event.target.value)}><option value="BLOCK">Block</option><option value="REVIEW">Review</option></select><Button type="button" onClick={create} disabled={pending || !name.trim() || (needsValue && !value.trim())}><Plus data-icon="inline-start" />Add policy</Button></CardContent></Card>
    {message && <Alert><AlertDescription>{message}</AlertDescription></Alert>}
    <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card className="glass-panel premium-card"><CardHeader><CardTitle>Active policy sets</CardTitle><CardDescription>Block is enforced; Review turns into an explicit team escalation.</CardDescription></CardHeader><CardContent className="grid gap-3">{policies.length ? policies.map((policy) => <div key={policy.id} className="rounded-lg border border-border bg-background/45 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-foreground">{policy.name}</p><p className="mt-1 text-xs text-muted-foreground">{policy.rules.length} active rule{policy.rules.length === 1 ? "" : "s"}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={pending} onClick={() => void update(policy.id, { active: !policy.active })}>{policy.active ? "Pause" : "Activate"}</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => void remove(policy.id)}><Trash2 data-icon="inline-start" />Delete</Button></div></div><div className="mt-3 flex flex-wrap gap-2">{policy.rules.map((rule) => <Badge key={rule.id} variant="outline" className="gap-1 border-primary/30 text-primary">{rule.action} · {rule.type.replaceAll("_", " ")}{rule.value ? ` · ${rule.value}` : ""}<button type="button" aria-label="Remove rule" onClick={() => void update(policy.id, { removeRuleId: rule.id })}>×</button></Badge>)}</div></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No team policies yet.</p>}</CardContent></Card>
      <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2"><Ban className="text-amber-300" />Recent policy events</CardTitle><CardDescription>Latest policy matches from API and Group Guardian.</CardDescription></CardHeader><CardContent className="grid gap-3">{violations.length ? violations.map((item) => <div key={item.id} className="rounded-lg border border-border bg-background/45 p-3"><div className="flex justify-between gap-2"><p className="truncate text-sm font-medium">{item.policy?.name ?? "Deleted policy"}</p><Badge variant="outline" className="border-amber-300/30 text-amber-200">{item.action}</Badge></div><p className="mt-2 break-all text-xs text-primary">{item.target}</p><p className="mt-2 text-xs text-muted-foreground">{item.reason}</p><p className="mt-2 text-[11px] text-muted-foreground">{item.source} · {new Date(item.createdAt).toLocaleString()}</p></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No policy events yet.</p>}</CardContent></Card>
    </section>
  </div>
}
