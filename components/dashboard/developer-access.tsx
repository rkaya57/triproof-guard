"use client"

import { useEffect, useState } from "react"
import { Bot, Code2, Copy, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type ApiKey = { id: string; name: string; prefix: string; lastFour: string; isActive: boolean; lastUsedAt: string | null; createdAt: string }
type Group = { id: string; title: string | null; username: string | null; guardianEnabled: boolean; alertLevel: string; lastSeenAt: string }

export function DeveloperAccess() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [plan, setPlan] = useState("free")
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(0)
  const [groupLimit, setGroupLimit] = useState<number | null>(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [name, setName] = useState("Production key")
  const [revealedKey, setRevealedKey] = useState("")
  const [connectCommand, setConnectCommand] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  async function load() {
    const [apiResponse, groupResponse] = await Promise.all([fetch("/api/api-keys"), fetch("/api/telegram/groups/connect")])
    if (apiResponse.ok) {
      const body = await apiResponse.json()
      setKeys(body.keys ?? [])
      setPlan(body.plan ?? "free")
      setMonthlyLimit(typeof body.monthlyLimit === "number" ? body.monthlyLimit : body.isAdmin ? null : 0)
      setIsAdmin(Boolean(body.isAdmin))
    }
    if (groupResponse.ok) {
      const body = await groupResponse.json()
      setGroups(body.groups ?? [])
      setGroupLimit(typeof body.groupLimit === "number" ? body.groupLimit : body.isAdmin ? null : 0)
      setIsAdmin((current) => current || Boolean(body.isAdmin))
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function createKey() {
    setPending(true); setError(""); setRevealedKey("")
    try {
      const response = await fetch("/api/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not create API key.")
      setRevealedKey(body.token)
      await load()
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Could not create API key.") } finally { setPending(false) }
  }

  async function revokeKey(id: string) {
    setPending(true); setError("")
    try {
      const response = await fetch("/api/api-keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not revoke API key.")
      await load()
    } catch (revokeError) { setError(revokeError instanceof Error ? revokeError.message : "Could not revoke API key.") } finally { setPending(false) }
  }

  async function createConnectCode() {
    setPending(true); setError(""); setConnectCommand("")
    try {
      const response = await fetch("/api/telegram/groups/connect", { method: "POST" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? "Could not create group connection code.")
      setConnectCommand(body.command)
    } catch (connectError) { setError(connectError instanceof Error ? connectError.message : "Could not create group connection code.") } finally { setPending(false) }
  }

  async function copy(value: string) { await navigator.clipboard.writeText(value) }

  return <div className="grid gap-5">
    <Card className="glass-panel premium-card animated-border"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-white"><Code2 className="text-primary" />Developer and community access</CardTitle><CardDescription>{isAdmin ? "Administrator access: all product limits are bypassed for this account." : `Plan: ${plan.replaceAll("_", " ")}. API and Telegram protections are enforced by your active plan.`}</CardDescription></div><Badge variant="secondary" className="border-primary/30 text-primary">{monthlyLimit === null ? "Unlimited admin API" : monthlyLimit ? `${monthlyLimit.toLocaleString("en-US")} API requests / month` : "No API access"}</Badge></div></CardHeader></Card>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <section className="grid gap-5 xl:grid-cols-2">
      <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><KeyRound className="text-primary" />API keys</CardTitle><CardDescription>{isAdmin ? "Administrator keys have no active-key or API-request quota. Keys are shown once and can be revoked immediately." : "Create personal API keys for API Starter or API Growth. Keys are shown once and can be revoked immediately."}</CardDescription></CardHeader><CardContent className="grid gap-4"><div className="flex gap-2"><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /><Button type="button" onClick={createKey} disabled={pending}><Plus data-icon="inline-start" />Create key</Button></div>{revealedKey && <div className="rounded-lg border border-primary/35 bg-primary/10 p-4"><p className="text-sm font-medium text-primary">Copy this API key now</p><code className="mt-2 block break-all text-xs text-foreground">{revealedKey}</code><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => copy(revealedKey)}><Copy data-icon="inline-start" />Copy key</Button></div>}<div className="grid gap-2">{keys.length ? keys.map((key) => <div key={key.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/45 p-3"><div><p className="text-sm font-medium">{key.name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{key.prefix}...{key.lastFour}</p></div><Button type="button" variant="outline" size="sm" disabled={pending || !key.isActive} onClick={() => revokeKey(key.id)}><Trash2 data-icon="inline-start" />Revoke</Button></div>) : <p className="text-sm text-muted-foreground">No API keys yet.</p>}</div></CardContent></Card>
      <Card className="glass-panel premium-card"><CardHeader><CardTitle className="flex items-center gap-2 text-white"><Bot className="text-primary" />Telegram Group Guardian</CardTitle><CardDescription>{groupLimit === null ? "Administrator access protects unlimited groups and has no Group Guardian manager-slot limit." : `Community and API Growth protect up to ${groupLimit || 0} group. Generate a one-time code, then run it as a Telegram group administrator.`}</CardDescription></CardHeader><CardContent className="grid gap-4"><Button type="button" onClick={createConnectCode} disabled={pending}><ShieldCheck data-icon="inline-start" />Generate connection code</Button>{connectCommand && <div className="rounded-lg border border-primary/35 bg-primary/10 p-4"><p className="text-sm font-medium text-primary">Run this in your Telegram group</p><code className="mt-2 block break-all text-xs text-foreground">{connectCommand}</code><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => copy(connectCommand)}><Copy data-icon="inline-start" />Copy command</Button></div>}<div className="grid gap-2">{groups.length ? groups.map((group) => <div key={group.id} className="rounded-lg border border-border bg-background/45 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{group.title ?? group.username ?? "Telegram group"}</p><Badge variant="outline" className="border-primary/30 text-primary">{group.guardianEnabled ? "Protected" : "Paused"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Alert threshold: {group.alertLevel}</p></div>) : <p className="text-sm text-muted-foreground">No connected Telegram group.</p>}</div></CardContent></Card>
    </section>
  </div>
}
