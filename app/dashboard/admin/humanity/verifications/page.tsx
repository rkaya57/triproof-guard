"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, RefreshCw, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type VerificationRow = {
  id: string
  campaignName: string
  walletAddress: string
  walletChain: string | null
  decision: string
  humanSessionScore: number
  reasonCodes: unknown
  signatureVerified: boolean
  createdAt: string
  proofExpiresAt: string
}

function decisionClass(decision: string) {
  if (decision === "APPROVED") return "border-green-400/30 text-green-200"
  if (decision === "MANUAL_REVIEW") return "border-yellow-400/30 text-yellow-200"
  return "border-red-400/30 text-red-200"
}

function shortWallet(wallet: string) {
  return wallet.length > 14 ? `${wallet.slice(0, 6)}...${wallet.slice(-6)}` : wallet
}

async function fetchVerificationRows(filter: string) {
  const params = filter === "ALL" ? "" : `?decision=${filter}`
  const res = await fetch(`/api/humanity/admin/verifications${params}`, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? "Could not load verifications")
  return (data.verifications ?? []) as VerificationRow[]
}

export default function HumanityVerificationsPage() {
  const [rows, setRows] = useState<VerificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("ALL")

  async function loadRows() {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchVerificationRows(filter))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load verifications")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadFilteredRows() {
      await Promise.resolve()
      if (cancelled) return
      setLoading(true)
      setError(null)
      try {
        const nextRows = await fetchVerificationRows(filter)
        if (!cancelled) setRows(nextRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load verifications")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadFilteredRows()
    return () => {
      cancelled = true
    }
  }, [filter])

  function downloadCsv(decision: string) {
    const params = new URLSearchParams({ format: "csv" })
    if (decision !== "ALL") params.set("decision", decision)
    window.location.href = `/api/humanity/admin/verifications?${params.toString()}`
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="border-purple-400/30 bg-purple-400/10 text-purple-100">Humanity Gate</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-cyan-100">Admin-only records</Badge>
        </div>
        <h1 className="text-gradient text-4xl font-semibold sm:text-5xl">Humanity verifications</h1>
        <p className="mt-4 max-w-3xl text-slate-300">Review derived-score verification results stored by the admin-only Humanity Gate sandbox.</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/dashboard/admin/humanity" className={`${buttonVariants({ variant: "outline" })} text-white`}><ArrowLeft data-icon="inline-start" /> Humanity Lab</Link>
          <Link href="/dashboard/admin/humanity/demo" className={`${buttonVariants()} glow-primary`}>Open Demo</Link>
          <button onClick={() => void loadRows()} className={buttonVariants({ variant: "outline" })}><RefreshCw data-icon="inline-start" /> Refresh</button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</div>}

      <Card className="glass-panel premium-card animated-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white"><ShieldCheck className="text-primary" /> Verification table</CardTitle>
          <CardDescription className="text-slate-300">Filter and export Humanity Gate results.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'APPROVED', 'MANUAL_REVIEW', 'REJECTED'].map((item) => (
              <button key={item} onClick={() => setFilter(item)} className={`${buttonVariants({ variant: filter === item ? "secondary" : "outline" })} text-white`}>{item.replace('_', ' ')}</button>
            ))}
            <button onClick={() => downloadCsv(filter)} className={`${buttonVariants({ variant: "outline" })} ml-auto text-white`}><Download data-icon="inline-start" /> Export CSV</button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-background/60 text-slate-300">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Decision</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Signature</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Reasons</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-300">Loading...</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-300">No verifications yet.</td></tr>
                )}
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-primary/5">
                    <td className="px-4 py-3 font-medium text-white">{row.campaignName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-cyan-200" title={row.walletAddress}>{shortWallet(row.walletAddress)}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className={decisionClass(row.decision)}>{row.decision.replace('_', ' ')}</Badge></td>
                    <td className="px-4 py-3 text-slate-300">{Math.round(row.humanSessionScore)}</td>
                    <td className="px-4 py-3 text-slate-300">{row.signatureVerified ? 'Verified' : 'Not signed'}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{JSON.stringify(row.reasonCodes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
