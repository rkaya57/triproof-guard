"use client"

import { useEffect, useMemo, useState } from "react"
import { Dna, Loader2, RefreshCw, Save, ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type DnaVerdict = "UNKNOWN" | "SUSPICIOUS" | "KNOWN_BAD"

type FingerprintSummary = {
  id: string
  domain: string
  riskLevel: string
  score: number
  observationCount: number
  behaviorFlags: unknown
  lastSeenAt: string
}

type DnaCampaign = {
  id: string
  clusterKey: string
  verdict: DnaVerdict
  label: string | null
  notes: string | null
  sampleCount: number
  domainCount: number
  strongestRisk: string
  domains: unknown
  lastSeenAt: string
  fingerprints: FingerprintSummary[]
}

type DnaResponse = {
  campaigns?: DnaCampaign[]
  stats?: {
    campaigns: number
    fingerprints: number
    reviewed: number
    crossDomain: number
  }
  error?: string
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
}

function verdictTone(verdict: DnaVerdict) {
  if (verdict === "KNOWN_BAD") return "border-red-400/35 bg-red-400/10 text-red-100"
  if (verdict === "SUSPICIOUS") return "border-amber-400/35 bg-amber-400/10 text-amber-100"
  return "border-cyan-400/25 bg-cyan-400/5 text-cyan-100"
}

export function ScamDnaConsole() {
  const [campaigns, setCampaigns] = useState<DnaCampaign[]>([])
  const [stats, setStats] = useState({ campaigns: 0, fingerprints: 0, reviewed: 0, crossDomain: 0 })
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/scamguard/dna", { cache: "no-store" })
      const body = (await response.json().catch(() => ({}))) as DnaResponse
      if (!response.ok) throw new Error(body.error ?? "Scam DNA could not be loaded")
      setCampaigns(body.campaigns ?? [])
      setStats(body.stats ?? { campaigns: 0, fingerprints: 0, reviewed: 0, crossDomain: 0 })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Scam DNA could not be loaded")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const orderedCampaigns = useMemo(() => {
    const verdictOrder: Record<DnaVerdict, number> = { KNOWN_BAD: 0, SUSPICIOUS: 1, UNKNOWN: 2 }
    return [...campaigns].sort((left, right) => verdictOrder[left.verdict] - verdictOrder[right.verdict])
  }, [campaigns])

  function updateLocal(id: string, patch: Partial<DnaCampaign>) {
    setCampaigns((current) => current.map((campaign) => campaign.id === id ? { ...campaign, ...patch } : campaign))
  }

  async function save(campaign: DnaCampaign) {
    setSavingId(campaign.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/admin/scamguard/dna", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaign.id,
          verdict: campaign.verdict,
          label: campaign.label,
          notes: campaign.notes,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Campaign could not be updated")
      setMessage("Scam DNA review saved.")
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Campaign could not be updated")
    } finally {
      setSavingId("")
    }
  }

  return (
    <section className="grid gap-5" aria-labelledby="scam-dna-title">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan-300"><Dna className="size-4" /> URL Sandbox intelligence</p>
          <h2 id="scam-dna-title" className="mt-2 text-2xl font-semibold text-white">Scam DNA campaign clusters</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">
            Review cross-domain clones built from DOM, scripts, behavior, redirects, and wallet targets. UNKNOWN clusters never raise a stop signal by themselves.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh DNA
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Campaign clusters", stats.campaigns],
          ["Unique fingerprints", stats.fingerprints],
          ["Reviewed clusters", stats.reviewed],
          ["Cross-domain families", stats.crossDomain],
        ].map(([label, value]) => (
          <Card key={label as string} className="glass-panel border-cyan-400/15">
            <CardHeader className="gap-1">
              <CardDescription className="text-slate-300">{label as string}</CardDescription>
              <CardTitle className="text-3xl text-cyan-100">{String(value)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {(message || error) && (
        <p className={`rounded-md border px-3 py-2 text-sm ${error ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-green-400/30 bg-green-400/10 text-green-100"}`}>
          {error || message}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-background/35">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-border text-slate-300">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Domains and evidence</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Review verdict</th>
              <th className="px-4 py-3">Label</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orderedCampaigns.map((campaign) => {
              const domains = stringList(campaign.domains)
              const behaviors = [...new Set(campaign.fingerprints.flatMap((fingerprint) => stringList(fingerprint.behaviorFlags)))].slice(0, 5)
              return (
                <tr key={campaign.id} className="border-b border-border/70 align-top last:border-0">
                  <td className="px-4 py-4">
                    <p className="font-mono text-xs text-cyan-200">{campaign.clusterKey.slice(0, 14)}...</p>
                    <p className="mt-1 text-xs text-slate-400">{campaign.sampleCount} observations · {campaign.domainCount} domains</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(campaign.lastSeenAt).toLocaleString()}</p>
                  </td>
                  <td className="max-w-md px-4 py-4">
                    <p className="break-words font-medium text-white">{domains.slice(0, 5).join(", ") || "No domain snapshot"}</p>
                    <p className="mt-2 text-xs text-slate-400">{behaviors.join(" · ") || "No static behavior flags"}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-slate-200">
                      <ShieldAlert className="size-3.5" /> {campaign.strongestRisk}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <select
                      aria-label={`Verdict for ${campaign.clusterKey}`}
                      className={`rounded-md border px-2 py-2 text-xs ${verdictTone(campaign.verdict)}`}
                      value={campaign.verdict}
                      onChange={(event) => updateLocal(campaign.id, { verdict: event.target.value as DnaVerdict })}
                    >
                      <option value="UNKNOWN">UNKNOWN</option>
                      <option value="SUSPICIOUS">SUSPICIOUS</option>
                      <option value="KNOWN_BAD">KNOWN BAD</option>
                    </select>
                  </td>
                  <td className="px-4 py-4">
                    <Input
                      className="min-w-48"
                      aria-label={`Label for ${campaign.clusterKey}`}
                      placeholder="Campaign label"
                      value={campaign.label ?? ""}
                      onChange={(event) => updateLocal(campaign.id, { label: event.target.value })}
                    />
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Button size="sm" type="button" onClick={() => void save(campaign)} disabled={savingId === campaign.id}>
                      {savingId === campaign.id ? <Loader2 className="animate-spin" /> : <Save />} Save
                    </Button>
                  </td>
                </tr>
              )
            })}
            {!orderedCampaigns.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  {loading ? "Loading Scam DNA campaigns..." : "No URL fingerprints yet. Run a deep URL scan to create the first cluster."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
