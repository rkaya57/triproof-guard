"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, XCircle } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

export function HumanityV2AdminCampaignCreator() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [challengeLevel, setChallengeLevel] = useState("STANDARD")
  const [proofExpiresInDays, setProofExpiresInDays] = useState(30)
  const [maxAttemptsPerWallet, setMaxAttemptsPerWallet] = useState(3)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function updateName(value: string) {
    setName(value)
    setSlug((current) => current === "" || current === slugify(name) ? slugify(value) : current)
  }

  async function createCampaign() {
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch("/api/humanity/v2/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          challengeLevel,
          proofExpiresInDays,
          maxAttemptsPerWallet,
          humanityGateEnabled: true,
        }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error ?? "Could not create Humanity V2 campaign")
      setName("")
      setSlug("")
      setChallengeLevel("STANDARD")
      setProofExpiresInDays(30)
      setMaxAttemptsPerWallet(3)
      setOpen(false)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create Humanity V2 campaign")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ size: "sm" })}><Plus className="size-4" /> New Humanity campaign</button>
  }

  return (
    <div className="w-full rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="font-medium text-white">Create Humanity V2 campaign</p><p className="mt-1 text-xs text-slate-400">New campaigns are enabled immediately but browser telemetry remains review-only.</p></div>
        <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "ghost", size: "sm" })}>Close</button>
      </div>
      {error ? <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-300/[0.04] p-3 text-xs text-rose-100"><XCircle className="mr-2 inline size-3.5" />{error}</div> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="grid gap-2 text-xs text-slate-400 xl:col-span-2">Name<input value={name} onChange={(event) => updateName(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300/40" placeholder="Genesis Humanity Pilot" /></label>
        <label className="grid gap-2 text-xs text-slate-400">Slug<input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 font-mono text-sm text-white outline-none focus:border-cyan-300/40" placeholder="genesis-humanity-pilot" /></label>
        <label className="grid gap-2 text-xs text-slate-400">Challenge<select value={challengeLevel} onChange={(event) => setChallengeLevel(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300/40"><option value="BASIC">Basic</option><option value="STANDARD">Standard</option><option value="STRICT">Strict</option></select></label>
        <label className="grid gap-2 text-xs text-slate-400">Attempts<input type="number" min={1} max={10} value={maxAttemptsPerWallet} onChange={(event) => setMaxAttemptsPerWallet(Number(event.target.value))} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label>
        <label className="grid gap-2 text-xs text-slate-400">Proof days<input type="number" min={1} max={365} value={proofExpiresInDays} onChange={(event) => setProofExpiresInDays(Number(event.target.value))} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300/40" /></label>
      </div>
      <div className="mt-4 flex justify-end"><button type="button" onClick={createCampaign} disabled={submitting || name.trim().length < 3 || slug.length < 3} className={buttonVariants()}>{submitting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create campaign</button></div>
    </div>
  )
}
