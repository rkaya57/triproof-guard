"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type IntelKind = "DOMAIN" | "WALLET" | "EVM_ADDRESS" | "SOLANA_ADDRESS" | "TOKEN" | "CONTRACT"
type IntelVerdict = "TRUSTED" | "SUSPICIOUS" | "KNOWN_BAD"

type IntelEntry = {
  id: string
  kind: IntelKind
  value: string
  normalized: string
  chain: string | null
  verdict: IntelVerdict
  label: string
  source: string
  notes: string | null
  active: boolean
  updatedAt: string
}

const emptyForm = {
  kind: "DOMAIN" as IntelKind,
  verdict: "SUSPICIOUS" as IntelVerdict,
  value: "",
  chain: "",
  label: "",
  source: "admin",
  notes: "",
  active: true,
}

function verdictClass(verdict: IntelVerdict) {
  if (verdict === "KNOWN_BAD") return "border-red-400/30 bg-red-400/10 text-red-100"
  if (verdict === "SUSPICIOUS") return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100"
  return "border-green-400/30 bg-green-400/10 text-green-100"
}

export function ScamGuardIntelConsole() {
  const [entries, setEntries] = useState<IntelEntry[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function load() {
    await Promise.resolve()
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/scamguard/intelligence", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as { entries?: IntelEntry[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? "ScamGuard intelligence could not be loaded")
      setEntries(body.entries ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "ScamGuard intelligence could not be loaded")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const stats = useMemo(() => {
    return {
      total: entries.length,
      trusted: entries.filter((entry) => entry.verdict === "TRUSTED").length,
      suspicious: entries.filter((entry) => entry.verdict === "SUSPICIOUS").length,
      knownBad: entries.filter((entry) => entry.verdict === "KNOWN_BAD").length,
    }
  }, [entries])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/admin/scamguard/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          chain: form.chain.trim() || null,
          value: form.value.trim(),
          label: form.label.trim(),
          notes: form.notes.trim() || null,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { entry?: IntelEntry; error?: string }
      if (!response.ok) throw new Error(body.error ?? "Entry could not be saved")
      setMessage("ScamGuard intelligence saved.")
      setForm(emptyForm)
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Entry could not be saved")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setError("")
    const response = await fetch(`/api/admin/scamguard/intelligence/${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? "Entry could not be deleted")
      return
    }
    setEntries((current) => current.filter((entry) => entry.id !== id))
    setMessage("Entry deleted.")
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Total entries", stats.total, "text-cyan-200"],
          ["Trusted", stats.trusted, "text-green-200"],
          ["Suspicious", stats.suspicious, "text-yellow-200"],
          ["Known bad", stats.knownBad, "text-red-200"],
        ].map(([label, value, tone]) => (
          <Card key={label as string} className="glass-panel premium-card">
            <CardHeader className="pb-3">
              <CardDescription className="text-slate-300">{label as string}</CardDescription>
              <CardTitle className={`text-3xl ${tone as string}`}>{String(value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <Card className="glass-panel premium-card">
        <CardHeader>
          <CardTitle className="text-white">Add or update intelligence</CardTitle>
          <CardDescription className="text-slate-300">
            Entries here affect ScamGuard scoring immediately after deploy/database migration. Known-bad beats trust; transaction intent still controls final safety.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 lg:grid-cols-6">
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-white" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as IntelKind }))}>
              {["DOMAIN", "WALLET", "EVM_ADDRESS", "SOLANA_ADDRESS", "TOKEN", "CONTRACT"].map((kind) => <option key={kind}>{kind}</option>)}
            </select>
            <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-white" value={form.verdict} onChange={(event) => setForm((current) => ({ ...current, verdict: event.target.value as IntelVerdict }))}>
              {["TRUSTED", "SUSPICIOUS", "KNOWN_BAD"].map((verdict) => <option key={verdict}>{verdict}</option>)}
            </select>
            <Input className="lg:col-span-2" placeholder="Domain, wallet, spender or contract" value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} />
            <Input placeholder="chain optional" value={form.chain} onChange={(event) => setForm((current) => ({ ...current, chain: event.target.value }))} />
            <Input placeholder="source" value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} />
            <Input className="lg:col-span-3" placeholder="Label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
            <Textarea className="lg:col-span-2" placeholder="Notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/45 px-3 py-2 text-sm text-slate-200">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
              Active
            </label>
            <Button className="lg:col-span-6" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />} Save intelligence
            </Button>
          </form>
          {(message || error) && <p className={`mt-4 text-sm ${error ? "text-red-200" : "text-green-200"}`}>{error || message}</p>}
        </CardContent>
      </Card>

      <Card className="glass-panel premium-card">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-white">Intelligence registry</CardTitle>
            <CardDescription className="text-slate-300">Manual overrides and reviewed domain/spender reputation.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-300">
              <tr><th className="py-2">Kind</th><th>Value</th><th>Verdict</th><th>Chain</th><th>Label</th><th>Updated</th><th /></tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="py-3 text-slate-300">{entry.kind}</td>
                  <td className="max-w-md truncate font-mono text-xs text-white">{entry.normalized}</td>
                  <td><span className={`rounded-full border px-2 py-1 text-xs ${verdictClass(entry.verdict)}`}>{entry.verdict}</span></td>
                  <td className="text-slate-300">{entry.chain ?? "-"}</td>
                  <td className="text-slate-300">{entry.label}</td>
                  <td className="text-slate-400">{new Date(entry.updatedAt).toLocaleString()}</td>
                  <td className="text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => void remove(entry.id)}>
                      <Trash2 /> Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td className="py-8 text-center text-slate-400" colSpan={7}>
                    {loading ? "Loading ScamGuard intelligence..." : "No entries yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
